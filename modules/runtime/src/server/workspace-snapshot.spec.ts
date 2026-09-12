import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readWorkspaceSnapshot, reconcileWorkspaceSnapshot } from './workspace-snapshot.mjs';

const roots: string[] = [];

async function fixture(content = 'content') {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bolt-snapshot-limits-'));
  roots.push(dir);
  await fs.writeFile(path.join(dir, 'source.txt'), content);

  return dir;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('snapshot budgets', () => {
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
