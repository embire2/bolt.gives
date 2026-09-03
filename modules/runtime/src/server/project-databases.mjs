#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';

const pendingProvisioning = new Map();

function envValue(env, key) {
  return typeof env?.[key] === 'string' ? env[key].trim() : '';
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function quoteLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function buildProjectDatabaseIdentity(sessionId) {
  const value = String(sessionId || '').trim();

  if (!value) {
    throw new Error('A runtime session is required to provision a project database.');
  }

  const hash = crypto.createHash('sha256').update(value).digest('hex').slice(0, 20);

  return {
    sessionHash: hash,
    databaseName: `bolt_project_${hash}`,
    databaseUser: `bp_${hash}`,
  };
}

export function buildProjectDatabaseConfig(env = process.env) {
  const enabled = envValue(env, 'BOLT_PROJECT_DATABASE_ENABLED') === 'true';
  const adminUrl = envValue(env, 'BOLT_PROJECT_DATABASE_ADMIN_URL');
  const host = envValue(env, 'BOLT_PROJECT_DATABASE_HOST') || '127.0.0.1';
  const port = Number(envValue(env, 'BOLT_PROJECT_DATABASE_PORT') || '5432');
  const sslMode = (envValue(env, 'BOLT_PROJECT_DATABASE_SSL') || 'disable').toLowerCase();
  const secretRoot =
    envValue(env, 'BOLT_PROJECT_DATABASE_SECRET_ROOT') || '/srv/bolt-gives-runtime-workspaces/project-databases';
  const connectionLimit = Math.max(
    2,
    Math.min(25, Number(envValue(env, 'BOLT_PROJECT_DATABASE_CONNECTION_LIMIT') || '10') || 10),
  );
  const supported = enabled && Boolean(adminUrl) && Number.isInteger(port) && port > 0 && port <= 65535;

  return {
    enabled,
    supported,
    reason: !enabled
      ? 'Project database provisioning is disabled.'
      : !adminUrl
        ? 'BOLT_PROJECT_DATABASE_ADMIN_URL is not configured.'
        : !Number.isInteger(port) || port <= 0 || port > 65535
          ? 'BOLT_PROJECT_DATABASE_PORT is invalid.'
          : null,
    adminUrl,
    host,
    port,
    sslMode,
    ssl: sslMode !== 'disable',
    sslStrict: sslMode === 'verify-full',
    secretRoot: path.resolve(secretRoot),
    connectionLimit,
  };
}

export function sanitizeProjectDatabaseConfig(config) {
  return {
    supported: config?.supported === true,
    reason: config?.reason || null,
    host: config?.host || null,
    port: Number(config?.port || 0) || null,
  };
}

export function sanitizeProjectDatabase(database) {
  if (!database?.databaseName || !database?.databaseUser) {
    return null;
  }

  return {
    status: 'connected',
    databaseName: database.databaseName,
    databaseUser: database.databaseUser,
    persistence: 'durable',
  };
}

export function buildProjectDatabaseEnvironment(database) {
  if (!database?.databaseName || !database?.databaseUser || !database?.databasePassword) {
    throw new Error('Project database credentials are unavailable.');
  }

  const host = String(database.host || '127.0.0.1');
  const port = Number(database.port || 5432);
  const sslMode = String(database.sslMode || 'disable');
  const databaseUrl = `postgresql://${encodeURIComponent(database.databaseUser)}:${encodeURIComponent(
    database.databasePassword,
  )}@${host}:${port}/${encodeURIComponent(database.databaseName)}?sslmode=${encodeURIComponent(sslMode)}`;

  return {
    DATABASE_URL: databaseUrl,
    PGHOST: host,
    PGPORT: String(port),
    PGDATABASE: database.databaseName,
    PGUSER: database.databaseUser,
    PGPASSWORD: database.databasePassword,
    PGSSLMODE: sslMode,
  };
}

function createDatabasePassword() {
  return `Bp-${crypto.randomBytes(24).toString('base64url')}9a`;
}

function recordPath(config, identity) {
  return path.join(config.secretRoot, `${identity.sessionHash}.json`);
}

async function readStoredRecord(config, identity, fsApi) {
  try {
    const stored = JSON.parse(await fsApi.readFile(recordPath(config, identity), 'utf8'));

    if (
      stored?.sessionHash !== identity.sessionHash ||
      stored?.databaseName !== identity.databaseName ||
      stored?.databaseUser !== identity.databaseUser ||
      typeof stored?.databasePassword !== 'string' ||
      stored.databasePassword.length < 24
    ) {
      throw new Error('Stored project database credentials failed integrity validation.');
    }

    return stored;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

async function writeStoredRecord(config, identity, record, fsApi) {
  await fsApi.mkdir(config.secretRoot, { recursive: true, mode: 0o700 });
  await fsApi.chmod(config.secretRoot, 0o700);

  const destination = recordPath(config, identity);
  const temporary = `${destination}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;

  try {
    await fsApi.writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    await fsApi.rename(temporary, destination);
    await fsApi.chmod(destination, 0o600);
  } catch (error) {
    await fsApi.unlink(temporary).catch(() => undefined);
    throw error;
  }
}

function createClient(options, dependencies) {
  if (typeof dependencies.createClient === 'function') {
    return dependencies.createClient(options);
  }

  return new Client(options);
}

function adminConnectionString(config, databaseName = '') {
  if (!databaseName) {
    return config.adminUrl;
  }

  const url = new URL(config.adminUrl);
  url.pathname = `/${encodeURIComponent(databaseName)}`;

  return url.toString();
}

async function withClient(options, dependencies, operation) {
  const client = createClient(options, dependencies);
  await client.connect();

  try {
    return await operation(client);
  } finally {
    await client.end();
  }
}

async function provisionProjectDatabase(sessionId, config, dependencies) {
  const fsApi = dependencies.fsApi || fs;
  const identity = buildProjectDatabaseIdentity(sessionId);
  const stored = await readStoredRecord(config, identity, fsApi);
  const now = new Date().toISOString();
  const record = stored || {
    version: 1,
    ...identity,
    databasePassword: createDatabasePassword(),
    host: config.host,
    port: config.port,
    sslMode: config.sslMode,
    createdAt: now,
    updatedAt: now,
  };
  const role = quoteIdentifier(identity.databaseUser);
  const database = quoteIdentifier(identity.databaseName);
  const password = quoteLiteral(record.databasePassword);

  await withClient(
    {
      connectionString: adminConnectionString(config),
      ssl: config.ssl ? { rejectUnauthorized: config.sslStrict } : false,
    },
    dependencies,
    async (client) => {
      const roleResult = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [identity.databaseUser]);

      if (roleResult.rowCount === 0) {
        await client.query(
          `CREATE ROLE ${role} LOGIN PASSWORD ${password} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT CONNECTION LIMIT ${config.connectionLimit}`,
        );
      } else {
        await client.query(
          `ALTER ROLE ${role} WITH LOGIN PASSWORD ${password} NOCREATEDB NOCREATEROLE NOINHERIT CONNECTION LIMIT ${config.connectionLimit}`,
        );
      }

      const databaseResult = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
        identity.databaseName,
      ]);

      if (databaseResult.rowCount === 0) {
        await client.query(
          `CREATE DATABASE ${database} ENCODING 'UTF8' TEMPLATE template0 CONNECTION LIMIT ${config.connectionLimit}`,
        );
      }

      await client.query(`REVOKE ALL ON DATABASE ${database} FROM PUBLIC`);
      await client.query(`GRANT CONNECT, TEMPORARY ON DATABASE ${database} TO ${role}`);
    },
  );

  await withClient(
    {
      connectionString: adminConnectionString(config, identity.databaseName),
      ssl: config.ssl ? { rejectUnauthorized: config.sslStrict } : false,
    },
    dependencies,
    async (client) => {
      await client.query('REVOKE ALL ON SCHEMA public FROM PUBLIC');
      await client.query(`GRANT USAGE, CREATE ON SCHEMA public TO ${role}`);
    },
  );

  await withClient(
    {
      host: config.host,
      port: config.port,
      database: identity.databaseName,
      user: identity.databaseUser,
      password: record.databasePassword,
      ssl: config.ssl ? { rejectUnauthorized: config.sslStrict } : false,
    },
    dependencies,
    (client) => client.query('SELECT current_database() AS database'),
  );

  record.host = config.host;
  record.port = config.port;
  record.sslMode = config.sslMode;
  record.updatedAt = now;
  await writeStoredRecord(config, identity, record, fsApi);

  return record;
}

export async function ensureProjectDatabase(sessionId, config = buildProjectDatabaseConfig(), dependencies = {}) {
  if (!config?.supported) {
    throw new Error(config?.reason || 'Project database provisioning is unavailable.');
  }

  const identity = buildProjectDatabaseIdentity(sessionId);
  const pendingKey = `${config.secretRoot}:${identity.sessionHash}`;

  if (pendingProvisioning.has(pendingKey)) {
    return await pendingProvisioning.get(pendingKey);
  }

  const pending = provisionProjectDatabase(sessionId, config, dependencies).finally(() => {
    pendingProvisioning.delete(pendingKey);
  });
  pendingProvisioning.set(pendingKey, pending);

  return await pending;
}
