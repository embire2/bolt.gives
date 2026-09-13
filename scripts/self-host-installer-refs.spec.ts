import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile, type ExecFileOptions } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

function exec(command: string, args: string[], options: ExecFileOptions): Promise<{ stdout: string }> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { ...options, encoding: 'utf8' }, (error, stdout) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout: String(stdout) });
      }
    });
  });
}

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bolt-install-refs-'));
  roots.push(root);

  const origin = path.join(root, 'origin');
  const checkout = path.join(root, 'checkout');
  await fs.mkdir(origin);

  const git = async (cwd: string, ...args: string[]) => (await exec('git', args, { cwd })).stdout.trim();
  await git(origin, 'init', '-b', 'main');
  await git(origin, 'config', 'user.name', 'Installer Fixture');
  await git(origin, 'config', 'user.email', 'installer@example.invalid');
  await fs.writeFile(path.join(origin, '.gitignore'), '.env.local\n');
  await fs.writeFile(path.join(origin, 'source.txt'), 'first');
  await git(origin, 'add', '.');
  await git(origin, 'commit', '-m', 'fixture baseline');
  await git(origin, 'tag', '-a', 'v4.1.0-beta.1', '-m', 'fixture tag');

  return {
    checkout,
    origin,
    git,
    install: (ref: string) =>
      exec('bash', ['-c', 'source ./install.sh\nsleep() { :; }\nclone_or_update_repo'], {
        cwd: process.cwd(),
        env: {
          PATH: '/usr/bin:/bin',
          HOME: root,
          INSTALL_DIR: checkout,
          REPO_URL: origin,
          BRANCH: ref,
        },
      }),
  };
}

describe('installer release ref recovery', () => {
  it('installs and repairs an annotated release tag without changing configuration', async () => {
    const { checkout, origin, git, install } = await fixture();
    await install('v4.1.0-beta.1');
    await fs.writeFile(path.join(checkout, '.env.local'), 'FIXTURE=preserved\n', { mode: 0o600 });
    await install('v4.1.0-beta.1');
    expect(await git(checkout, 'rev-parse', 'HEAD')).toBe(await git(origin, 'rev-parse', 'HEAD'));
    expect(await git(checkout, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('HEAD');
    expect(await fs.readFile(path.join(checkout, '.env.local'), 'utf8')).toBe('FIXTURE=preserved\n');
    expect((await fs.stat(path.join(checkout, '.env.local'))).mode & 0o777).toBe(0o600);
  });

  it('fast-forwards to a newer tag that the installed clone has never fetched', async () => {
    const { checkout, origin, git, install } = await fixture();
    await install('v4.1.0-beta.1');
    await fs.writeFile(path.join(origin, 'source.txt'), 'second');
    await git(origin, 'commit', '-am', 'fixture next release');
    await git(origin, 'tag', 'v4.1.0');
    await install('v4.1.0');
    expect(await fs.readFile(path.join(checkout, 'source.txt'), 'utf8')).toBe('second');
    expect(await git(checkout, 'rev-parse', 'HEAD')).toBe(await git(origin, 'rev-parse', 'HEAD'));
  });

  it('continues to update ordinary branches with the exact fetched commit', async () => {
    const { checkout, origin, git, install } = await fixture();
    await install('main');
    await fs.writeFile(path.join(origin, 'source.txt'), 'branch update');
    await git(origin, 'commit', '-am', 'fixture branch update');
    await install('main');
    expect(await git(checkout, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main');
    expect(await git(checkout, 'rev-parse', 'HEAD')).toBe(await git(origin, 'rev-parse', 'HEAD'));
  });

  it('refuses missing refs and divergent commits without moving HEAD', async () => {
    const { checkout, git, install } = await fixture();
    await install('main');

    const before = await git(checkout, 'rev-parse', 'HEAD');
    await expect(install('missing-tag')).rejects.toMatchObject({ code: 1 });
    expect(await git(checkout, 'rev-parse', 'HEAD')).toBe(before);
    await git(checkout, 'config', 'user.name', 'Installer Fixture');
    await git(checkout, 'config', 'user.email', 'installer@example.invalid');
    await fs.writeFile(path.join(checkout, 'source.txt'), 'local work');
    await git(checkout, 'commit', '-am', 'keep local work');

    const local = await git(checkout, 'rev-parse', 'HEAD');
    await expect(install('v4.1.0-beta.1')).rejects.toMatchObject({ code: 1 });
    expect(await git(checkout, 'rev-parse', 'HEAD')).toBe(local);
    expect(await fs.readFile(path.join(checkout, 'source.txt'), 'utf8')).toBe('local work');
  });

  it('refuses a rewritten release tag without overwriting the installed release', async () => {
    const { checkout, origin, git, install } = await fixture();
    await install('v4.1.0-beta.1');

    const before = await git(checkout, 'rev-parse', 'HEAD');
    await fs.writeFile(path.join(origin, 'source.txt'), 'rewritten tag');
    await git(origin, 'commit', '-am', 'fixture rewritten release');
    await git(origin, 'tag', '-f', 'v4.1.0-beta.1');
    await expect(install('v4.1.0-beta.1')).rejects.toMatchObject({ code: 1 });
    expect(await git(checkout, 'rev-parse', 'HEAD')).toBe(before);
    expect(await fs.readFile(path.join(checkout, 'source.txt'), 'utf8')).toBe('first');
  });
});
