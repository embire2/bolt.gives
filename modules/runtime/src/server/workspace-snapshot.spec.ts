import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readWorkspaceSnapshot, reconcileWorkspaceSnapshot } from './workspace-snapshot.mjs';

const roots: string[] = [];

async function fixture(content = 'content') {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bolt-snapshot-limits-'));
  roots.push(dir);
  await fs.writeFile(path.join(dir, 'source.txt'), content);

  return dir;
}
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('snapshot budgets', () => {
  it('excludes transient atomic writes from source snapshots', async () => {
    const dir = await fixture();
    await fs.writeFile(path.join(dir, 'source.txt.bolt-sync-123-1789247810000-a2b3c.tmp'), 'in-flight');
    expect(Object.keys(await readWorkspaceSnapshot(dir))).toEqual(['/home/project/source.txt']);
  });

  it.each(['ENOENT', 'ENOTDIR'])('retries a transient concurrent source removal (%s)', async (code) => {
    const dir = await fixture();
    const previous = { saved: { content: 'last complete source' } };
    const session = { dir, currentFileMap: previous };
    vi.spyOn(fs, 'open').mockRejectedValueOnce(Object.assign(new Error('concurrent source mutation'), { code }));
    await expect(reconcileWorkspaceSnapshot(session)).resolves.toHaveProperty('/home/project/source.txt');
    expect(session.currentFileMap).not.toBe(previous);
  });

  it('does not make simultaneous readers conflict with each other', async () => {
    const dir = await fixture();
    const session = { dir, currentFileMap: {} };
    const snapshots = await Promise.all(Array.from({ length: 8 }, () => reconcileWorkspaceSnapshot(session)));
    expect(snapshots).toHaveLength(8);

    for (const snapshot of snapshots) {
      expect(snapshot['/home/project/source.txt']).toMatchObject({ type: 'file', content: 'content' });
    }
  });

  it('bounds retries and retains the previous complete cache while files keep changing', async () => {
    const dir = await fixture();
    const previous = { saved: { content: 'last complete source' } };
    const session = { dir, currentFileMap: previous };
    const open = vi.spyOn(fs, 'open').mockRejectedValue(Object.assign(new Error('removed'), { code: 'ENOENT' }));
    await expect(reconcileWorkspaceSnapshot(session)).rejects.toMatchObject({ status: 409 });
    expect(open).toHaveBeenCalledTimes(3);
    expect(session.currentFileMap).toBe(previous);
  });

  it('does not overwrite a newer mutation and retries from the current disk', async () => {
    const dir = await fixture('old');
    const session = { dir, currentFileMap: {}, workspaceMutationId: 1 };
    const originalOpen = fs.open.bind(fs);
    vi.spyOn(fs, 'open').mockImplementationOnce(async (...args) => {
      session.workspaceMutationId++;
      await fs.writeFile(path.join(dir, 'source.txt'), 'new');

      return originalOpen(...args);
    });

    const result = await reconcileWorkspaceSnapshot(session);
    expect(result['/home/project/source.txt']).toMatchObject({ type: 'file', content: 'new' });
    expect(session.currentFileMap).toBe(result);
  });

  it('can cancel a queued reader without aborting another request', async () => {
    const dir = await fixture();
    const session = { dir, currentFileMap: {} };
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const originalOpen = fs.open.bind(fs);
    const open = vi.spyOn(fs, 'open').mockImplementationOnce(async (...args) => {
      await pending;
      return originalOpen(...args);
    });
    const first = reconcileWorkspaceSnapshot(session);
    const controller = new AbortController();
    const second = reconcileWorkspaceSnapshot(session, { signal: controller.signal });
    controller.abort();
    await expect(second).rejects.toThrow();

    const third = reconcileWorkspaceSnapshot(session);
    await vi.waitFor(() => expect(open).toHaveBeenCalledOnce());
    release();
    await expect(first).resolves.toHaveProperty('/home/project/source.txt');
    await expect(third).resolves.toHaveProperty('/home/project/source.txt');
  });

  it('does not disguise permissions failures as a retryable mutation', async () => {
    const dir = await fixture();
    vi.spyOn(fs, 'open').mockRejectedValueOnce(Object.assign(new Error('access denied'), { code: 'EACCES' }));
    await expect(readWorkspaceSnapshot(dir)).rejects.toMatchObject({ code: 'EACCES' });
  });
  it('rejects oversized files rather than silently truncating them', async () => {
    const dir = await fixture('x'.repeat(100));
    await expect(readWorkspaceSnapshot(dir, undefined, { maxFileBytes: 16 })).rejects.toThrow('file exceeds');
  });
  it('limits total encoded bytes and directory entries', async () => {
    const dir = await fixture();
    await expect(readWorkspaceSnapshot(dir, undefined, { maxTotalBytes: 8 })).rejects.toThrow('total snapshot limit');
    await fs.writeFile(path.join(dir, 'second.txt'), 'two');
    await expect(readWorkspaceSnapshot(dir, undefined, { maxEntries: 1 })).rejects.toThrow('too many source entries');
  });
  it('cancels reads and does not substitute stale state after an error', async () => {
    const dir = await fixture();
    const session = { dir, currentFileMap: { old: { content: 'old' } } };
    await expect(reconcileWorkspaceSnapshot(session, { signal: AbortSignal.abort() })).rejects.toThrow();
    expect(session.currentFileMap).toHaveProperty('old');
    await fs.rm(dir, { recursive: true });
    await expect(reconcileWorkspaceSnapshot(session)).rejects.toThrow();
  });
  it('preserves complete binary content', async () => {
    const dir = await fixture();
    await fs.writeFile(path.join(dir, 'asset.png'), Buffer.from([0, 1, 2, 255]));
    expect((await readWorkspaceSnapshot(dir))['/home/project/asset.png']).toEqual({
      type: 'file',
      content: 'AAEC/w==',
      isBinary: true,
    });
  });
});
