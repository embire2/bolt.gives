#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_SUPABASE_VALUE_LENGTH = 4096;

function connectionRecordPath(config, sessionId) {
  const digest = crypto.createHash('sha256').update(String(sessionId)).digest('hex');

  return path.join(config.secretRoot, `${digest}.json`);
}

function parseUrl(value, label) {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${label} is not a valid URL.`);
  }
}

function normalizeSessionId(sessionId) {
  const normalized = String(sessionId || '').trim();

  if (!normalized || normalized.length > 96 || !/^[a-zA-Z0-9_-]+$/.test(normalized)) {
    throw new Error('A valid runtime session is required to configure a project database.');
  }

  return normalized;
}

function assertSupabaseBrowserKey(key) {
  if (/^sb_secret_/i.test(key)) {
    throw new Error('Use a Supabase publishable or anon key, not a secret key.');
  }

  const jwtParts = key.split('.');

  if (jwtParts.length !== 3) {
    return;
  }

  try {
    const payload = JSON.parse(Buffer.from(jwtParts[1], 'base64url').toString('utf8'));

    if (payload?.role === 'service_role') {
      throw new Error('Use a Supabase publishable or anon key, not a service-role key.');
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('service-role key')) {
      throw error;
    }
  }
}

export function buildProjectConnectionConfig(env = process.env, defaultRoot = '/srv/bolt-gives-runtime-workspaces') {
  const configuredRoot = String(env.BOLT_PROJECT_CONNECTION_SECRET_ROOT || '').trim();

  return {
    secretRoot: path.resolve(configuredRoot || path.join(defaultRoot, 'project-connections')),
    connectionTimeoutMs: Math.max(
      1_000,
      Math.min(30_000, Number(env.BOLT_PROJECT_CONNECTION_TIMEOUT_MS || '10000') || 10_000),
    ),
  };
}

export function normalizeProjectConnection(input) {
  const provider = String(input?.provider || '')
    .trim()
    .toLowerCase();

  if (provider === 'supabase') {
    const supabaseUrl = String(input?.supabaseUrl || '')
      .trim()
      .replace(/\/$/, '');
    const anonKey = String(input?.anonKey || '').trim();

    if (!supabaseUrl || supabaseUrl.length > MAX_SUPABASE_VALUE_LENGTH) {
      throw new Error('Enter the Supabase project URL from Project Settings > API.');
    }

    if (!anonKey || anonKey.length < 10 || anonKey.length > MAX_SUPABASE_VALUE_LENGTH) {
      throw new Error('Enter the Supabase publishable or anon key from Project Settings > API.');
    }

    assertSupabaseBrowserKey(anonKey);

    const url = parseUrl(supabaseUrl, 'Supabase project URL');

    if (
      url.protocol !== 'https:' ||
      !url.hostname ||
      !url.hostname.endsWith('.supabase.co') ||
      url.hostname.split('.').length !== 3 ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      throw new Error('Enter the HTTPS project URL supplied by Supabase.');
    }

    return {
      provider: 'supabase',
      supabaseUrl: url.toString().replace(/\/$/, ''),
      anonKey,
    };
  }

  throw new Error('New project database connections support Supabase only.');
}

function normalizeStoredProjectConnection(input) {
  if (String(input?.provider || '').toLowerCase() !== 'postgresql') {
    return normalizeProjectConnection(input);
  }

  const databaseUrl = String(input?.databaseUrl || '').trim();
  const url = parseUrl(databaseUrl, 'Stored PostgreSQL connection string');

  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2) {
    throw new Error('The stored PostgreSQL connection is invalid.');
  }

  return { provider: 'postgresql', databaseUrl: url.toString() };
}

export function sanitizeProjectConnection(record) {
  if (record?.provider === 'supabase' && record.supabaseUrl) {
    const url = parseUrl(record.supabaseUrl, 'Stored Supabase project URL');
    const projectRef = url.hostname.endsWith('.supabase.co') ? url.hostname.split('.')[0] : null;

    return {
      provider: 'supabase',
      status: record.verifiedAt ? 'verified' : 'configured',
      verifiedAt: record.verifiedAt || null,
      label: projectRef || url.hostname,
      host: url.hostname,
      updatedAt: record.updatedAt || null,
    };
  }

  if (record?.provider === 'postgresql' && record.databaseUrl) {
    const url = parseUrl(record.databaseUrl, 'Stored PostgreSQL connection string');
    const databaseName = decodeURIComponent(url.pathname.slice(1));

    return {
      provider: 'postgresql',
      status: record.verifiedAt ? 'verified' : 'configured',
      verifiedAt: record.verifiedAt || null,
      label: `${databaseName}@${url.hostname}`,
      host: url.hostname,
      databaseName,
      updatedAt: record.updatedAt || null,
    };
  }

  return null;
}

export function buildProjectConnectionEnvironment(record, options = {}) {
  if (record?.provider === 'supabase') {
    return {
      VITE_SUPABASE_URL: record.supabaseUrl,
      VITE_SUPABASE_PUBLISHABLE_KEY: record.anonKey,
      VITE_SUPABASE_ANON_KEY: record.anonKey,
      SUPABASE_URL: record.supabaseUrl,
      SUPABASE_PUBLISHABLE_KEY: record.anonKey,
      SUPABASE_ANON_KEY: record.anonKey,
    };
  }

  if (record?.provider !== 'postgresql' || options.target === 'static-build') {
    return {};
  }

  const url = parseUrl(record.databaseUrl, 'Stored PostgreSQL connection string');
  const environment = {
    DATABASE_URL: record.databaseUrl,
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
  };
  const sslMode = url.searchParams.get('sslmode');

  if (sslMode) {
    environment.PGSSLMODE = sslMode;
  }

  return environment;
}

async function writeRecord(config, sessionId, record, fsApi) {
  await fsApi.mkdir(config.secretRoot, { recursive: true, mode: 0o700 });
  await fsApi.chmod(config.secretRoot, 0o700);

  const destination = connectionRecordPath(config, sessionId);
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

export async function readProjectConnection(sessionId, config = buildProjectConnectionConfig(), dependencies = {}) {
  const normalizedSessionId = normalizeSessionId(sessionId);
  const fsApi = dependencies.fsApi || fs;

  try {
    const record = JSON.parse(await fsApi.readFile(connectionRecordPath(config, normalizedSessionId), 'utf8'));
    const normalized = normalizeStoredProjectConnection(record);

    return { ...record, ...normalized };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

export async function verifySupabaseConnection(record, config, dependencies = {}) {
  const fetchFn = dependencies.fetchFn || fetch;
  const verificationUrl = new URL('/rest/v1/', record.supabaseUrl);
  let response;

  try {
    response = await fetchFn(verificationUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: { apikey: record.anonKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(config.connectionTimeoutMs),
    });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new Error('Supabase verification timed out. Check the project URL and try again.');
    }

    throw new Error('Supabase could not be reached. Check the project URL and try again.');
  }

  await response.body?.cancel().catch(() => undefined);

  if (response.status >= 300 && response.status < 400) {
    throw new Error('Supabase redirected the verification request. Use the project URL shown in its Connect dialog.');
  }

  if (!response.ok) {
    throw new Error(
      response.status === 401 || response.status === 403
        ? 'Supabase rejected the publishable key. Copy the Project URL and publishable key from the Connect dialog.'
        : 'Supabase did not confirm this project. Check its status and try again.',
    );
  }
}

export async function saveProjectConnection(
  sessionId,
  input,
  config = buildProjectConnectionConfig(),
  dependencies = {},
) {
  const normalizedSessionId = normalizeSessionId(sessionId);
  const normalized = normalizeProjectConnection(input);
  const verify = dependencies.verifySupabaseConnectionFn || verifySupabaseConnection;
  await verify(normalized, config, dependencies);

  const existing = await readProjectConnection(normalizedSessionId, config, dependencies);
  const now = new Date().toISOString();
  const record = {
    version: 1,
    ...normalized,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    verifiedAt: now,
  };

  await writeRecord(config, normalizedSessionId, record, dependencies.fsApi || fs);

  return record;
}

export async function deleteProjectConnection(sessionId, config = buildProjectConnectionConfig(), dependencies = {}) {
  const normalizedSessionId = normalizeSessionId(sessionId);
  const fsApi = dependencies.fsApi || fs;

  await fsApi.rm(connectionRecordPath(config, normalizedSessionId), { force: true });
}
