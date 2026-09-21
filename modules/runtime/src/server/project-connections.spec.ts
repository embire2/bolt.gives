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
  const verificationResponse = () =>
    new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });

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
      { fetchFn: vi.fn(async () => verificationResponse()) },
    );
    const files = await fs.readdir(config.secretRoot);
    const status = sanitizeProjectConnection(record);

    expect(files).toHaveLength(1);
    expect((await fs.stat(path.join(config.secretRoot, files[0]))).mode & 0o777).toBe(0o600);
    expect(status).toMatchObject({
      provider: 'supabase',
      label: 'project-ref',
      status: 'verified',
      verifiedAt: record.updatedAt,
    });
    expect(JSON.stringify(status)).not.toContain('public-anon-key-value');
    expect(buildProjectConnectionEnvironment(record)).toMatchObject({
      VITE_SUPABASE_URL: 'https://project-ref.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'public-anon-key-value',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'public-anon-key-value',
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

  it('does not offer new PostgreSQL connections', async () => {
    const config = await createConfig();
    const databaseUrl = 'postgresql://app:private@db.example.com:5433/calendar?sslmode=require';
    await expect(saveProjectConnection('project-two', { provider: 'postgresql', databaseUrl }, config)).rejects.toThrow(
      'Supabase only',
    );
    expect(buildProjectConnectionEnvironment({ provider: 'postgresql', databaseUrl })).toMatchObject({
      DATABASE_URL: databaseUrl,
      PGHOST: 'db.example.com',
      PGPORT: '5433',
      PGDATABASE: 'calendar',
      PGUSER: 'app',
      PGPASSWORD: 'private',
      PGSSLMODE: 'require',
    });
    expect(
      buildProjectConnectionEnvironment({ provider: 'postgresql', databaseUrl }, { target: 'static-build' }),
    ).toEqual({});
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
      { fetchFn: vi.fn(async () => verificationResponse()) },
    );

    await deleteProjectConnection('project-three', config);
    await expect(readProjectConnection('project-three', config)).resolves.toBeNull();
  });

  it('does not replace the last saved connection when credential rotation fails', async () => {
    const config = await createConfig();
    const input = { provider: 'supabase', supabaseUrl: 'https://rotation.supabase.co', anonKey: 'public-fixture-key' };
    const record = await saveProjectConnection('rotation', input, config, {
      fetchFn: vi.fn(async () => verificationResponse()),
    });
    await expect(
      saveProjectConnection('rotation', { ...input, anonKey: 'wrong-public-key' }, config, {
        verifySupabaseConnectionFn: async () => {
          throw new Error('fixture unreachable');
        },
      }),
    ).rejects.toThrow('fixture unreachable');
    expect(await readProjectConnection('rotation', config)).toEqual(record);
  });

  it('verifies Supabase before saving and rejects non-Supabase origins', async () => {
    const config = await createConfig();
    const input = { provider: 'supabase', supabaseUrl: 'https://offline.supabase.co', anonKey: 'public-fixture-key' };
    await expect(
      saveProjectConnection('offline', input, config, {
        fetchFn: vi.fn(async () => new Response('{}', { status: 401 })),
      }),
    ).rejects.toThrow('rejected the publishable key');
    await expect(fs.readdir(config.secretRoot)).resolves.toEqual([]);
    await expect(
      saveProjectConnection('offline', { ...input, supabaseUrl: 'https://unreachable.example' }, config),
    ).rejects.toThrow('HTTPS project URL');

    const replaced = await saveProjectConnection('offline', { ...input, anonKey: 'replacement-fixture-key' }, config, {
      fetchFn: vi.fn(async (_url, options) => {
        expect(options.redirect).toBe('manual');
        expect(options.headers).toMatchObject({ apikey: 'replacement-fixture-key' });

        return verificationResponse();
      }),
    });
    expect((await readProjectConnection('offline', config))?.anonKey).toBe('replacement-fixture-key');
    expect(sanitizeProjectConnection(replaced)?.status).toBe('verified');
  });
});
