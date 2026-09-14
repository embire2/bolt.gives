import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertFreshMigrationTargets, assertMigrationServicesStopped } from './isolation-migration.mjs';

const fixtures: string[] = [];
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) {
    await fs.rm(fixture, { recursive: true, force: true });
  }
});

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bolt-migration-guard-'));
  fixtures.push(root);

  const source = path.join(root, 'original');
  await fs.mkdir(source);
  await fs.writeFile(path.join(source, 'project.txt'), 'old source');

  return { source, destinations: [path.join(root, 'isolated')], environmentFile: path.join(root, 'isolated.env') };
}

describe('one-time hosted isolation migration', () => {
  it('allows fresh separate targets without creating or modifying them', async () => {
    const options = await fixture();
    await expect(assertFreshMigrationTargets(options)).resolves.toBeUndefined();
    await expect(fs.stat(options.destinations[0])).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('preserves newer project data when migration is invoked twice', async () => {
    const options = await fixture();
    await fs.mkdir(options.destinations[0]);

    const file = path.join(options.destinations[0], 'project.txt');
    await fs.writeFile(file, 'new customer work');
    await expect(assertFreshMigrationTargets(options)).rejects.toThrow('already exists');
    expect(await fs.readFile(file, 'utf8')).toBe('new customer work');
  });

  it('refuses a prior environment record even when copy directories are missing', async () => {
    const options = await fixture();
    await fs.writeFile(options.environmentFile, 'BOLT_PREVIEW_SIGNING_SECRET=fixture', { mode: 0o600 });
    await expect(assertFreshMigrationTargets(options)).rejects.toThrow('already exists');
  });

  it('rejects symlinked destination parents', async () => {
    const options = await fixture();
    const alias = path.join(path.dirname(options.source), 'alias');
    await fs.symlink(options.source, alias);
    options.destinations = [path.join(alias, 'copy')];
    await expect(assertFreshMigrationTargets(options)).rejects.toThrow('symlinks');
  });

  it('rejects a destination nested in the source', async () => {
    const options = await fixture();
    options.destinations = [path.join(options.source, 'copy')];
    await expect(assertFreshMigrationTargets(options)).rejects.toThrow('separate trees');
  });

  it.each([['active', 'inactive'], ['inactive', 'failed'], [], ['inactive', '']])(
    'refuses services that are not confirmed stopped: %j',
    (...states) => {
      expect(() =>
        assertMigrationServicesStopped(states.map((activeState) => ({ loadState: 'loaded', activeState }))),
      ).toThrow('Stop both');
    },
  );

  it('allows confirmed stopped services', () => {
    expect(() =>
      assertMigrationServicesStopped([
        { loadState: 'loaded', activeState: 'inactive' },
        { loadState: 'loaded', activeState: 'inactive' },
      ]),
    ).not.toThrow();
  });

  it('does not treat a missing unit as safely inactive', () => {
    expect(() =>
      assertMigrationServicesStopped([
        { loadState: 'not-found', activeState: 'inactive' },
        { loadState: 'loaded', activeState: 'inactive' },
      ]),
    ).toThrow('Stop both');
  });
});
