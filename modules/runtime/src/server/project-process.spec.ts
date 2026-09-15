import { describe, expect, it } from 'vitest';
import { projectProcessConfig, projectProcessInvocation } from './project-process.mjs';

const config = projectProcessConfig({
  BOLT_PROJECT_EXECUTION_MODE: 'podman',
  BOLT_PROJECT_RUNNER_UID: '1002',
  BOLT_PROJECT_RUNNER_GID: '1002',
  BOLT_PROJECT_RUNNER_HOME: '/srv/runner',
  BOLT_PROJECT_CONTAINER_IMAGE: `sha256:${'a'.repeat(64)}`,
});

describe('project execution boundary', () => {
  it('refuses to run a generated command as root without a sandbox', () => {
    expect(() => projectProcessInvocation('bash', ['-c', 'id'], { cwd: '/project' }, { mode: 'local' }, 0)).toThrow(
      'execution as root is disabled',
    );
  });

  it('requires a non-root identity and immutable local image', () => {
    expect(() => projectProcessConfig({ BOLT_PROJECT_EXECUTION_MODE: 'podman' })).toThrow('non-root');
    expect(() =>
      projectProcessConfig({
        BOLT_PROJECT_EXECUTION_MODE: 'podman',
        BOLT_PROJECT_RUNNER_UID: '1002',
        BOLT_PROJECT_RUNNER_GID: '1002',
        BOLT_PROJECT_RUNNER_HOME: '/srv/runner',
        BOLT_PROJECT_CONTAINER_IMAGE: 'node:latest',
      }),
    ).toThrow('pinned local image');
  });

  it('mounts only this project and isolates network, privileges and resources', () => {
    const invocation = projectProcessInvocation(
      'bash',
      ['-c', 'pnpm dev'],
      {
        cwd: '/srv/projects/one',
        env: { DATABASE_URL: 'private-fixture' },
        previewPort: 4100,
      },
      config,
      0,
    );
    expect(invocation.options.uid).toBe(1002);
    expect(invocation.args).not.toContain('--rm');
    expect(invocation.args).toContain('1002:1002');
    expect(invocation.args).toContain('/srv/projects/one:/srv/projects/one:rw');
    expect(invocation.args.filter((arg: string) => arg === '--volume')).toHaveLength(1);
    expect(invocation.args).toEqual(
      expect.arrayContaining([
        '--read-only',
        '--cap-drop=ALL',
        '--security-opt=no-new-privileges',
        '--pids-limit=256',
        '--memory=1536m',
        '--cpus=1',
        '--network=slirp4netns:allow_host_loopback=false',
        '127.0.0.1:4100:4100',
        '--pull=never',
        '--env',
        'DATABASE_URL',
      ]),
    );
    expect(invocation.args.join(' ')).not.toContain('private-fixture');
    expect(invocation.options.env.DATABASE_URL).toBe('private-fixture');
  });

  it('rejects mount-option injection and invalid Preview ports', () => {
    expect(() => projectProcessInvocation('bash', [], { cwd: '/project:/' }, config, 0)).toThrow('mount');
    expect(() => projectProcessInvocation('bash', [], { cwd: '/project', previewPort: 22 }, config, 0)).toThrow('port');
  });
});
