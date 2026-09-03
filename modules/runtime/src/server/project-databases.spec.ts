import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildProjectDatabaseConfig,
  buildProjectDatabaseEnvironment,
  buildProjectDatabaseIdentity,
  ensureProjectDatabase,
  sanitizeProjectDatabase,
  sanitizeProjectDatabaseConfig,
} from './project-databases.mjs';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true })));
});

describe('project database provisioning', () => {
  it('is opt-in even when a provisioner URL exists', () => {
    const config = buildProjectDatabaseConfig({
      BOLT_PROJECT_DATABASE_ADMIN_URL: 'postgresql://provisioner:private@127.0.0.1:5432/postgres',
    });

    expect(config).toMatchObject({
      enabled: false,
      supported: false,
      reason: 'Project database provisioning is disabled.',
    });
  });

  it('requires a server-only admin connection and redacts it from client config', () => {
    const unavailable = buildProjectDatabaseConfig({ BOLT_PROJECT_DATABASE_ENABLED: 'true' });
    const configured = buildProjectDatabaseConfig({
      BOLT_PROJECT_DATABASE_ENABLED: 'true',
      BOLT_PROJECT_DATABASE_ADMIN_URL: 'postgresql://provisioner:private@127.0.0.1:5432/postgres',
      BOLT_PROJECT_DATABASE_HOST: '127.0.0.1',
      BOLT_PROJECT_DATABASE_SSL: 'disable',
    });

    expect(unavailable).toMatchObject({ supported: false });
    expect(configured).toMatchObject({ supported: true, host: '127.0.0.1', port: 5432 });
    expect(JSON.stringify(sanitizeProjectDatabaseConfig(configured))).not.toContain('private');
    expect(JSON.stringify(sanitizeProjectDatabaseConfig(configured))).not.toContain('provisioner');
  });

  it('builds stable isolated identifiers and server-process environment variables', () => {
    const first = buildProjectDatabaseIdentity("client'; DROP DATABASE postgres; --");
    const second = buildProjectDatabaseIdentity("client'; DROP DATABASE postgres; --");
    const environment = buildProjectDatabaseEnvironment({
      ...first,
      databasePassword: 'secret:/?#[]@',
      host: '127.0.0.1',
      port: 5432,
      sslMode: 'disable',
    });

    expect(first).toEqual(second);
    expect(first.databaseName).toMatch(/^bolt_project_[a-f0-9]{20}$/);
    expect(first.databaseUser).toMatch(/^bp_[a-f0-9]{20}$/);
    expect(first.databaseName).not.toContain('DROP');
    expect(environment.DATABASE_URL).toContain('secret%3A%2F%3F%23%5B%5D%40');
    expect(environment).toMatchObject({ PGHOST: '127.0.0.1', PGSSLMODE: 'disable' });
  });

  it('provisions once, persists credentials at mode 0600, and exposes no password to clients', async () => {
    const secretRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'bolt-project-db-'));
    temporaryDirectories.push(secretRoot);

    const queries: Array<{ text: string; params: unknown[] }> = [];
    const options: Array<Record<string, unknown>> = [];
    const createClient = vi.fn((clientOptions: Record<string, unknown>) => {
      options.push(clientOptions);

      return {
        connect: vi.fn(async () => undefined),
        end: vi.fn(async () => undefined),
        query: vi.fn(async (text: string, params: unknown[] = []) => {
          queries.push({ text, params });

          if (text.startsWith('SELECT 1 FROM pg_roles') || text.startsWith('SELECT 1 FROM pg_database')) {
            return { rowCount: 0, rows: [] };
          }

          return { rowCount: 1, rows: [{ database: 'ready' }] };
        }),
      };
    });
    const config = buildProjectDatabaseConfig({
      BOLT_PROJECT_DATABASE_ENABLED: 'true',
      BOLT_PROJECT_DATABASE_ADMIN_URL: 'postgresql://provisioner:private@127.0.0.1:5432/postgres',
      BOLT_PROJECT_DATABASE_HOST: '127.0.0.1',
      BOLT_PROJECT_DATABASE_SSL: 'disable',
      BOLT_PROJECT_DATABASE_SECRET_ROOT: secretRoot,
    });

    const [first, concurrent] = await Promise.all([
      ensureProjectDatabase('session-calendar', config, { createClient }),
      ensureProjectDatabase('session-calendar', config, { createClient }),
    ]);

    expect(first).toEqual(concurrent);
    expect(createClient).toHaveBeenCalledTimes(3);
    expect(String(options[1]?.connectionString)).toContain(`/${first.databaseName}`);
    expect(queries.some((query) => query.text.startsWith('CREATE ROLE'))).toBe(true);
    expect(queries.some((query) => query.text.startsWith('CREATE DATABASE'))).toBe(true);

    const files = await fs.readdir(secretRoot);
    expect(files).toHaveLength(1);
    expect((await fs.stat(path.join(secretRoot, files[0]))).mode & 0o777).toBe(0o600);

    const clientState = sanitizeProjectDatabase(first);
    expect(clientState).toMatchObject({ status: 'connected', persistence: 'durable' });
    expect(JSON.stringify(clientState)).not.toContain(first.databasePassword);
    expect(await fs.readFile(path.join(secretRoot, files[0]), 'utf8')).toContain(first.databasePassword);
  });
});
