import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile, type ExecFileOptions } from 'node:child_process';
import { parse } from 'dotenv';

const run = (command: string, args: string[], options: ExecFileOptions) =>
  new Promise<{ stdout: string }>((resolve, reject) => {
    execFile(command, args, options, (error, stdout) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout: String(stdout) });
      }
    });
  });
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function configure(existing = '', withDatabase = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bolt-installer-config-'));
  roots.push(root);
  await fs.copyFile('.env.example', path.join(root, '.env.example'));

  if (existing) {
    await fs.writeFile(path.join(root, '.env.local'), existing);
  }

  const apply = async () => {
    await run('bash', ['-c', `source ./install.sh\nINSTALL_POSTGRES=${withDatabase ? 1 : 0}\nprepare_env_file`], {
      cwd: process.cwd(),
      env: {
        PATH: '/usr/bin:/bin',
        HOME: root,
        INSTALL_DIR: root,
        RUNTIME_WORKSPACE_DIR: path.join(root, 'workspaces'),
      },
    });
    return parse(await fs.readFile(path.join(root, '.env.local')));
  };

  const caddy = async () =>
    (
      await run('bash', ['-c', 'source ./install.sh\nwrite_caddy_site app.example ""'], {
        cwd: process.cwd(),
        env: { PATH: '/usr/bin:/bin', HOME: root, INSTALL_DIR: root },
      })
    ).stdout;

  return { root, apply, caddy };
}

describe('installer clean and repair configuration', () => {
  it('returns the final failure instead of false success after exhausting retries', async () => {
    await expect(
      run('bash', ['-c', 'source ./install.sh\nretry_command 2 0 fixture bash -c "exit 17"'], {
        cwd: process.cwd(),
        env: { PATH: '/usr/bin:/bin', HOME: '/tmp' },
      }),
    ).rejects.toMatchObject({ code: 17 });
  });
  it('can recover on a later attempt without exceeding its retry budget', async () => {
    const result = await run(
      'bash',
      [
        '-c',
        'source ./install.sh\nn=0\nflaky() { n=$((n+1)); (( n == 2 )); }\nretry_command 3 0 fixture flaky\nprintf "attempts=%s" "$n"',
      ],
      {
        cwd: process.cwd(),
        env: { PATH: '/usr/bin:/bin', HOME: '/tmp' },
      },
    );
    expect(result.stdout).toContain('attempts=2');
  });
  it('creates usable no-db owner login and preserves credentials on repair', async () => {
    const { root, apply, caddy } = await configure();
    const first = await apply();
    expect(first.BOLT_SELF_HOST_MODE).toBe('single-user');
    expect(first.BOLT_SELF_HOST_ACCESS_TOKEN.length).toBeGreaterThanOrEqual(32);
    expect(first.BOLT_ADMIN_DATABASE_PASSWORD).toBe('');
    expect(first.BOLT_PROJECT_DATABASE_ENABLED).toBe('false');
    expect((await fs.stat(path.join(root, '.env.local'))).mode & 0o777).toBe(0o600);

    const repaired = await apply();
    expect(repaired.BOLT_SELF_HOST_ACCESS_TOKEN).toBe(first.BOLT_SELF_HOST_ACCESS_TOKEN);
    expect(repaired.BOLT_PROFILE_COOKIE_SECRET).toBe(first.BOLT_PROFILE_COOKIE_SECRET);
    expect(await caddy()).toMatch(/handle \/runtime\/\*\s*\{\s*reverse_proxy 127\.0\.0\.1:5173/);
    expect(await caddy()).toContain('Alt-Svc "clear"');
  }, 15_000);
  it('keeps hosted profile auth for an explicit new platform database', async () => {
    const { apply, caddy } = await configure('', true);
    const config = await apply();
    expect(config.BOLT_SELF_HOST_MODE).not.toBe('single-user');
    expect(config.BOLT_ADMIN_DATABASE_PASSWORD.length).toBeGreaterThanOrEqual(32);
    expect(config.BOLT_PROJECT_DATABASE_ENABLED).toBe('false');
    expect(await caddy()).toMatch(/handle \/runtime\/\*\s*\{\s*reverse_proxy 127\.0\.0\.1:5173/);
  }, 15_000);
  it('does not downgrade an existing platform database installation', async () => {
    const { apply } = await configure('BOLT_ADMIN_DATABASE_URL=postgresql://dummy:fixture@db.example/fixture\n');
    const config = await apply();
    expect(config.BOLT_SELF_HOST_MODE).not.toBe('single-user');
    expect(config.BOLT_ADMIN_DATABASE_URL).toContain('db.example/fixture');
  }, 15_000);
});
