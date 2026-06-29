import { describe, expect, it } from 'vitest';
import {
  buildRuntimeNodeConfig,
  buildRuntimeNodeProvisionScript,
  createRuntimeNodeWorkspaceRecord,
  sanitizeRuntimeNodeConfigForClient,
  sanitizeRuntimeNodeWorkspaceForClient,
  validateRuntimeNodeUsername,
} from './runtime-node-workspaces.mjs';

describe('runtime-node workspace provisioning helpers', () => {
  it('validates client Linux usernames before provisioning', () => {
    expect(validateRuntimeNodeUsername('Ada_Project').ok).toBe(true);
    expect(validateRuntimeNodeUsername('root')).toMatchObject({ ok: false });
    expect(validateRuntimeNodeUsername('bolt-runtime-agent')).toMatchObject({ ok: false });
    expect(validateRuntimeNodeUsername('9starts-with-number')).toMatchObject({ ok: false });
    expect(validateRuntimeNodeUsername('xy')).toMatchObject({ ok: false });
  });

  it('does not expose admin SSH credentials in client-safe runtime-node config', () => {
    const config = buildRuntimeNodeConfig({
      BOLT_RUNTIME_NODE_ENABLED: 'true',
      BOLT_RUNTIME_NODE_HOST: '31.6.62.183',
      BOLT_RUNTIME_NODE_PUBLIC_HOST: 'runtime.example.com',
      BOLT_RUNTIME_NODE_PORT: '22',
      BOLT_RUNTIME_NODE_ADMIN_USER: 'root',
      BOLT_RUNTIME_NODE_SSH_PASSWORD: 'super-secret-root-password',
      BOLT_RUNTIME_NODE_BASE_DIR: '/srv/bolt-live-workspaces',
    });

    expect(config.supported).toBe(true);

    const safeConfig = sanitizeRuntimeNodeConfigForClient(config);

    expect(JSON.stringify(safeConfig)).not.toContain('super-secret-root-password');
    expect(JSON.stringify(safeConfig)).not.toContain('root');
    expect(safeConfig).toMatchObject({
      supported: true,
      host: 'runtime.example.com',
      authMode: 'password',
      baseDir: '/srv/bolt-live-workspaces',
    });
  });

  it('returns project credentials only when the one-time secret payload is supplied', () => {
    const config = buildRuntimeNodeConfig({
      BOLT_RUNTIME_NODE_ENABLED: 'true',
      BOLT_RUNTIME_NODE_HOST: '31.6.62.183',
      BOLT_RUNTIME_NODE_PORT: '22',
      BOLT_RUNTIME_NODE_ADMIN_USER: 'root',
      BOLT_RUNTIME_NODE_SSH_KEY_PATH: '/root/.ssh/runtime-node',
      BOLT_RUNTIME_NODE_BASE_DIR: '/srv/bolt-live-workspaces',
    });
    const { record, secrets } = createRuntimeNodeWorkspaceRecord(
      {
        clientName: 'Ada Lovelace',
        clientEmail: 'ada@example.com',
        projectName: 'Calendar Command Center',
        cliUsername: 'ada_calendar',
        cliPassword: 'BetterPassword123',
      },
      config,
    );

    const withoutSecrets = sanitizeRuntimeNodeWorkspaceForClient(record);
    const withSecrets = sanitizeRuntimeNodeWorkspaceForClient(record, secrets);

    expect(withoutSecrets.oneTimeCliPassword).toBeNull();
    expect(withoutSecrets.oneTimeDatabasePassword).toBeNull();
    expect(withoutSecrets.databaseUrl).toBeNull();
    expect(withSecrets.oneTimeCliPassword).toBe('BetterPassword123');
    expect(withSecrets.oneTimeDatabasePassword).toBe(secrets.databasePassword);
    expect(withSecrets.databaseUrl).toContain(record.databaseName);
    expect(record.cliPasswordHash).not.toBe('BetterPassword123');
    expect(record.databasePasswordHash).not.toBe(secrets.databasePassword);
  });

  it('builds a remote provisioning script that creates PostgreSQL and a private project workspace', () => {
    const config = buildRuntimeNodeConfig({
      BOLT_RUNTIME_NODE_ENABLED: 'true',
      BOLT_RUNTIME_NODE_HOST: '31.6.62.183',
      BOLT_RUNTIME_NODE_PORT: '22',
      BOLT_RUNTIME_NODE_ADMIN_USER: 'root',
      BOLT_RUNTIME_NODE_SSH_KEY_PATH: '/root/.ssh/runtime-node',
      BOLT_RUNTIME_NODE_BASE_DIR: '/srv/bolt-live-workspaces',
    });
    const { record, secrets } = createRuntimeNodeWorkspaceRecord(
      {
        clientName: 'Grace Hopper',
        clientEmail: 'grace@example.com',
        projectName: 'Compiler Lab',
        cliUsername: 'grace_compiler',
        cliPassword: 'ShipItToday123',
      },
      config,
    );
    const script = buildRuntimeNodeProvisionScript(record, secrets, config);

    expect(script).toContain(
      'run_root env DEBIAN_FRONTEND=noninteractive apt-get install -y sudo postgresql postgresql-contrib',
    );
    expect(script).toContain('run_root useradd --create-home');
    expect(script).toContain('run_root chmod 751 "$BASE_DIR"');
    expect(script).toContain('run_root chmod 700 "$WORKSPACE_DIR"');
    expect(script).toContain('run_postgres createdb -O "$DB_USER" "$DB_NAME"');
    expect(script).toContain('run_root chown "$CLI_USERNAME:$CLI_USERNAME" "$WORKSPACE_DIR/.env"');
    expect(script).toContain('run_root chmod 600 "$WORKSPACE_DIR/.env"');
    expect(script).not.toContain('```');
    expect(script).not.toContain('`$WORKSPACE_DIR`');
    expect(script).toContain('/var/log/bolt-runtime/workspace-provision.log');
  });
});
