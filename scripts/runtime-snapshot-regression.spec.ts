import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildWorkspaceFileMapFromDisk, resolveSessionSnapshotFiles } from './runtime-server.mjs';

const roots: string[] = [];

async function fixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bolt-snapshot-regression-'));
  roots.push(dir);

  return dir;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('source snapshot regressions', () => {
  it('excludes generated trees at every depth while preserving real hidden source', async () => {
    const dir = await fixture();

    for (const name of ['.cache', '.local', 'nested/node_modules', 'nested/dist', '.github']) {
      await fs.mkdir(path.join(dir, name), { recursive: true });
      await fs.writeFile(path.join(dir, name, 'fixture.txt'), 'fixture');
    }

    const files = await buildWorkspaceFileMapFromDisk({ dir });
    expect(Object.keys(files).some((key) => /\.cache|\.local|node_modules|\/dist/.test(key))).toBe(false);
    expect(files['/home/project/.github/fixture.txt']).toMatchObject({ type: 'file', content: 'fixture' });
  });

  it('returns external edits, renames, and complete deletion instead of stale cached source', async () => {
    const dir = await fixture();
    await fs.writeFile(path.join(dir, 'README.md'), 'new disk content');

    const session = { dir, currentFileMap: { '/home/project/README.md': { type: 'file', content: 'old' } } };
    expect((await resolveSessionSnapshotFiles(session))['/home/project/README.md']).toMatchObject({
      type: 'file',
      content: 'new disk content',
    });
    await fs.rename(path.join(dir, 'README.md'), path.join(dir, 'RENAMED.md'));
    expect(Object.keys(await resolveSessionSnapshotFiles(session))).toEqual(['/home/project/RENAMED.md']);
    await fs.unlink(path.join(dir, 'RENAMED.md'));
    expect(await resolveSessionSnapshotFiles(session)).toEqual({});
  });

  it('does not follow symlinks outside the project', async () => {
    const dir = await fixture();
    const outside = await fixture();
    await fs.writeFile(path.join(outside, 'private.txt'), 'must not be read');
    await fs.symlink(outside, path.join(dir, 'outside'));
    await fs.symlink(path.join(outside, 'private.txt'), path.join(dir, 'secret.txt'));
    expect(await buildWorkspaceFileMapFromDisk({ dir })).toEqual({});
  });
});
