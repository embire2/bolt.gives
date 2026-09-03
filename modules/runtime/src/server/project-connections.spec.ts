import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildProjectConnectionConfig,
  buildProjectConnectionEnvironment,
  deleteProjectConnection,
  readProjectConnection,
  sanitizeProjectConnection,
  saveProjectConnection,
} from './project-connections.mjs';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true })));
});

async function createConfig() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bolt-project-connection-'));
  temporaryDirectories.push(root);

  return buildProjectConnectionConfig({ BOLT_PROJECT_CONNECTION_SECRET_ROOT: root });
}

describe('user-owned project database connections', () => {
  it('persists Supabase outside project source and returns only redacted status', async () => {
    const config = await createConfig();
    const record = await saveProjectConnection(
      'project-one',
      {
        provider: 'supabase',
        supabaseUrl: 'https://project-ref.supabase.co/',
        anonKey: 'public-anon-key-value',
      },
      config,
    );
    const files = await fs.readdir(config.secretRoot);
    const status = sanitizeProjectConnection(record);

    expect(files).toHaveLength(1);
    expect((await fs.stat(path.join(config.secretRoot, files[0]))).mode & 0o777).toBe(0o600);
    expect(status).toMatchObject({ provider: 'supabase', label: 'project-ref', status: 'connected' });
    expect(JSON.stringify(status)).not.toContain('public-anon-key-value');
    expect(buildProjectConnectionEnvironment(record)).toMatchObject({
      VITE_SUPABASE_URL: 'https://project-ref.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'public-anon-key-value',
    });
  });

  it('rejects Supabase credentials that would expose privileged browser access', async () => {
    const config = await createConfig();
    const serviceRolePayload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');

    await expect(
      saveProjectConnection(
        'project-secret-key',
        {
          provider: 'supabase',
          supabaseUrl: 'https://project-ref.supabase.co',
          anonKey: 'sb_secret_private-value',
        },
        config,
      ),
    ).rejects.toThrow('not a secret key');
    await expect(
      saveProjectConnection(
        'project-service-role',
        {
          provider: 'supabase',
          supabaseUrl: 'https://project-ref.supabase.co',
          anonKey: `header.${serviceRolePayload}.signature`,
        },
        config,
      ),
    ).rejects.toThrow('not a service-role key');
    await expect(fs.readdir(config.secretRoot)).resolves.toEqual([]);
  });

  it('verifies PostgreSQL before persisting and omits it from static build environments', async () => {
    const config = await createConfig();
    const verifyPostgresConnectionFn = vi.fn(async () => undefined);
    const databaseUrl = 'postgresql://app:private@db.example.com:5433/calendar?sslmode=require';
    const record = await saveProjectConnection('project-two', { provider: 'postgresql', databaseUrl }, config, {
      verifyPostgresConnectionFn,
    });

    expect(verifyPostgresConnectionFn).toHaveBeenCalledOnce();
    expect(buildProjectConnectionEnvironment(record)).toMatchObject({
      DATABASE_URL: databaseUrl,
      PGHOST: 'db.example.com',
      PGPORT: '5433',
      PGDATABASE: 'calendar',
      PGUSER: 'app',
      PGPASSWORD: 'private',
      PGSSLMODE: 'require',
    });
    expect(buildProjectConnectionEnvironment(record, { target: 'static-build' })).toEqual({});
    expect(JSON.stringify(sanitizeProjectConnection(record))).not.toContain('private');
  });

  it('deletes a connection without leaving project credentials behind', async () => {
    const config = await createConfig();
    await saveProjectConnection(
      'project-three',
      {
        provider: 'supabase',
        supabaseUrl: 'https://project-three.supabase.co',
        anonKey: 'public-anon-key-value',
      },
      config,
    );

    await deleteProjectConnection('project-three', config);
    await expect(readProjectConnection('project-three', config)).resolves.toBeNull();
  });
});
