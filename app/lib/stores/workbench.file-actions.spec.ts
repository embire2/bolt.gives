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
    workbenchStore.artifacts.set({});
    workbenchStore.setSelectedFile(undefined);
    workbenchStore.currentView.set('preview');
    workbenchStore.unsavedFiles.set(new Set());
    workbenchStore.clearStepRunnerEvents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    workbenchStore.artifacts.set({});
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
    expect(runAction).toHaveBeenCalledWith(data);
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
});
