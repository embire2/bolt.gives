#!/usr/bin/env node

import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;

let pool = null;
let schemaPromise = null;

function envValue(env, key) {
  return String(env?.[key] || '').trim();
}

export function buildAdminDatabaseConfig(env = /** @type {Record<string, string | undefined>} */ (process.env)) {
  const connectionString = envValue(env, 'BOLT_ADMIN_DATABASE_URL');
  const host = envValue(env, 'BOLT_ADMIN_DATABASE_HOST');
  const port = Number(envValue(env, 'BOLT_ADMIN_DATABASE_PORT') || '5432');
  const database = envValue(env, 'BOLT_ADMIN_DATABASE_NAME');
  const user = envValue(env, 'BOLT_ADMIN_DATABASE_USER');
  const password = envValue(env, 'BOLT_ADMIN_DATABASE_PASSWORD');
  const schema = envValue(env, 'BOLT_ADMIN_DATABASE_SCHEMA') || 'public';
  const sslMode = (envValue(env, 'BOLT_ADMIN_DATABASE_SSL') || 'require').toLowerCase();
  const enabled = Boolean(connectionString || (host && database && user && password));

  return {
    enabled,
    schema,
    transportLabel: enabled ? 'PostgreSQL' : null,
    poolOptions: enabled
      ? connectionString
        ? {
            connectionString,
            ssl: sslMode === 'disable' ? false : { rejectUnauthorized: sslMode === 'verify-full' },
          }
        : {
            host,
            port,
            database,
            user,
            password,
            ssl: sslMode === 'disable' ? false : { rejectUnauthorized: sslMode === 'verify-full' },
          }
      : null,
  };
}

function createPool() {
  const config = buildAdminDatabaseConfig();

  if (!config.enabled || !config.poolOptions) {
    return null;
  }

  return new Pool({
    ...config.poolOptions,
    max: 6,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
  });
}

export function isAdminDatabaseConfigured(env = /** @type {Record<string, string | undefined>} */ (process.env)) {
  return buildAdminDatabaseConfig(env).enabled;
}

export function getAdminDatabasePool() {
  if (!pool) {
    pool = createPool();
  }

  return pool;
}

export async function ensureAdminDatabaseSchema() {
  const config = buildAdminDatabaseConfig();

  if (!config.enabled) {
    return false;
  }

  if (!schemaPromise) {
    schemaPromise = (async () => {
      const client = await getAdminDatabasePool().connect();

      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS bolt_admin_client_profiles (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            company TEXT NULL,
            role TEXT NULL,
            phone TEXT NULL,
            country TEXT NULL,
            use_case TEXT NULL,
            requested_subdomain TEXT NULL,
            registration_source TEXT NULL,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            last_instance_slug TEXT NULL,
            last_instance_status TEXT NULL,
            last_instance_url TEXT NULL
          );
        `);

        await client.query(`
          CREATE TABLE IF NOT EXISTS bolt_admin_managed_instances (
            instance_id TEXT PRIMARY KEY,
            profile_email TEXT NOT NULL,
            name TEXT NOT NULL,
            project_name TEXT NOT NULL UNIQUE,
            route_hostname TEXT NOT NULL,
            pages_url TEXT NOT NULL,
            plan TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            trial_ends_at TIMESTAMPTZ NULL,
            current_git_sha TEXT NULL,
            previous_git_sha TEXT NULL,
            last_rollout_at TIMESTAMPTZ NULL,
            last_deployment_url TEXT NULL,
            last_error TEXT NULL,
            suspended_at TIMESTAMPTZ NULL,
            expired_at TIMESTAMPTZ NULL,
            source_branch TEXT NOT NULL
          );
        `);

        await client.query(`
          CREATE TABLE IF NOT EXISTS bolt_admin_email_messages (
            id TEXT PRIMARY KEY,
            profile_email TEXT NOT NULL,
            subject TEXT NOT NULL,
            body TEXT NOT NULL,
            status TEXT NOT NULL,
            transport TEXT NULL,
            error TEXT NULL,
            actor TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL,
            sent_at TIMESTAMPTZ NULL
          );
        `);

        await client.query(
          `CREATE INDEX IF NOT EXISTS bolt_admin_client_profiles_email_idx ON bolt_admin_client_profiles (email);`,
        );
        await client.query(
          `CREATE INDEX IF NOT EXISTS bolt_admin_managed_instances_profile_email_idx ON bolt_admin_managed_instances (profile_email);`,
        );
        await client.query(
          `CREATE INDEX IF NOT EXISTS bolt_admin_email_messages_profile_email_idx ON bolt_admin_email_messages (profile_email);`,
        );
        await client.query(`
          ALTER TABLE bolt_admin_managed_instances
          ALTER COLUMN trial_ends_at DROP NOT NULL;
        `);
      } finally {
        client.release();
      }
    })();
  }

  await schemaPromise;
  return true;
}

export function normalizeClientProfileInput(input = {}) {
  return {
    name: String(input.name || '').trim(),
    email: String(input.email || '')
      .trim()
      .toLowerCase(),
    company: String(input.company || '').trim() || null,
    role: String(input.role || '').trim() || null,
    phone: String(input.phone || '').trim() || null,
    country: String(input.country || '').trim() || null,
    useCase: String(input.useCase || '').trim() || null,
    requestedSubdomain: String(input.requestedSubdomain || '').trim().toLowerCase() || null,
    registrationSource: String(input.registrationSource || '').trim() || null,
  };
}

function mapClientProfileRow(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    company: row.company,
    role: row.role,
    phone: row.phone,
    country: row.country,
    useCase: row.use_case,
    requestedSubdomain: row.requested_subdomain,
    registrationSource: row.registration_source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastInstanceSlug: row.last_instance_slug,
    lastInstanceStatus: row.last_instance_status,
    lastInstanceUrl: row.last_instance_url,
  };
}

export async function upsertClientProfile(input = {}) {
  const profile = normalizeClientProfileInput(input);

  if (!profile.name || !profile.email) {
    throw new Error('Client profile requires both name and email.');
  }

  if (!(await ensureAdminDatabaseSchema())) {
    return null;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const result = await getAdminDatabasePool().query(
    `
      INSERT INTO bolt_admin_client_profiles (
        id, name, email, company, role, phone, country, use_case, requested_subdomain, registration_source,
        created_at, updated_at, last_instance_slug, last_instance_status, last_instance_url
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,NULL,NULL,NULL)
      ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        company = EXCLUDED.company,
        role = EXCLUDED.role,
        phone = EXCLUDED.phone,
        country = EXCLUDED.country,
        use_case = EXCLUDED.use_case,
        requested_subdomain = EXCLUDED.requested_subdomain,
        registration_source = EXCLUDED.registration_source,
        updated_at = EXCLUDED.updated_at
      RETURNING *
    `,
    [
      id,
      profile.name,
      profile.email,
      profile.company,
      profile.role,
      profile.phone,
      profile.country,
      profile.useCase,
      profile.requestedSubdomain,
      profile.registrationSource,
      now,
    ],
  );

  return mapClientProfileRow(result.rows[0]);
}

export async function listClientProfiles() {
  if (!(await ensureAdminDatabaseSchema())) {
    return [];
  }

  const result = await getAdminDatabasePool().query(`
    SELECT *
    FROM bolt_admin_client_profiles
    ORDER BY updated_at DESC, created_at DESC
  `);

  return result.rows.map(mapClientProfileRow);
}

function mapManagedInstanceRow(row) {
  return {
    id: row.instance_id,
    email: row.profile_email,
    name: row.name,
    projectName: row.project_name,
    routeHostname: row.route_hostname,
    pagesUrl: row.pages_url,
    plan: row.plan,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    trialEndsAt: row.trial_ends_at,
    currentGitSha: row.current_git_sha,
    previousGitSha: row.previous_git_sha,
    lastRolloutAt: row.last_rollout_at,
    lastDeploymentUrl: row.last_deployment_url,
    lastError: row.last_error,
    suspendedAt: row.suspended_at,
    expiredAt: row.expired_at,
    sourceBranch: row.source_branch,
  };
}

export async function upsertManagedInstanceAssignment(instance) {
  if (!(await ensureAdminDatabaseSchema()) || !instance?.id || !instance?.email) {
    return null;
  }

  const result = await getAdminDatabasePool().query(
    `
      INSERT INTO bolt_admin_managed_instances (
        instance_id, profile_email, name, project_name, route_hostname, pages_url, plan, status,
        created_at, updated_at, trial_ends_at, current_git_sha, previous_git_sha, last_rollout_at,
        last_deployment_url, last_error, suspended_at, expired_at, source_branch
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,
        $9,$10,$11,$12,$13,$14,
        $15,$16,$17,$18,$19
      )
      ON CONFLICT (instance_id) DO UPDATE SET
        profile_email = EXCLUDED.profile_email,
        name = EXCLUDED.name,
        project_name = EXCLUDED.project_name,
        route_hostname = EXCLUDED.route_hostname,
        pages_url = EXCLUDED.pages_url,
        plan = EXCLUDED.plan,
        status = EXCLUDED.status,
        updated_at = EXCLUDED.updated_at,
        trial_ends_at = EXCLUDED.trial_ends_at,
        current_git_sha = EXCLUDED.current_git_sha,
        previous_git_sha = EXCLUDED.previous_git_sha,
        last_rollout_at = EXCLUDED.last_rollout_at,
        last_deployment_url = EXCLUDED.last_deployment_url,
        last_error = EXCLUDED.last_error,
        suspended_at = EXCLUDED.suspended_at,
        expired_at = EXCLUDED.expired_at,
        source_branch = EXCLUDED.source_branch
      RETURNING *
    `,
    [
      instance.id,
      instance.email,
      instance.name,
      instance.projectName,
      instance.routeHostname,
      instance.pagesUrl,
      instance.plan,
      instance.status,
      instance.createdAt,
      instance.updatedAt,
      instance.trialEndsAt,
      instance.currentGitSha,
      instance.previousGitSha,
      instance.lastRolloutAt,
      instance.lastDeploymentUrl,
      instance.lastError,
      instance.suspendedAt,
      instance.expiredAt,
      instance.sourceBranch,
    ],
  );

  await getAdminDatabasePool().query(
    `
      UPDATE bolt_admin_client_profiles
      SET
        last_instance_slug = $2,
        last_instance_status = $3,
        last_instance_url = $4,
        updated_at = GREATEST(updated_at, $5::timestamptz)
      WHERE email = $1
    `,
    [instance.email, instance.projectName, instance.status, instance.pagesUrl, instance.updatedAt || new Date().toISOString()],
  );

  return mapManagedInstanceRow(result.rows[0]);
}

export async function syncManagedInstanceAssignments(instances = []) {
  if (!(await ensureAdminDatabaseSchema())) {
    return [];
  }

  const results = [];

  for (const instance of instances) {
    const row = await upsertManagedInstanceAssignment(instance);

    if (row) {
      results.push(row);
    }
  }

  return results;
}

export async function listManagedInstanceAssignments() {
  if (!(await ensureAdminDatabaseSchema())) {
    return [];
  }

  const result = await getAdminDatabasePool().query(`
    SELECT *
    FROM bolt_admin_managed_instances
    ORDER BY updated_at DESC, created_at DESC
  `);

  return result.rows.map(mapManagedInstanceRow);
}

function mapEmailMessageRow(row) {
  return {
    id: row.id,
    profileEmail: row.profile_email,
    subject: row.subject,
    body: row.body,
    status: row.status,
    transport: row.transport,
    error: row.error,
    actor: row.actor,
    createdAt: row.created_at,
    sentAt: row.sent_at,
  };
}

export async function recordAdminEmailMessage(input = {}) {
  if (!(await ensureAdminDatabaseSchema())) {
    return null;
  }

  const id = crypto.randomUUID();
  const createdAt = input.createdAt || new Date().toISOString();
  const result = await getAdminDatabasePool().query(
    `
      INSERT INTO bolt_admin_email_messages (
        id, profile_email, subject, body, status, transport, error, actor, created_at, sent_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
    `,
    [
      id,
      String(input.profileEmail || '')
        .trim()
        .toLowerCase(),
      String(input.subject || '').trim(),
      String(input.body || ''),
      String(input.status || 'draft'),
      input.transport ? String(input.transport) : null,
      input.error ? String(input.error) : null,
      String(input.actor || 'admin'),
      createdAt,
      input.sentAt || null,
    ],
  );

  return mapEmailMessageRow(result.rows[0]);
}

export async function listAdminEmailMessages(limit = 100) {
  if (!(await ensureAdminDatabaseSchema())) {
    return [];
  }

  const result = await getAdminDatabasePool().query(
    `
      SELECT *
      FROM bolt_admin_email_messages
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [limit],
  );

  return result.rows.map(mapEmailMessageRow);
}
