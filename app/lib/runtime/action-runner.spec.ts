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

function createRunnerHarness(
  filesSnapshot?: FileMap,
  options?: { runtimeShell?: boolean; readFile?: ReturnType<typeof vi.fn> },
) {
  const executeCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: 'ok' });
  const runtimeExecuteCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: 'runtime ok' });
  const ready = vi.fn().mockResolvedValue(undefined);
  const runtimeReady = vi.fn().mockResolvedValue(undefined);
  const onStepRunnerEvent = vi.fn();
  const onAlert = vi.fn();
  const shell = {
    ready,
    terminal: {},
    process: {},
    executeCommand,
  };
  const runtimeShell = {
    ready: runtimeReady,
    terminal: {},
    process: {},
    executeCommand: runtimeExecuteCommand,
  };
  const webcontainer = Promise.resolve({
    workdir: '/home/project',
    fs: {
      readFile: options?.readFile || vi.fn().mockResolvedValue('{}'),
      readdir: vi.fn().mockResolvedValue([]),
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
    },
  });

  const runner = new ActionRunner(
    webcontainer as any,
    () => shell as any,
    filesSnapshot ? () => filesSnapshot : undefined,
    undefined,
    undefined,
    onAlert,
    undefined,
    undefined,
    onStepRunnerEvent,
    options?.runtimeShell ? () => runtimeShell as any : undefined,
  );

  return { runner, shell, runtimeShell, executeCommand, runtimeExecuteCommand, onAlert, onStepRunnerEvent };
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

    expect(executeCommand).toHaveBeenCalled();
    expect(executeCommand.mock.calls.at(-1)?.[1]).toBe('pnpm run dev');
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

  it('surfaces Vite preview compile errors from local start command output', async () => {
    const { runner, executeCommand, onAlert } = createRunnerHarness();
    executeCommand.mockImplementationOnce(async (_runnerId, _command, _abort, onOutput) => {
      onOutput('  VITE v5.4.0  ready in 200 ms\n');
      onOutput(
        '21:03:58 [vite] Pre-transform error: Transform failed with 1 error:\n/src/App.tsx:12:1: ERROR: Unexpected token\n',
      );

      return {
        exitCode: 0,
        output:
          '  VITE v5.4.0  ready in 200 ms\n21:03:58 [vite] Pre-transform error: Transform failed with 1 error:\n/src/App.tsx:12:1: ERROR: Unexpected token\n',
      };
    });

    const actionData: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId: 'action-start-preview-error',
      action: {
        type: 'start',
        content: 'pnpm run dev',
      } as any,
    };

    runner.addAction(actionData);

    const runPromise = runner.runAction(actionData);

    await vi.advanceTimersByTimeAsync(2200);
    await runPromise;

    expect(onAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        title: 'Preview Error',
        source: 'preview',
      }),
    );
    expect(onAlert.mock.calls.at(-1)?.[0]).toMatchObject({
      description: expect.stringContaining('Pre-transform error'),
    });
  });

  it('runs local start actions on the dedicated runtime shell when one is available', async () => {
    const { runner, executeCommand, runtimeExecuteCommand } = createRunnerHarness(undefined, { runtimeShell: true });
    const actionData: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId: 'action-runtime-shell-start',
      action: {
        type: 'start',
        content: 'pnpm run dev',
      } as any,
    };

    runner.addAction(actionData);

    const runPromise = runner.runAction(actionData);

    await vi.advanceTimersByTimeAsync(2200);
    await runPromise;

    expect(runtimeExecuteCommand).toHaveBeenCalledWith(
      expect.any(String),
      'pnpm run dev',
      expect.any(Function),
      expect.any(Function),
    );
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it('keeps follow-up shell actions on the command shell while the runtime shell keeps the preview process alive', async () => {
    let resolveRuntimeStart: ((value: { exitCode: number; output: string }) => void) | undefined;
    const { runner, executeCommand, runtimeExecuteCommand } = createRunnerHarness(undefined, { runtimeShell: true });

    runtimeExecuteCommand.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRuntimeStart = resolve;
        }),
    );

    const startAction: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId: 'action-runtime-shell-start-pending',
      action: {
        type: 'start',
        content: 'pnpm run dev',
      } as any,
    };
    const shellAction: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId: 'action-command-shell-followup',
      action: {
        type: 'shell',
        content: 'pnpm install --no-frozen-lockfile',
      } as any,
    };

    runner.addAction(startAction);

    const startPromise = runner.runAction(startAction);

    await vi.advanceTimersByTimeAsync(2200);
    await startPromise;

    runner.addAction(shellAction);
    await runner.runAction(shellAction);

    expect(runtimeExecuteCommand).toHaveBeenCalledTimes(1);
    expect(executeCommand).toHaveBeenCalledWith(
      expect.any(String),
      'pnpm install --no-frozen-lockfile --reporter=append-only',
      expect.any(Function),
      expect.any(Function),
    );

    resolveRuntimeStart?.({ exitCode: 0, output: 'preview ready' });
    await vi.runAllTicks();
  });

  it('normalizes preview start commands before execution when the workspace uses Vite', async () => {
    const { runner, executeCommand } = createRunnerHarness({
      '/home/project/package.json': {
        type: 'file',
        content: JSON.stringify({
          scripts: {
            dev: 'vite',
          },
        }),
        isBinary: false,
      } as any,
    });
    const actionData: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId: 'action-2b',
      action: {
        type: 'start',
        content: 'pnpm run dev &',
      } as any,
    };

    runner.addAction(actionData);

    const runPromise = runner.runAction(actionData);

    await vi.advanceTimersByTimeAsync(2200);
    await runPromise;

    expect(executeCommand).toHaveBeenCalled();
    expect(executeCommand.mock.calls.at(-1)?.[1]).toBe('pnpm run dev --host 0.0.0.0 --port 5173');
  });

  it('skips duplicate current-directory scaffolding when source files already exist without a manifest', async () => {
    const readFile = vi.fn(async (filePath: string) => {
      if (filePath === 'src/App.jsx') {
        return 'export default function App() { return <h1>Existing app</h1>; }';
      }

      throw new Error('ENOENT');
    });
    const { runner, executeCommand } = createRunnerHarness(undefined, { readFile });
    const actionData: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId: 'action-skip-duplicate-scaffold',
      action: {
        type: 'shell',
        content: 'pnpm dlx create-vite@latest . --template react',
      } as any,
    };

    runner.addAction(actionData);
    await runner.runAction(actionData);

    expect(executeCommand.mock.calls.at(-1)?.[1]).toContain('Skipping scaffold command');
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

  it('blocks redirection even when hidden inside a JSON command envelope', async () => {
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
      actionId: 'action-blocked-shell-json-1',
      action: {
        type: 'shell',
        content: JSON.stringify({ command: 'echo hidden > src/App.tsx' }),
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

  it('allows benign redirection to /dev/null for shell checks', async () => {
    const { runner, executeCommand } = createRunnerHarness();
    const actionData: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId: 'action-shell-devnull-1',
      action: {
        type: 'shell',
        content: 'ls package.json >/dev/null 2>&1',
      } as any,
    };

    runner.addAction(actionData);
    await runner.runAction(actionData);

    expect(executeCommand).toHaveBeenCalled();
    expect(executeCommand.mock.calls.at(-1)?.[1]).toContain('/dev/null');
    expect(runner.actions.get()['action-shell-devnull-1']?.status).toBe('complete');
  });

  it('rejects file actions that resolve outside the active workdir', async () => {
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
          executeCommand: vi.fn().mockResolvedValue({ exitCode: 0, output: 'ok' }),
        }) as any,
    );

    const actionData: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId: 'file-outside-workdir-1',
      action: {
        type: 'file',
        filePath: '/etc/passwd',
        content: 'blocked',
      } as any,
    };

    runner.addAction(actionData);
    await runner.runAction(actionData);

    expect(writeFile).not.toHaveBeenCalled();
    expect(runner.actions.get()['file-outside-workdir-1']?.status).toBe('failed');
  });

  it('rejects file actions with relative traversal (..) paths', async () => {
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
          executeCommand: vi.fn().mockResolvedValue({ exitCode: 0, output: 'ok' }),
        }) as any,
    );

    const actionData: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId: 'file-outside-workdir-traversal-1',
      action: {
        type: 'file',
        filePath: '../secret.txt',
        content: 'blocked',
      } as any,
    };

    runner.addAction(actionData);
    await runner.runAction(actionData);

    expect(writeFile).not.toHaveBeenCalled();
    expect(runner.actions.get()['file-outside-workdir-traversal-1']?.status).toBe('failed');
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

  it('syncs a sanitized full hosted snapshot after a completed file action', async () => {
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

    expect(hostedRuntimeMocks.syncHostedRuntimeWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'shared-session-file-1',
        prune: true,
        files: expect.objectContaining({
          '/home/project/package.json': {
            type: 'file',
            content: '{"name":"runtime-test"}',
            isBinary: false,
          },
          '/home/project/src/App.jsx': {
            type: 'file',
            content: 'export default function App() { return <main>hosted</main>; }',
            isBinary: false,
          },
        }),
      }),
    );
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
    expect(hostedRuntimeMocks.syncHostedRuntimeWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'shared-session-file-browser-only',
        prune: true,
        files: expect.objectContaining({
          '/home/project/src/App.jsx': {
            type: 'file',
            content: 'export default function App() { return <main>same</main>; }',
            isBinary: false,
          },
        }),
      }),
    );
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

  it('waits for the final hosted file close before syncing streamed file content', async () => {
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
            content: 'export default function App() { return <main>latest</main>; }',
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
    await vi.advanceTimersByTimeAsync(ActionRunner.HOSTED_FILE_FLUSH_DEBOUNCE_MS + 25);

    expect(hostedRuntimeMocks.syncHostedRuntimeWorkspace).not.toHaveBeenCalled();

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
    await vi.advanceTimersByTimeAsync(ActionRunner.HOSTED_FILE_FLUSH_DEBOUNCE_MS + 25);

    expect(hostedRuntimeMocks.syncHostedRuntimeWorkspace).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();

    await runner.runAction(
      {
        ...actionData,
        action: {
          ...actionData.action,
          content: 'export default function App() { return <main>latest</main>; }',
        } as any,
      },
      false,
    );

    expect(hostedRuntimeMocks.syncHostedRuntimeWorkspace).toHaveBeenCalledTimes(1);
    expect(hostedRuntimeMocks.syncHostedRuntimeWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'shared-session-stream-batch',
        prune: true,
        files: expect.objectContaining({
          '/home/project/src/App.jsx': {
            type: 'file',
            content: 'export default function App() { return <main>latest</main>; }',
            isBinary: false,
          },
        }),
      }),
    );
    expect(writeFile).toHaveBeenCalledWith(
      'src/App.jsx',
      'export default function App() { return <main>latest</main>; }',
    );
  });

  it('repairs a broken vite entrypoint layout before syncing the final hosted snapshot', async () => {
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
            content: '{"name":"doctor-scheduler","private":true,"type":"module","scripts":{"dev":"vite"}}',
            isBinary: false,
          } as any,
          '/home/project/index.html': {
            type: 'file',
            content:
              '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.jsx"></script>',
            isBinary: false,
          } as any,
          '/home/project/src/main.tsx': {
            type: 'file',
            content: "import App from './App.jsx';\n",
            isBinary: false,
          } as any,
          '/home/project/src/App.tsx': {
            type: 'file',
            content: 'export default function App(){return <main>Luma Clinic</main>}\n',
            isBinary: false,
          } as any,
        }) satisfies FileMap,
      undefined,
      'shared-session-vite-repair',
    );

    const actionData: ActionCallbackData = {
      artifactId: 'artifact-1',
      messageId: 'message-1',
      actionId: 'file-hosted-vite-repair',
      action: {
        type: 'file',
        filePath: '/home/project/src/App.tsx',
        content: 'export default function App(){return <main>Luma Clinic</main>}\n',
      } as any,
    };

    runner.addAction(actionData);
    await runner.runAction(actionData);

    expect(hostedRuntimeMocks.syncHostedRuntimeWorkspace).toHaveBeenCalledWith({
      sessionId: 'shared-session-vite-repair',
      prune: true,
      files: expect.objectContaining({
        '/home/project/index.html': expect.objectContaining({
          content: expect.stringContaining('src="/src/main.tsx"'),
        }),
        '/home/project/src/main.tsx': expect.objectContaining({
          content: expect.stringContaining("import App from './App';"),
        }),
        '/home/project/src/App.tsx': expect.objectContaining({
          content: expect.stringContaining('Luma Clinic'),
        }),
      }),
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

    const nonCleanupHostedCommands = hostedRuntimeMocks.runHostedRuntimeCommand.mock.calls.filter(
      ([payload]) => payload.command !== 'pkill -9 -f "(vite|next|webpack-dev-server|rollup|esbuild)" || true',
    );

    expect(nonCleanupHostedCommands).toHaveLength(2);
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

    expect(hostedRuntimeMocks.syncHostedRuntimeWorkspace).toHaveBeenCalledTimes(1);
    expect(hostedRuntimeMocks.syncHostedRuntimeWorkspace).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        sessionId: 'shared-session-command-flush',
        prune: true,
        files: expect.objectContaining({
          '/home/project/package.json': {
            type: 'file',
            content: '{"name":"runtime-test"}',
            isBinary: false,
          },
          '/home/project/src/App.jsx': {
            type: 'file',
            content: 'export default function App() { return <main>batched</main>; }',
            isBinary: false,
          },
        }),
      }),
    );

    runner.addAction(shellAction);

    const shellRun = runner.runAction(shellAction);
    await vi.advanceTimersByTimeAsync(2200);
    await shellRun;

    expect(hostedRuntimeMocks.syncHostedRuntimeWorkspace).toHaveBeenCalledTimes(1);
    expect(hostedRuntimeMocks.runHostedRuntimeCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'shared-session-command-flush',
        command: expect.stringContaining('pnpm install'),
        kind: 'shell',
      }),
    );
  });

  it('keeps hosted start actions in order so later file writes wait for preview readiness', async () => {
    vi.useRealTimers();

    hostedRuntimeMocks.isHostedRuntimeEnabled.mockReturnValue(true);

    let resolveHostedStart: ((value: { exitCode: number; output: string }) => void) | undefined;
    hostedRuntimeMocks.runHostedRuntimeCommand.mockImplementation(async ({ command }) => {
      if (command.includes('pkill -9 -f')) {
        return { exitCode: 0, output: 'cleanup ok' };
      }

      return new Promise((resolve) => {
        resolveHostedStart = resolve;
      });
    });

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
