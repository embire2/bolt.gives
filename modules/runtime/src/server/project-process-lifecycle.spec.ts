import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { attachProjectLifecycle } from './project-process-lifecycle.mjs';

function fixture() {
  const child = new EventEmitter() as EventEmitter & { terminateProject: () => Promise<{ stopped: boolean }> };
  const stop = vi.fn(async () => true);
  const remove = vi.fn(async () => true);
  attachProjectLifecycle(child, { stop, remove }, { timeoutMs: 100, pollMs: 10 });

  return { child, stop, remove };
}

describe('rootless project stop lifecycle', () => {
  it('does not report success when stop races ahead of container creation', async () => {
    const { child, stop, remove } = fixture();
    let secondAttempt!: () => void;
    const retried = new Promise<void>((resolve) => {
      secondAttempt = resolve;
    });
    stop.mockImplementation(async () => {
      if (stop.mock.calls.length === 2) {
        secondAttempt();
      }

      return true;
    });

    let settled = false;
    const operation = child.terminateProject();
    void operation.then(() => {
      settled = true;
    });
    expect(child.terminateProject()).toBe(operation);
    await retried;
    expect(stop.mock.calls.length).toBeGreaterThan(1);
    expect(settled).toBe(false);
    expect(remove).not.toHaveBeenCalled();
    child.emit('close', 143);
    await expect(operation).resolves.toEqual({ stopped: true });
    expect(remove).toHaveBeenCalledOnce();
  });

  it('waits for cleanup and permits retry after a failed removal', async () => {
    const { child, remove } = fixture();
    remove.mockResolvedValueOnce(false);
    child.emit('close', 0);
    await expect(child.terminateProject()).resolves.toEqual({ stopped: false });
    await expect(child.terminateProject()).resolves.toEqual({ stopped: true });
    expect(remove).toHaveBeenCalledTimes(2);
  });

  it('bounds a stuck stop and allows a later retry', async () => {
    const { child } = fixture();
    await expect(child.terminateProject()).resolves.toEqual({ stopped: false });
    child.emit('close', 0);
    await expect(child.terminateProject()).resolves.toEqual({ stopped: true });
  });

  it('removes a container when the attached process exits without an explicit stop', async () => {
    const { child, remove, stop } = fixture();
    child.emit('close', 0);
    await expect(child.terminateProject()).resolves.toEqual({ stopped: true });
    expect(stop).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledOnce();
  });
});
