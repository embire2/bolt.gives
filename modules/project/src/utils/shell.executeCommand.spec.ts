import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BoltShell } from './shell';

describe('BoltShell.executeCommand race-safety', () => {
  let shell: BoltShell;
  let terminalInputs: string[];
  let waitCalls: Array<{ resolve: (v: { output: string; exitCode: number }) => void; reject: (e: unknown) => void }>;

  function makeDeferredWaitTillOscCode() {
    const deferred: { resolve: (v: { output: string; exitCode: number }) => void; reject: (e: unknown) => void } = {
      resolve: () => undefined,
      reject: () => undefined,
    };

    const promise = new Promise<{ output: string; exitCode: number }>((resolve, reject) => {
      deferred.resolve = resolve;
      deferred.reject = reject;
    });

    waitCalls.push(deferred);

    return promise;
  }

  beforeEach(() => {
    terminalInputs = [];
    waitCalls = [];

    shell = new BoltShell();

    // stub the private fields/methods that executeCommand touches
    Object.defineProperty(shell, 'process', { get: () => ({}), configurable: true });
    Object.defineProperty(shell, 'terminal', {
      get: () => ({ input: (data: string) => terminalInputs.push(data) }),
      configurable: true,
    });

    vi.spyOn(shell as unknown as { waitTillOscCode: () => Promise<unknown> }, 'waitTillOscCode').mockImplementation(
      () => makeDeferredWaitTillOscCode() as unknown as Promise<unknown>,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('drains the previous executionPrms before starting a new command', async () => {
    // prime an active state: simulate a long-running command holding the shared output-stream reader.
    const previousDeferred: {
      resolve: (v: { output: string; exitCode: number }) => void;
      reject: (e: unknown) => void;
    } = { resolve: () => undefined, reject: () => undefined };
    const previousPromise = new Promise<{ output: string; exitCode: number }>((resolve, reject) => {
      previousDeferred.resolve = resolve;
      previousDeferred.reject = reject;
    });

    const previousAbort = vi.fn();
    shell.executionState.set({
      sessionId: 'prev',
      active: true,
      executionPrms: previousPromise,
      abort: previousAbort,
    });

    const newCallPromise = shell.executeCommand('new', 'npm install');

    // wait a microtask so executeCommand can proceed to its awaits
    await Promise.resolve();
    await Promise.resolve();

    /*
     * the new command must have signaled abort + Ctrl+C, but must NOT have
     * submitted the new command line yet, because the previous executionPrms
     * hasn't resolved.
     */
    expect(previousAbort).toHaveBeenCalledTimes(1);
    expect(terminalInputs).toContain('\x03');
    expect(terminalInputs.some((s) => s.startsWith('npm install'))).toBe(false);

    /*
     * crucially, we must not have started our own waitTillOscCode yet —
     * otherwise two concurrent readers would race on the shared stream.
     */
    expect(waitCalls.length).toBe(0);

    // Now resolve the previous executionPrms, as if Ctrl+C drained its prompt.
    previousDeferred.resolve({ output: '', exitCode: 0 });

    await Promise.resolve();
    await Promise.resolve();

    /*
     * After the previous call drains, the new command line is sent and a
     * single waitTillOscCode is started (via getCurrentExecutionResult).
     */
    expect(terminalInputs.some((s) => s.startsWith('npm install'))).toBe(true);
    expect(waitCalls.length).toBe(1);

    // Resolve the new command's prompt to let executeCommand finish.
    waitCalls[0].resolve({ output: 'ok', exitCode: 0 });

    const result = await newCallPromise;
    expect(result).toBeTruthy();
    expect(result?.exitCode).toBe(0);
  });

  it('does not deadlock when the previous call rejects', async () => {
    const previousPromise = Promise.reject(new Error('previous hung'));

    // swallow unhandled rejection
    previousPromise.catch(() => undefined);

    shell.executionState.set({
      sessionId: 'prev',
      active: true,
      executionPrms: previousPromise,
      abort: vi.fn(),
    });

    const newCallPromise = shell.executeCommand('new', 'npm run dev');

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(terminalInputs.some((s) => s.startsWith('npm run dev'))).toBe(true);
    expect(waitCalls.length).toBe(1);

    waitCalls[0].resolve({ output: 'ok', exitCode: 0 });
    await expect(newCallPromise).resolves.toBeTruthy();
  });
});
