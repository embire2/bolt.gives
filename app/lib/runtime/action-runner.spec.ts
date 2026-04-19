import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { FileMap } from '~/lib/stores/files';
import { ActionRunner } from './action-runner';
import type { ActionCallbackData } from './message-parser';

const hostedRuntimeMocks = vi.hoisted(() => ({
  isHostedRuntimeEnabled: vi.fn(() => false),
  syncHostedRuntimeWorkspace: vi.fn().mockResolvedValue(undefined),
  runHostedRuntimeCommand: vi.fn().mockResolvedValue({ exitCode: 0, output: 'ok' }),
}));

vi.mock('./hosted-runtime-client', () => hostedRuntimeMocks);

function createRunnerHarness() {
  const executeCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: 'ok' });
  const ready = vi.fn().mockResolvedValue(undefined);
  const onStepRunnerEvent = vi.fn();
  const shell = {
    ready,
    terminal: {},
    process: {},
    executeCommand,
  };
  const webcontainer = Promise.resolve({
    workdir: '/home/project',
    fs: {
      readFile: vi.fn().mockResolvedValue('{}'),
      readdir: vi.fn().mockResolvedValue([]),
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
    },
  });

  const runner = new ActionRunner(
    webcontainer as any,
    () => shell as any,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    onStepRunnerEvent,
  );

  return { runner, shell, executeCommand, onStepRunnerEvent };
}

describe('ActionRunner start actions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    hostedRuntimeMocks.isHostedRuntimeEnabled.mockReturnValue(false);
    hostedRuntimeMocks.syncHostedRuntimeWorkspace.mockResolvedValue(undefined);
    hostedRuntimeMocks.runHostedRuntimeCommand.mockResolvedValue({ exitCode: 0, output: 'ok' });
  });

  it('normalizes prefixed start commands before execution', async () => {
    const { runner, executeCommand } = createRunnerHarness();
    const actionData: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId: 'action-1',
      action: {
        type: 'start',
        content: 'Run shell command: pnpm run dev',
      } as any,
    };

    runner.addAction(actionData);

    const runPromise = runner.runAction(actionData);

    await vi.advanceTimersByTimeAsync(2200);

    await runPromise;

    expect(executeCommand).toHaveBeenCalledTimes(1);
    expect(executeCommand.mock.calls[0][1]).toBe('pnpm run dev');
    expect(runner.actions.get()['action-1']?.status).toBe('complete');
  });

  it('emits interactive step events for start actions', async () => {
    const { runner, onStepRunnerEvent } = createRunnerHarness();
    const actionData: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId: 'action-2',
      action: {
        type: 'start',
        content: 'pnpm run dev',
      } as any,
    };

    runner.addAction(actionData);

    const runPromise = runner.runAction(actionData);

    await vi.advanceTimersByTimeAsync(2200);
    await runPromise;

    const eventTypes = onStepRunnerEvent.mock.calls.map(([event]) => event.type);

    expect(eventTypes).toContain('step-start');
    expect(eventTypes).toContain('step-end');
    expect(eventTypes).toContain('complete');
  });

  it('blocks shell redirection and keeps file writes out of shell commands', async () => {
    const executeCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: 'ok' });
    const onAlert = vi.fn();
    const runner = new ActionRunner(
      Promise.resolve({
        workdir: '/home/project',
        fs: {
          readFile: vi.fn().mockResolvedValue('{}'),
          readdir: vi.fn().mockResolvedValue([]),
          mkdir: vi.fn().mockResolvedValue(undefined),
          writeFile: vi.fn().mockResolvedValue(undefined),
        },
      }) as any,
      () =>
        ({
          ready: vi.fn().mockResolvedValue(undefined),
          terminal: {},
          process: {},
          executeCommand,
        }) as any,
      undefined,
      undefined,
      undefined,
      onAlert,
    );

    const actionData: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId: 'action-blocked-shell-1',
      action: {
        type: 'shell',
        content: 'echo "blocked" > src/App.tsx',
      } as any,
    };

    runner.addAction(actionData);
    await runner.runAction(actionData);

    expect(executeCommand).not.toHaveBeenCalled();
    expect(onAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Blocked Shell Mutation',
      }),
    );
  });

  it('writes file actions using canonical workdir-relative paths', async () => {
    const executeCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: 'ok' });
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const mkdir = vi.fn().mockResolvedValue(undefined);
    const shell = {
      ready: vi.fn().mockResolvedValue(undefined),
      terminal: {},
      process: {},
      executeCommand,
    };
    const webcontainer = Promise.resolve({
      workdir: '/home/project',
      fs: {
        readFile: vi.fn().mockResolvedValue('{}'),
        readdir: vi.fn().mockResolvedValue([]),
        mkdir,
        writeFile,
      },
    });

    const runner = new ActionRunner(webcontainer as any, () => shell as any);
    const actionData: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId: 'file-1',
      action: {
        type: 'file',
        filePath: '/home/project/src/App.jsx',
        content: 'export default function App() { return null; }',
      } as any,
    };

    runner.addAction(actionData);
    await runner.runAction(actionData);

    expect(mkdir).toHaveBeenCalledWith('src', { recursive: true });
    expect(writeFile).toHaveBeenCalledWith('src/App.jsx', 'export default function App() { return null; }');
  });

  it('rewrites generated JavaScript entry files onto the active TypeScript starter file', async () => {
    const executeCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: 'ok' });
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const mkdir = vi.fn().mockResolvedValue(undefined);
    const shell = {
      ready: vi.fn().mockResolvedValue(undefined),
      terminal: {},
      process: {},
      executeCommand,
    };
    const webcontainer = Promise.resolve({
      workdir: '/home/project',
      fs: {
        readFile: vi.fn().mockResolvedValue('{}'),
        readdir: vi.fn().mockResolvedValue([]),
        mkdir,
        writeFile,
      },
    });

    const runner = new ActionRunner(
      webcontainer as any,
      () => shell as any,
      () =>
        ({
          '/home/project/src/App.tsx': {
            type: 'file',
            content: 'fallback starter',
            isBinary: false,
          } as any,
        }) satisfies FileMap,
    );
    const actionData: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId: 'file-1b',
      action: {
        type: 'file',
        filePath: '/home/project/src/App.js',
        content: 'export default function App() { return <main>real app</main>; }',
      } as any,
    };

    runner.addAction(actionData);
    await runner.runAction(actionData);

    expect(writeFile).toHaveBeenCalledWith(
      'src/App.tsx',
      'export default function App() { return <main>real app</main>; }',
    );
  });

  it('batches hosted file syncs for touched files instead of pushing a full snapshot on each write', async () => {
    hostedRuntimeMocks.isHostedRuntimeEnabled.mockReturnValue(true);

    const writeFile = vi.fn().mockResolvedValue(undefined);
    const runner = new ActionRunner(
      Promise.resolve({
        workdir: '/home/project',
        fs: {
          readFile: vi.fn().mockResolvedValue('{}'),
          readdir: vi.fn().mockResolvedValue([]),
          mkdir: vi.fn().mockResolvedValue(undefined),
          writeFile,
        },
      }) as any,
      () =>
        ({
          ready: vi.fn().mockResolvedValue(undefined),
          terminal: {},
          process: {},
          executeCommand: vi.fn(),
        }) as any,
      () =>
        ({
          '/home/project/package.json': {
            type: 'file',
            content: '{"name":"runtime-test"}',
            isBinary: false,
          } as any,
          '/home/project/src/App.jsx': {
            type: 'file',
            content: 'stale',
            isBinary: false,
          } as any,
        }) satisfies FileMap,
      undefined,
      'shared-session-file-1',
    );

    const actionData: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId: 'file-hosted-only-1',
      action: {
        type: 'file',
        filePath: '/home/project/src/App.jsx',
        content: 'export default function App() { return <main>hosted</main>; }',
      } as any,
    };

    runner.addAction(actionData);
    await runner.runAction(actionData);

    expect(hostedRuntimeMocks.syncHostedRuntimeWorkspace).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(ActionRunner.HOSTED_FILE_FLUSH_DEBOUNCE_MS + 25);

    expect(hostedRuntimeMocks.syncHostedRuntimeWorkspace).toHaveBeenCalledWith({
      sessionId: 'shared-session-file-1',
      prune: false,
      files: {
        '/home/project/src/App.jsx': {
          type: 'file',
          content: 'export default function App() { return <main>hosted</main>; }',
          isBinary: false,
        },
      },
    });
  });

  it('still syncs hosted file content when only the browser snapshot has the latest content', async () => {
    hostedRuntimeMocks.isHostedRuntimeEnabled.mockReturnValue(true);

    const writeFile = vi.fn().mockResolvedValue(undefined);
    const runner = new ActionRunner(
      Promise.resolve({
        workdir: '/home/project',
        fs: {
          readFile: vi.fn().mockResolvedValue('{}'),
          readdir: vi.fn().mockResolvedValue([]),
          mkdir: vi.fn().mockResolvedValue(undefined),
          writeFile,
        },
      }) as any,
      () =>
        ({
          ready: vi.fn().mockResolvedValue(undefined),
          terminal: {},
          process: {},
          executeCommand: vi.fn(),
        }) as any,
      () =>
        ({
          '/home/project/src/App.jsx': {
            type: 'file',
            content: 'export default function App() { return <main>same</main>; }',
            isBinary: false,
          } as any,
        }) satisfies FileMap,
      undefined,
      'shared-session-file-browser-only',
    );

    const actionData: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId: 'file-hosted-browser-only-1',
      action: {
        type: 'file',
        filePath: '/home/project/src/App.jsx',
        content: 'export default function App() { return <main>same</main>; }',
      } as any,
    };

    runner.addAction(actionData);
    await runner.runAction(actionData);

    expect(writeFile).toHaveBeenCalledWith(
      'src/App.jsx',
      'export default function App() { return <main>same</main>; }',
    );
    expect(hostedRuntimeMocks.syncHostedRuntimeWorkspace).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(ActionRunner.HOSTED_FILE_FLUSH_DEBOUNCE_MS + 25);

    expect(hostedRuntimeMocks.syncHostedRuntimeWorkspace).toHaveBeenCalledWith({
      sessionId: 'shared-session-file-browser-only',
      prune: false,
      files: {
        '/home/project/src/App.jsx': {
          type: 'file',
          content: 'export default function App() { return <main>same</main>; }',
          isBinary: false,
        },
      },
    });
  });

  it('skips hosted file sync after the same content was already flushed to the server workspace', async () => {
    hostedRuntimeMocks.isHostedRuntimeEnabled.mockReturnValue(true);

    const writeFile = vi.fn().mockResolvedValue(undefined);
    const runner = new ActionRunner(
      Promise.resolve({
        workdir: '/home/project',
        fs: {
          readFile: vi.fn().mockResolvedValue('{}'),
          readdir: vi.fn().mockResolvedValue([]),
          mkdir: vi.fn().mockResolvedValue(undefined),
          writeFile,
        },
      }) as any,
      () =>
        ({
          ready: vi.fn().mockResolvedValue(undefined),
          terminal: {},
          process: {},
          executeCommand: vi.fn(),
        }) as any,
      () =>
        ({
          '/home/project/src/App.jsx': {
            type: 'file',
            content: 'export default function App() { return <main>same</main>; }',
            isBinary: false,
          } as any,
        }) satisfies FileMap,
      undefined,
      'shared-session-file-unchanged',
    );

    const firstAction: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId: 'file-hosted-unchanged-1',
      action: {
        type: 'file',
        filePath: '/home/project/src/App.jsx',
        content: 'export default function App() { return <main>same</main>; }',
      } as any,
    };
    const secondAction: ActionCallbackData = {
      ...firstAction,
      actionId: 'file-hosted-unchanged-2',
    };

    runner.addAction(firstAction);
    await runner.runAction(firstAction);
    await vi.advanceTimersByTimeAsync(ActionRunner.HOSTED_FILE_FLUSH_DEBOUNCE_MS + 25);

    hostedRuntimeMocks.syncHostedRuntimeWorkspace.mockClear();
    writeFile.mockClear();

    runner.addAction(secondAction);
    await runner.runAction(secondAction);

    expect(writeFile).not.toHaveBeenCalled();
    expect(hostedRuntimeMocks.syncHostedRuntimeWorkspace).not.toHaveBeenCalled();
  });

  it('flushes only the latest streamed hosted file content once after the debounce window', async () => {
    hostedRuntimeMocks.isHostedRuntimeEnabled.mockReturnValue(true);

    const writeFile = vi.fn().mockResolvedValue(undefined);
    const runner = new ActionRunner(
      Promise.resolve({
        workdir: '/home/project',
        fs: {
          readFile: vi.fn().mockResolvedValue('{}'),
          readdir: vi.fn().mockResolvedValue([]),
          mkdir: vi.fn().mockResolvedValue(undefined),
          writeFile,
        },
      }) as any,
      () =>
        ({
          ready: vi.fn().mockResolvedValue(undefined),
          terminal: {},
          process: {},
          executeCommand: vi.fn(),
        }) as any,
      () =>
        ({
          '/home/project/src/App.jsx': {
            type: 'file',
            content: 'stale',
            isBinary: false,
          } as any,
        }) satisfies FileMap,
      undefined,
      'shared-session-stream-batch',
    );

    const actionData: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId: 'file-hosted-stream-1',
      action: {
        type: 'file',
        filePath: '/home/project/src/App.jsx',
        content: 'export default function App() { return <main>initial</main>; }',
      } as any,
    };

    runner.addAction(actionData);
    await runner.runAction(actionData, true);
    await runner.runAction(
      {
        ...actionData,
        action: {
          ...actionData.action,
          content: 'export default function App() { return <main>latest</main>; }',
        } as any,
      },
      true,
    );

    expect(hostedRuntimeMocks.syncHostedRuntimeWorkspace).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(ActionRunner.HOSTED_FILE_FLUSH_DEBOUNCE_MS + 25);

    expect(hostedRuntimeMocks.syncHostedRuntimeWorkspace).toHaveBeenCalledTimes(1);
    expect(hostedRuntimeMocks.syncHostedRuntimeWorkspace).toHaveBeenCalledWith({
      sessionId: 'shared-session-stream-batch',
      prune: false,
      files: {
        '/home/project/src/App.jsx': {
          type: 'file',
          content: 'export default function App() { return <main>latest</main>; }',
          isBinary: false,
        },
      },
    });
  });

  it('reuses the provided hosted runtime session across sync and command calls', async () => {
    hostedRuntimeMocks.isHostedRuntimeEnabled.mockReturnValue(true);

    const files: FileMap = {
      '/home/project/package.json': {
        type: 'file',
        content: '{"name":"runtime-test"}',
        isBinary: false,
      } as any,
    };
    const hostedRunner = new ActionRunner(
      Promise.resolve({
        workdir: '/home/project',
        fs: {
          readFile: vi.fn().mockResolvedValue('{}'),
          readdir: vi.fn().mockResolvedValue([]),
          mkdir: vi.fn().mockResolvedValue(undefined),
          writeFile: vi.fn().mockResolvedValue(undefined),
        },
      }) as any,
      () =>
        ({
          ready: vi.fn().mockResolvedValue(undefined),
          terminal: {},
          process: {},
          executeCommand: vi.fn(),
        }) as any,
      () => files,
      undefined,
      'shared-session-1',
      undefined,
      undefined,
      undefined,
      vi.fn(),
    );

    const actionData: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId: 'action-hosted-1',
      action: {
        type: 'start',
        content: 'pnpm run dev',
      } as any,
    };

    hostedRunner.addAction(actionData);

    const runPromise = hostedRunner.runAction(actionData);
    await vi.advanceTimersByTimeAsync(2200);
    await runPromise;

    expect(hostedRuntimeMocks.syncHostedRuntimeWorkspace).toHaveBeenCalledWith({
      sessionId: 'shared-session-1',
      files,
      prune: true,
    });
    expect(hostedRuntimeMocks.runHostedRuntimeCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'shared-session-1',
        command: 'pnpm run dev',
        kind: 'start',
      }),
    );
  });

  it('only performs the initial hosted snapshot sync once when no local files changed', async () => {
    hostedRuntimeMocks.isHostedRuntimeEnabled.mockReturnValue(true);

    const files: FileMap = {
      '/home/project/package.json': {
        type: 'file',
        content: '{"name":"runtime-test"}',
        isBinary: false,
      } as any,
    };
    const runner = new ActionRunner(
      Promise.resolve({
        workdir: '/home/project',
        fs: {
          readFile: vi.fn().mockResolvedValue('{}'),
          readdir: vi.fn().mockResolvedValue([]),
          mkdir: vi.fn().mockResolvedValue(undefined),
          writeFile: vi.fn().mockResolvedValue(undefined),
        },
      }) as any,
      () =>
        ({
          ready: vi.fn().mockResolvedValue(undefined),
          terminal: {},
          process: {},
          executeCommand: vi.fn(),
        }) as any,
      () => files,
      undefined,
      'shared-session-shell-once',
      undefined,
      undefined,
      undefined,
      vi.fn(),
    );

    const firstAction: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId: 'action-hosted-shell-1',
      action: {
        type: 'shell',
        content: 'pnpm install',
      } as any,
    };
    const secondAction: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId: 'action-hosted-shell-2',
      action: {
        type: 'start',
        content: 'pnpm run dev',
      } as any,
    };

    runner.addAction(firstAction);
    runner.addAction(secondAction);

    const firstRun = runner.runAction(firstAction);
    await vi.advanceTimersByTimeAsync(2200);
    await firstRun;

    const secondRun = runner.runAction(secondAction);
    await vi.advanceTimersByTimeAsync(2200);
    await secondRun;

    expect(hostedRuntimeMocks.syncHostedRuntimeWorkspace).toHaveBeenCalledTimes(1);
    expect(hostedRuntimeMocks.runHostedRuntimeCommand).toHaveBeenCalledTimes(2);
  });

  it('flushes pending hosted file changes before executing a shell command', async () => {
    hostedRuntimeMocks.isHostedRuntimeEnabled.mockReturnValue(true);

    const runner = new ActionRunner(
      Promise.resolve({
        workdir: '/home/project',
        fs: {
          readFile: vi.fn().mockResolvedValue('{}'),
          readdir: vi.fn().mockResolvedValue([]),
          mkdir: vi.fn().mockResolvedValue(undefined),
          writeFile: vi.fn().mockResolvedValue(undefined),
        },
      }) as any,
      () =>
        ({
          ready: vi.fn().mockResolvedValue(undefined),
          terminal: {},
          process: {},
          executeCommand: vi.fn(),
        }) as any,
      () =>
        ({
          '/home/project/package.json': {
            type: 'file',
            content: '{"name":"runtime-test"}',
            isBinary: false,
          } as any,
          '/home/project/src/App.jsx': {
            type: 'file',
            content: 'stale',
            isBinary: false,
          } as any,
        }) satisfies FileMap,
      undefined,
      'shared-session-command-flush',
      undefined,
      undefined,
      undefined,
      vi.fn(),
    );

    const fileAction: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId: 'file-hosted-before-shell',
      action: {
        type: 'file',
        filePath: '/home/project/src/App.jsx',
        content: 'export default function App() { return <main>batched</main>; }',
      } as any,
    };
    const shellAction: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId: 'shell-hosted-after-file',
      action: {
        type: 'shell',
        content: 'pnpm install',
      } as any,
    };

    runner.addAction(fileAction);
    await runner.runAction(fileAction);

    expect(hostedRuntimeMocks.syncHostedRuntimeWorkspace).not.toHaveBeenCalled();

    runner.addAction(shellAction);

    const shellRun = runner.runAction(shellAction);
    await vi.advanceTimersByTimeAsync(2200);
    await shellRun;

    expect(hostedRuntimeMocks.syncHostedRuntimeWorkspace).toHaveBeenNthCalledWith(1, {
      sessionId: 'shared-session-command-flush',
      files: {
        '/home/project/package.json': {
          type: 'file',
          content: '{"name":"runtime-test"}',
          isBinary: false,
        },
        '/home/project/src/App.jsx': {
          type: 'file',
          content: 'stale',
          isBinary: false,
        },
      },
      prune: true,
    });
    expect(hostedRuntimeMocks.syncHostedRuntimeWorkspace).toHaveBeenNthCalledWith(2, {
      sessionId: 'shared-session-command-flush',
      prune: false,
      files: {
        '/home/project/src/App.jsx': {
          type: 'file',
          content: 'export default function App() { return <main>batched</main>; }',
          isBinary: false,
        },
      },
    });
  });

  it('keeps hosted start actions in order so later file writes wait for preview readiness', async () => {
    vi.useRealTimers();

    hostedRuntimeMocks.isHostedRuntimeEnabled.mockReturnValue(true);

    let resolveHostedStart: ((value: { exitCode: number; output: string }) => void) | undefined;
    hostedRuntimeMocks.runHostedRuntimeCommand.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveHostedStart = resolve;
        }),
    );

    const writeFile = vi.fn().mockResolvedValue(undefined);
    const runner = new ActionRunner(
      Promise.resolve({
        workdir: '/home/project',
        fs: {
          readFile: vi.fn().mockResolvedValue('{}'),
          readdir: vi.fn().mockResolvedValue([]),
          mkdir: vi.fn().mockResolvedValue(undefined),
          writeFile,
        },
      }) as any,
      () =>
        ({
          ready: vi.fn().mockResolvedValue(undefined),
          terminal: {},
          process: {},
          executeCommand: vi.fn(),
        }) as any,
      () => ({
        '/home/project/package.json': {
          type: 'file',
          content: '{"name":"runtime-test"}',
          isBinary: false,
        } as any,
      }),
      undefined,
      'shared-session-2',
    );

    const startAction: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId: 'start-hosted-1',
      action: {
        type: 'start',
        content: 'pnpm run dev',
      } as any,
    };
    const fileAction: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId: 'file-hosted-1',
      action: {
        type: 'file',
        filePath: '/home/project/src/App.jsx',
        content: 'export default function App() { return <main>ready</main>; }',
      } as any,
    };

    runner.addAction(startAction);

    const startPromise = runner.runAction(startAction);

    for (let attempt = 0; attempt < 20 && !resolveHostedStart; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    expect(resolveHostedStart).toBeTypeOf('function');

    runner.addAction(fileAction);

    const filePromise = runner.runAction(fileAction);

    await Promise.resolve();
    await Promise.resolve();

    expect(writeFile).not.toHaveBeenCalled();

    resolveHostedStart?.({ exitCode: 0, output: 'preview ready' });

    await startPromise;
    await filePromise;

    expect(writeFile).toHaveBeenCalledWith(
      'src/App.jsx',
      'export default function App() { return <main>ready</main>; }',
    );
  });

  it('bumps the hosted preview revision after syncing new files into a running preview', async () => {
    hostedRuntimeMocks.isHostedRuntimeEnabled.mockReturnValue(true);

    const previewUpdates = vi.fn();
    const writeFile = vi.fn().mockResolvedValue(undefined);

    hostedRuntimeMocks.runHostedRuntimeCommand.mockImplementation(async ({ onEvent }) => {
      onEvent?.({
        type: 'ready',
        preview: {
          port: 4100,
          baseUrl: 'https://alpha1.bolt.gives/runtime/preview/session-1/4100',
        },
      });

      return { exitCode: 0, output: 'preview ready' };
    });

    const runner = new ActionRunner(
      Promise.resolve({
        workdir: '/home/project',
        fs: {
          readFile: vi.fn().mockResolvedValue('{}'),
          readdir: vi.fn().mockResolvedValue([]),
          mkdir: vi.fn().mockResolvedValue(undefined),
          writeFile,
        },
      }) as any,
      () =>
        ({
          ready: vi.fn().mockResolvedValue(undefined),
          terminal: {},
          process: {},
          executeCommand: vi.fn(),
        }) as any,
      () =>
        ({
          '/home/project/package.json': {
            type: 'file',
            content: '{"name":"runtime-test"}',
            isBinary: false,
          } as any,
        }) satisfies FileMap,
      previewUpdates,
      'shared-session-preview-refresh',
    );

    const startAction: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId: 'start-hosted-preview-refresh',
      action: {
        type: 'start',
        content: 'pnpm run dev',
      } as any,
    };
    const fileAction: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId: 'file-hosted-preview-refresh',
      action: {
        type: 'file',
        filePath: '/home/project/src/App.jsx',
        content: 'export default function App() { return <main>fresh preview</main>; }',
      } as any,
    };

    runner.addAction(startAction);
    await runner.runAction(startAction);

    expect(previewUpdates).toHaveBeenLastCalledWith({
      port: 4100,
      baseUrl: 'https://alpha1.bolt.gives/runtime/preview/session-1/4100',
      revision: 0,
    });

    runner.addAction(fileAction);
    await runner.runAction(fileAction);
    await vi.advanceTimersByTimeAsync(ActionRunner.HOSTED_FILE_FLUSH_DEBOUNCE_MS + 25);

    expect(writeFile).toHaveBeenCalledWith(
      'src/App.jsx',
      'export default function App() { return <main>fresh preview</main>; }',
    );
    expect(previewUpdates).toHaveBeenLastCalledWith({
      port: 4100,
      baseUrl: 'https://alpha1.bolt.gives/runtime/preview/session-1/4100',
      revision: 1,
    });
  });
});
