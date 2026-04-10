import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionCallbackData } from '~/lib/runtime/message-parser';

vi.mock('~/lib/webcontainer', () => ({
  webcontainer: Promise.resolve({
    on: vi.fn(),
    spawn: vi.fn(),
    setPreviewScript: vi.fn(),
    workdir: '/home/project',
    fs: {
      readFile: vi.fn().mockResolvedValue(''),
      readdir: vi.fn().mockResolvedValue([]),
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
      rm: vi.fn().mockResolvedValue(undefined),
    },
    internal: {
      watchPaths: vi.fn(() => undefined),
    },
  }),
}));

describe('workbenchStore file actions', () => {
  let workbenchStore: typeof import('./workbench').workbenchStore;

  beforeEach(async () => {
    vi.resetModules();
    ({ workbenchStore } = await import('./workbench'));
    workbenchStore.setAutonomyMode('full-auto');
    workbenchStore.artifacts.set({});
    workbenchStore.setSelectedFile(undefined);
    workbenchStore.currentView.set('preview');
    workbenchStore.unsavedFiles.set(new Set());
    workbenchStore.clearStepRunnerEvents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    workbenchStore.artifacts.set({});
    workbenchStore.setAutonomyMode('auto-apply-safe');
    workbenchStore.setSelectedFile(undefined);
    workbenchStore.currentView.set('code');
    workbenchStore.unsavedFiles.set(new Set());
    workbenchStore.clearStepRunnerEvents();
  });

  it('persists unopened file actions through the workspace store before syncing the runner', async () => {
    const runAction = vi.fn().mockResolvedValue(undefined);
    const writeFile = vi.spyOn(workbenchStore, 'writeFile').mockResolvedValue(undefined);
    const saveFile = vi.spyOn(workbenchStore, 'saveFile').mockResolvedValue(undefined);
    const actionId = 'file-action-1';
    const data: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId,
      action: {
        type: 'file',
        filePath: 'src/App.tsx',
        content: 'export default function App() { return null; }',
      } as any,
    };

    workbenchStore.artifacts.set({
      'artifact-1': {
        id: 'artifact-1',
        title: 'Runtime test',
        closed: false,
        runner: {
          actions: {
            get: () => ({
              [actionId]: {
                executed: false,
              },
            }),
          },
          runAction,
        } as any,
      },
    });

    await workbenchStore._runAction(data, false);

    expect(writeFile).toHaveBeenCalledWith('/home/project/src/App.tsx', data.action.content);
    expect(saveFile).not.toHaveBeenCalled();
    expect(runAction).toHaveBeenCalledTimes(1);
    expect(runAction).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactId: 'artifact-1',
        messageId: 'message-1',
        actionId,
        action: expect.objectContaining({
          type: 'file',
          filePath: '/home/project/src/App.tsx',
          content: data.action.content,
        }),
      }),
    );
  });

  it('keeps the preview visible when a ready hosted preview already exists', async () => {
    const runAction = vi.fn().mockResolvedValue(undefined);
    const writeFile = vi.spyOn(workbenchStore, 'writeFile').mockResolvedValue(undefined);
    const actionId = 'file-action-preview-1';
    const data: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId,
      action: {
        type: 'file',
        filePath: 'src/App.tsx',
        content: 'export default function App() { return <main>preview</main>; }',
      } as any,
    };

    workbenchStore.artifacts.set({
      'artifact-1': {
        id: 'artifact-1',
        title: 'Runtime test',
        closed: false,
        runner: {
          actions: {
            get: () => ({
              [actionId]: {
                executed: false,
              },
            }),
          },
          runAction,
        } as any,
      },
    });

    (workbenchStore.previews as any).set([
      {
        port: 4100,
        ready: true,
        baseUrl: 'https://alpha1.bolt.gives/runtime/preview/session/4100',
      },
    ]);

    await workbenchStore._runAction(data, false);

    expect(writeFile).toHaveBeenCalledWith('/home/project/src/App.tsx', data.action.content);
    expect(workbenchStore.currentView.get()).toBe('preview');
    expect(runAction).toHaveBeenCalledTimes(1);
  });

  it('rewrites generated entry-file variants onto the active starter file before persisting and running', async () => {
    const runAction = vi.fn().mockResolvedValue(undefined);
    const writeFile = vi.spyOn(workbenchStore, 'writeFile').mockResolvedValue(undefined);
    const actionId = 'file-action-rewrite-1';
    const data: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId,
      action: {
        type: 'file',
        filePath: 'src/App.js',
        content: 'export default function App() { return <main>real app</main>; }',
      } as any,
    };

    workbenchStore.files.set({
      '/home/project/src/App.tsx': {
        type: 'file',
        content: 'fallback starter',
        isBinary: false,
      },
    } as any);

    workbenchStore.artifacts.set({
      'artifact-1': {
        id: 'artifact-1',
        title: 'Runtime test',
        closed: false,
        runner: {
          actions: {
            get: () => ({
              [actionId]: {
                executed: false,
              },
            }),
          },
          runAction,
        } as any,
      },
    });

    await workbenchStore._runAction(data, false);

    expect(writeFile).toHaveBeenCalledWith(
      '/home/project/src/App.tsx',
      'export default function App() { return <main>real app</main>; }',
    );
    expect(runAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({
          filePath: '/home/project/src/App.tsx',
        }),
      }),
    );
  });

  it('waits for artifact registration before executing queued actions', async () => {
    vi.useFakeTimers();

    try {
      const runAction = vi.fn().mockResolvedValue(undefined);
      const actionId = 'shell-action-1';
      const data: ActionCallbackData = {
        artifactId: 'artifact-delayed',
        messageId: 'message-1',
        actionId,
        action: {
          type: 'shell',
          content: 'pnpm install',
        } as any,
      };

      const executionPromise = workbenchStore._runAction(data, false);

      setTimeout(() => {
        workbenchStore.artifacts.set({
          'artifact-delayed': {
            id: 'artifact-delayed',
            title: 'Delayed artifact',
            closed: false,
            runner: {
              actions: {
                get: () => ({
                  [actionId]: {
                    executed: false,
                  },
                }),
              },
              runAction,
            } as any,
          },
        });
      }, 100);

      await vi.advanceTimersByTimeAsync(200);
      await executionPromise;

      expect(runAction).toHaveBeenCalledTimes(1);
      expect(runAction).toHaveBeenCalledWith(data);
    } finally {
      vi.useRealTimers();
    }
  });

  it('dispatches synthetic runtime handoffs through the queued workbench runner in setup/start order', async () => {
    const runnerActions: Record<string, any> = {};
    const addAction = vi.fn().mockImplementation(async (data: ActionCallbackData) => {
      runnerActions[data.actionId] = {
        executed: false,
      };
    });
    const runAction = vi.fn().mockResolvedValue(undefined);

    workbenchStore.artifacts.set({
      'handoff-message-runtime-handoff': {
        id: 'handoff-message-runtime-handoff',
        title: 'Runtime Handoff',
        closed: false,
        runner: {
          addAction,
          runAction,
          actions: {
            get: () => runnerActions,
          },
        } as any,
      },
    });

    await workbenchStore.dispatchSyntheticRuntimeHandoff({
      handoffId: 'handoff-1',
      messageId: 'handoff-message',
      setupCommand: 'pnpm install',
      startCommand: 'npm run dev',
    });

    expect(addAction).toHaveBeenCalledTimes(2);
    expect(runAction).toHaveBeenCalledTimes(2);
    expect(addAction.mock.calls[0][0]).toMatchObject({
      artifactId: 'handoff-message-runtime-handoff',
      messageId: 'handoff-message',
      action: {
        type: 'shell',
        content: 'pnpm install',
      },
    });
    expect(runAction.mock.calls[0][0]).toMatchObject({
      artifactId: 'handoff-message-runtime-handoff',
      messageId: 'handoff-message',
      action: {
        type: 'shell',
        content: 'pnpm install',
      },
    });
    expect(addAction.mock.calls[1][0]).toMatchObject({
      artifactId: 'handoff-message-runtime-handoff',
      messageId: 'handoff-message',
      action: {
        type: 'start',
        content: 'npm run dev',
      },
    });
    expect(runAction.mock.calls[1][0]).toMatchObject({
      artifactId: 'handoff-message-runtime-handoff',
      messageId: 'handoff-message',
      action: {
        type: 'start',
        content: 'npm run dev',
      },
    });
    expect(workbenchStore.currentView.get()).toBe('preview');
    expect(workbenchStore.showWorkbench.get()).toBe(true);
  });
});
