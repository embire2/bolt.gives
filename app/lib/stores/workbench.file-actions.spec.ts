import { atom } from 'nanostores';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionCallbackData } from '~/lib/runtime/message-parser';

const webcontainerReadFile = vi.hoisted(() => vi.fn());

vi.mock('./terminal', () => ({
  TerminalStore: class {
    showTerminal = atom(true);
    boltTerminal = {} as any;

    toggleTerminal(value?: boolean) {
      this.showTerminal.set(value !== undefined ? value : !this.showTerminal.get());
    }

    attachTerminal = vi.fn();
    attachBoltTerminal = vi.fn();
    detachTerminal = vi.fn();
    onTerminalResize = vi.fn();
  },
}));

vi.mock('~/lib/webcontainer', () => ({
  webcontainer: Promise.resolve({
    on: vi.fn(),
    spawn: vi.fn().mockResolvedValue({
      input: new WritableStream<string>(),
      output: new ReadableStream<string>({
        start(controller) {
          controller.enqueue('\x1b]654;interactive\x07');
          controller.close();
        },
      }),
      exit: Promise.resolve(0),
      kill: vi.fn(),
    }),
    setPreviewScript: vi.fn(),
    workdir: '/home/project',
    fs: {
      readFile: webcontainerReadFile,
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
    webcontainerReadFile.mockReset();
    webcontainerReadFile.mockRejectedValue(new Error('ENOENT'));
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

  it('updates the canonical hosted runtime session when a newer hosted preview session is synchronized', async () => {
    const initialSessionId = workbenchStore.hostedRuntimeSessionId;

    workbenchStore.syncHostedPreview({
      port: 4100,
      baseUrl: 'https://alpha1.bolt.gives/runtime/preview/session-initial/4100',
    });

    expect(workbenchStore.hostedRuntimeSessionId).toBe('session-initial');

    workbenchStore.syncHostedPreview({
      port: 4101,
      baseUrl: 'https://alpha1.bolt.gives/runtime/preview/session-next/4101',
    });

    expect(workbenchStore.hostedRuntimeSessionId).toBe('session-next');
    expect(workbenchStore.hostedRuntimeSessionId).not.toBe(initialSessionId);

    const previews = workbenchStore.previews.get();
    expect(
      previews.some(
        (preview) => preview.baseUrl === 'https://alpha1.bolt.gives/runtime/preview/session-next/4101' && preview.ready,
      ),
    ).toBe(true);
  });

  it('keeps the preview selected when restoring a snapshot into a workspace with a ready preview', async () => {
    workbenchStore.previews.set([
      {
        port: 4100,
        ready: true,
        baseUrl: 'https://alpha1.bolt.gives/runtime/preview/session-ready/4100',
      },
    ]);

    await workbenchStore.restoreSnapshot({
      '/home/project/src/App.tsx': {
        type: 'file',
        content: 'export default function App() { return <main>ready</main>; }',
        isBinary: false,
      },
    } as any);

    expect(workbenchStore.currentView.get()).toBe('preview');
    expect(workbenchStore.showWorkbench.get()).toBe(true);
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

  it('waits for an in-flight artifact creation promise before executing actions', async () => {
    vi.useFakeTimers();

    try {
      vi.resetModules();

      const runAction = vi.fn().mockResolvedValue(undefined);

      vi.doMock('~/lib/runtime/action-runner', async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));

        return {
          ActionRunner: class {
            actions = {
              get: () => ({
                'shell-action-pending': {
                  executed: false,
                },
              }),
            };

            addAction = vi.fn();
            runAction = runAction;
          },
        };
      });

      const { workbenchStore: delayedWorkbenchStore } = await import('./workbench');
      delayedWorkbenchStore.setAutonomyMode('full-auto');
      delayedWorkbenchStore.artifacts.set({});

      const data: ActionCallbackData = {
        artifactId: 'artifact-pending',
        messageId: 'message-1',
        actionId: 'shell-action-pending',
        action: {
          type: 'shell',
          content: 'pnpm install',
        } as any,
      };

      const addArtifactPromise = delayedWorkbenchStore.addArtifact({
        messageId: 'message-1',
        id: 'artifact-pending',
        title: 'Pending artifact',
        type: 'bundled',
      });
      const executionPromise = delayedWorkbenchStore._runAction(data, false);

      await vi.advanceTimersByTimeAsync(150);
      await addArtifactPromise;
      await executionPromise;

      expect(runAction).toHaveBeenCalledTimes(1);
      expect(runAction).toHaveBeenCalledWith(data);
    } finally {
      vi.useRealTimers();
      vi.doUnmock('~/lib/runtime/action-runner');
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

  it('bootstraps missing Vite manifest files before a synthetic runtime handoff starts a React app', async () => {
    const runnerActions: Record<string, any> = {};
    const addAction = vi.fn().mockImplementation(async (data: ActionCallbackData) => {
      runnerActions[data.actionId] = {
        executed: false,
      };
    });
    const runAction = vi.fn().mockResolvedValue(undefined);
    const writeFile = vi.spyOn(workbenchStore, 'writeFile').mockResolvedValue(undefined);

    workbenchStore.files.set({
      '/home/project/src/App.jsx': {
        type: 'file',
        content: "import { useState } from 'react';\nexport default function App() { return <main>calendar</main>; }\n",
        isBinary: false,
      },
    } as any);
    workbenchStore.artifacts.set({
      'handoff-bootstrap-runtime-handoff': {
        id: 'handoff-bootstrap-runtime-handoff',
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
      handoffId: 'handoff-bootstrap-1',
      messageId: 'handoff-bootstrap',
      setupCommand: 'pnpm install',
      startCommand: 'pnpm run dev',
    });

    const actionTypes = addAction.mock.calls.map(([data]) => data.action.type);
    expect(actionTypes.slice(0, 4)).toEqual(['file', 'file', 'file', 'file']);
    expect(actionTypes.slice(-2)).toEqual(['shell', 'start']);
    expect(writeFile).toHaveBeenCalledWith('/home/project/package.json', expect.stringContaining('"dev": "vite'));
    expect(writeFile).toHaveBeenCalledWith('/home/project/index.html', expect.stringContaining('/src/main.jsx'));
    expect(writeFile).toHaveBeenCalledWith(
      '/home/project/vite.config.js',
      expect.stringContaining('@vitejs/plugin-react'),
    );
    expect(runAction.mock.calls.at(-1)?.[0]).toMatchObject({
      action: {
        type: 'start',
        content: 'pnpm run dev',
      },
    });
  });

  it('bootstraps and installs missing Vite manifest files before a direct start action runs', async () => {
    const runnerActions: Record<string, any> = {
      'start-action-1': {
        executed: false,
      },
    };
    const addAction = vi.fn().mockImplementation(async (data: ActionCallbackData) => {
      runnerActions[data.actionId] = {
        executed: false,
      };
    });
    const runAction = vi.fn().mockImplementation(async (data: ActionCallbackData) => {
      runnerActions[data.actionId] = {
        ...runnerActions[data.actionId],
        executed: true,
      };
    });
    const writeFile = vi.spyOn(workbenchStore, 'writeFile').mockResolvedValue(undefined);

    workbenchStore.files.set({
      '/home/project/src/App.jsx': {
        type: 'file',
        content:
          "import React, { useState } from 'react';\nexport default function App() { return <main>calendar</main>; }\n",
        isBinary: false,
      },
    } as any);
    workbenchStore.artifacts.set({
      'artifact-start': {
        id: 'artifact-start',
        title: 'Runtime test',
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

    await workbenchStore._runAction(
      {
        artifactId: 'artifact-start',
        messageId: 'message-start',
        actionId: 'start-action-1',
        action: {
          type: 'start',
          content: 'pnpm run dev',
        } as any,
      },
      false,
    );

    const runActionTypes = runAction.mock.calls.map(([data]) => data.action.type);
    expect(runActionTypes.slice(0, 4)).toEqual(['file', 'file', 'file', 'file']);
    expect(runActionTypes.slice(-2)).toEqual(['shell', 'start']);
    expect(runAction.mock.calls.at(-2)?.[0]).toMatchObject({
      action: {
        type: 'shell',
        content: 'pnpm install --reporter=append-only --no-frozen-lockfile',
      },
    });
    expect(writeFile).toHaveBeenCalledWith('/home/project/package.json', expect.stringContaining('"dev": "vite'));
    expect(writeFile).toHaveBeenCalledWith('/home/project/index.html', expect.stringContaining('/src/main.jsx'));
    expect(workbenchStore.files.get()['/home/project/package.json']).toMatchObject({
      type: 'file',
      content: expect.stringContaining('"name": "generated-react-app"'),
    });
  });

  it('repairs a React App module missing its default export before starting Vite', async () => {
    const runnerActions: Record<string, any> = {
      'start-action-repair': {
        executed: false,
      },
    };
    const addAction = vi.fn().mockImplementation(async (data: ActionCallbackData) => {
      runnerActions[data.actionId] = {
        executed: false,
      };
    });
    const runAction = vi.fn().mockImplementation(async (data: ActionCallbackData) => {
      runnerActions[data.actionId] = {
        ...runnerActions[data.actionId],
        executed: true,
      };
    });
    const writeFile = vi.spyOn(workbenchStore, 'writeFile').mockResolvedValue(undefined);

    workbenchStore.files.set({
      '/home/project/package.json': {
        type: 'file',
        content: '{"scripts":{"dev":"vite --host 0.0.0.0 --port 5173"}}',
        isBinary: false,
      },
      '/home/project/src/main.jsx': {
        type: 'file',
        content: "import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App.jsx';\n",
        isBinary: false,
      },
      '/home/project/src/App.jsx': {
        type: 'file',
        content: 'export function CalendarApp() { return <main>CAL_token</main>; }\n',
        isBinary: false,
      },
    } as any);
    workbenchStore.artifacts.set({
      'artifact-repair': {
        id: 'artifact-repair',
        title: 'Runtime test',
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

    await workbenchStore._runAction(
      {
        artifactId: 'artifact-repair',
        messageId: 'message-repair',
        actionId: 'start-action-repair',
        action: {
          type: 'start',
          content: 'pnpm run dev',
        } as any,
      },
      false,
    );

    expect(addAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: 'start-action-repair-react-default-export',
        action: expect.objectContaining({
          type: 'file',
          filePath: '/home/project/src/App.jsx',
          content: expect.stringContaining('export default CalendarApp;'),
        }),
      }),
    );
    expect(writeFile).toHaveBeenCalledWith(
      '/home/project/src/App.jsx',
      expect.stringContaining('export default CalendarApp;'),
    );
    expect(runAction.mock.calls.at(-1)?.[0]).toMatchObject({
      action: {
        type: 'start',
        content: 'pnpm run dev',
      },
    });
  });

  it('syncs shell-created Vite files before repairing a commented-out default export', async () => {
    const appContent = [
      'export function CalendarApp() {',
      '  return <main>CAL_token</main>;',
      '}',
      '// export default CalendarApp;',
      '',
    ].join('\n');
    const runtimeFiles: Record<string, string> = {
      'package.json': '{"scripts":{"dev":"vite --host 0.0.0.0 --port 5173"}}',
      'src/main.jsx':
        "import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App.jsx';\n",
      'src/App.jsx': appContent,
    };

    webcontainerReadFile.mockImplementation(async (filePath: string) => {
      if (filePath in runtimeFiles) {
        return runtimeFiles[filePath];
      }

      throw new Error('ENOENT');
    });

    const runnerActions: Record<string, any> = {
      'start-action-shell-repair': {
        executed: false,
      },
    };
    const addAction = vi.fn().mockImplementation(async (data: ActionCallbackData) => {
      runnerActions[data.actionId] = {
        executed: false,
      };
    });
    const runAction = vi.fn().mockImplementation(async (data: ActionCallbackData) => {
      runnerActions[data.actionId] = {
        ...runnerActions[data.actionId],
        executed: true,
      };
    });
    const writeFile = vi.spyOn(workbenchStore, 'writeFile').mockResolvedValue(undefined);

    workbenchStore.files.set({} as any);
    workbenchStore.artifacts.set({
      'artifact-shell-repair': {
        id: 'artifact-shell-repair',
        title: 'Runtime test',
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

    await workbenchStore._runAction(
      {
        artifactId: 'artifact-shell-repair',
        messageId: 'message-shell-repair',
        actionId: 'start-action-shell-repair',
        action: {
          type: 'start',
          content: 'pnpm run dev',
        } as any,
      },
      false,
    );

    expect(addAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: 'start-action-shell-repair-react-default-export',
        action: expect.objectContaining({
          type: 'file',
          filePath: '/home/project/src/App.jsx',
          content: expect.stringContaining('export default CalendarApp;'),
        }),
      }),
    );
    expect(writeFile).toHaveBeenCalledWith(
      '/home/project/src/App.jsx',
      expect.stringContaining('export default CalendarApp;'),
    );
  });

  it('repairs legacy ReactDOM.render entries before starting Vite', async () => {
    const runnerActions: Record<string, any> = {
      'start-action-render-repair': {
        executed: false,
      },
    };
    const addAction = vi.fn().mockImplementation(async (data: ActionCallbackData) => {
      runnerActions[data.actionId] = {
        executed: false,
      };
    });
    const runAction = vi.fn().mockImplementation(async (data: ActionCallbackData) => {
      runnerActions[data.actionId] = {
        ...runnerActions[data.actionId],
        executed: true,
      };
    });
    const writeFile = vi.spyOn(workbenchStore, 'writeFile').mockResolvedValue(undefined);

    workbenchStore.files.set({
      '/home/project/package.json': {
        type: 'file',
        content: '{"scripts":{"dev":"vite --host 0.0.0.0 --port 5173"}}',
        isBinary: false,
      },
      '/home/project/src/main.jsx': {
        type: 'file',
        content:
          "import React from 'react';\nimport ReactDOM from 'react-dom';\nimport App from './App.jsx';\n\nReactDOM.render(<App />, document.getElementById('root'));\n",
        isBinary: false,
      },
      '/home/project/src/App.jsx': {
        type: 'file',
        content: 'export default function App() { return <main>CAL_token</main>; }\n',
        isBinary: false,
      },
    } as any);
    workbenchStore.artifacts.set({
      'artifact-render-repair': {
        id: 'artifact-render-repair',
        title: 'Runtime test',
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

    await workbenchStore._runAction(
      {
        artifactId: 'artifact-render-repair',
        messageId: 'message-render-repair',
        actionId: 'start-action-render-repair',
        action: {
          type: 'start',
          content: 'pnpm run dev',
        } as any,
      },
      false,
    );

    expect(addAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: 'start-action-render-repair-react-dom-create-root',
        action: expect.objectContaining({
          type: 'file',
          filePath: '/home/project/src/main.jsx',
          content: expect.stringContaining("import { createRoot } from 'react-dom/client';"),
        }),
      }),
    );
    expect(writeFile).toHaveBeenCalledWith(
      '/home/project/src/main.jsx',
      expect.stringContaining("createRoot(document.getElementById('root')).render(<App />);"),
    );
    expect(runAction.mock.calls.at(-1)?.[0]).toMatchObject({
      action: {
        type: 'start',
        content: 'pnpm run dev',
      },
    });
  });
});
