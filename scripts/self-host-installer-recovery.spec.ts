import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const exec = promisify(execFile);
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bolt-install-recovery-'));
  roots.push(root);

  return {
    root,
    run: (script: string) =>
      exec('bash', ['-c', `source ./install.sh\n${script}`], {
        cwd: process.cwd(),
        env: { PATH: '/usr/bin:/bin', HOME: root, INSTALL_DIR: root },
      }),
  };
}

describe('installer safe recovery', () => {
  it('restores last-good build artifacts when both builds fail', async () => {
    const { root, run } = await fixture();
    await fs.mkdir(path.join(root, 'build'));
    await fs.writeFile(path.join(root, 'build', 'healthy.txt'), 'previous release');
    await expect(
      run('pnpm() { return 19; }\nrepair_repo_dependencies() { :; }\nbuild_application'),
    ).rejects.toMatchObject({ code: 1 });
    expect(await fs.readFile(path.join(root, 'build', 'healthy.txt'), 'utf8')).toBe('previous release');
    expect((await fs.readdir(root)).filter((entry) => entry.startsWith('.build-backup.'))).toEqual([]);
  });

  it('does not move the current checkout or its secrets when fetch fails', async () => {
    const { root, run } = await fixture();
    await fs.mkdir(path.join(root, '.git'));
    await fs.writeFile(path.join(root, '.env.local'), 'PRIVATE_FIXTURE=keep-me\n');
    await expect(
      run('git() { [[ "$*" == *status* ]] && return 0; return 12; }\nsleep() { :; }\nclone_or_update_repo'),
    ).rejects.toMatchObject({ code: 1 });
    expect(await fs.readFile(path.join(root, '.env.local'), 'utf8')).toContain('keep-me');
    expect((await fs.stat(path.join(root, '.git'))).isDirectory()).toBe(true);
  });

  it('never alters a preexisting PostgreSQL role or unrelated database', async () => {
    const { root, run } = await fixture();
    const commands = path.join(root, 'commands');
    await run(`INSTALL_POSTGRES=1
POSTGRES_USER=existing_owner
POSTGRES_DB=existing_db
POSTGRES_PASSWORD=fixture
need_cmd() { :; }
sudo() {
  printf '%s\\n' "$*" >> '${commands}'
  if [[ "$*" == *pg_roles* ]]; then printf '1'; fi
  if [[ "$*" == *pg_get_userbyid* ]]; then printf 'existing_owner'; fi
}
env() { return 0; }
setup_local_postgres`);

    const calls = await fs.readFile(commands, 'utf8');
    expect(calls).not.toMatch(/ALTER ROLE|CREATE ROLE|REVOKE|GRANT|createdb/);
  });

  it('does not mutate the lockfile during dependency recovery', async () => {
    const { root, run } = await fixture();
    const commands = path.join(root, 'commands');
    await expect(
      run(
        `pnpm() { printf '%s\\n' "$*" >> '${commands}'; return 21; }\nrepair_repo_dependencies() { :; }\ninstall_dependencies`,
      ),
    ).rejects.toMatchObject({ code: 1 });

    const calls = await fs.readFile(commands, 'utf8');
    expect(calls.match(/--frozen-lockfile/g)).toHaveLength(3);
    expect(calls).not.toContain('--no-frozen-lockfile');
  });
});
