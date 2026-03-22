import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ActionRunner } from './action-runner';
import type { ActionCallbackData } from './message-parser';

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
});
