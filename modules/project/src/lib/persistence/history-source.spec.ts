import { describe, expect, it, vi } from 'vitest';
import { RuntimeSnapshotError } from '@bolt/runtime/lib/runtime/snapshot-transport';
import { resolveHistorySource } from './history-source';

describe('history source authority', () => {
  const cached = { '/home/project/App.tsx': { type: 'file' as const, content: 'old starter', isBinary: false } };

  it('prefers current runtime source, including intentional deletion of all files', async () => {
    expect(await resolveHistorySource(cached, 'session', async () => ({}))).toEqual({ files: {}, fromRuntime: true });
  });

  it('restores cached source only when the runtime explicitly confirms that session is missing', async () => {
    expect(
      await resolveHistorySource(cached, 'session', async () => {
        throw new RuntimeSnapshotError(404, true);
      }),
    ).toEqual({ files: cached, fromRuntime: false });
  });

  it('does not roll back source on an outage, authentication failure, or generic proxy 404', async () => {
    for (const status of [401, 404, 409, 500, 503]) {
      const error = new RuntimeSnapshotError(status);
      await expect(
        resolveHistorySource(cached, 'session', async () => {
          throw error;
        }),
      ).rejects.toBe(error);
    }
  });

  it('keeps explicit local-history restores independent of the hosted runtime', async () => {
    const fetchSnapshot = vi.fn();
    expect(await resolveHistorySource(cached, undefined, fetchSnapshot)).toEqual({ files: cached, fromRuntime: false });
    expect(fetchSnapshot).not.toHaveBeenCalled();
  });
});
