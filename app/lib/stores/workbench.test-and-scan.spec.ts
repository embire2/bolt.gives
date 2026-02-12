import { afterEach, describe, expect, it, vi } from 'vitest';
import { workbenchStore } from './workbench';

describe('workbenchStore.runTestAndSecurityScan', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    workbenchStore.clearStepRunnerEvents();
    workbenchStore.isTestAndScanRunning.set(false);
  });

  it('executes lint/security/test steps and streams structured events', async () => {
    vi.spyOn(workbenchStore, 'getFileModifcations').mockReturnValue({});

    const shell = workbenchStore.boltTerminal as any;
    vi.spyOn(shell, 'ready').mockResolvedValue(undefined);

    const execSpy = vi.spyOn(shell as any, 'executeCommand').mockImplementation(async (...args: unknown[]) => {
      const commandText = String(args[1]);
      const onOut = args[3] as ((chunk: string) => void) | undefined;

      onOut?.(`[mock] ${commandText}`);

      return { exitCode: 0, output: `ok:${commandText}` };
    });

    const runPromise = workbenchStore.runTestAndSecurityScan();
    expect(workbenchStore.testAndScanRunning.get()).toBe(true);

    await runPromise;

    expect(workbenchStore.testAndScanRunning.get()).toBe(false);
    expect(execSpy).toHaveBeenCalledTimes(3);

    const commands = execSpy.mock.calls.map((call) => call[1] as string);
    expect(commands[0]).toBe('pnpm run lint');
    expect(commands[1]).toContain('bash -lc');
    expect(commands[2]).toBe('pnpm test');

    const eventTypes = workbenchStore.stepRunnerEvents.get().map((event) => event.type);
    expect(eventTypes).toContain('step-start');
    expect(eventTypes).toContain('stdout');
    expect(eventTypes).toContain('step-end');
    expect(eventTypes.at(-1)).toBe('complete');
  });
});
