import { describe, expect, it, vi } from 'vitest';
import { waitForSettledRuntime } from './e2e-runtime-readiness.mjs';

describe('browser idle-history readiness precondition', () => {
  const ready = { status: 'ready', healthy: true, preview: { port: 4100 }, recovery: { state: 'idle' } };
  it('waits through a late runtime start rather than navigating on one optimistic sample', async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce(ready)
      .mockResolvedValueOnce({ ...ready, status: 'starting', healthy: false })
      .mockResolvedValue(ready);
    await expect(waitForSettledRuntime(read, { wait: async () => undefined })).resolves.toBe(ready);
    expect(read).toHaveBeenCalledTimes(4);
  });
  it('fails a stuck or unhealthy preview without weakening the history assertion', async () => {
    await expect(
      waitForSettledRuntime(async () => ({ ...ready, healthy: false }), {
        attempts: 3,
        wait: async () => undefined,
      }),
    ).rejects.toThrow('did not settle');
  });
});
