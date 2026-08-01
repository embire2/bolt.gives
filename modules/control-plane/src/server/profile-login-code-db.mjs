#!/usr/bin/env node

import { ensureAdminDatabaseSchema, findClientProfileByEmail, getAdminDatabasePool } from './admin-db.mjs';

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
    lastLoginAt: row.last_login_at,
    lastInstanceSlug: row.last_instance_slug,
    lastInstanceStatus: row.last_instance_status,
    lastInstanceUrl: row.last_instance_url,
  };
}

export async function createClientProfileLoginCode({ email, id, codeHash, createdAt, expiresAt } = {}) {
  const profile = await findClientProfileByEmail(email);

  if (!profile || !id || !codeHash || !createdAt || !expiresAt) {
    return null;
  }

  const client = await getAdminDatabasePool().connect();

  try {
    await client.query('BEGIN');
    await client.query(
      `
        UPDATE bolt_user_profile_login_codes
        SET consumed_at = $2
        WHERE profile_id = $1 AND consumed_at IS NULL
      `,
      [profile.id, createdAt],
    );
    await client.query(
      `
        INSERT INTO bolt_user_profile_login_codes (
          id, profile_id, code_hash, created_at, expires_at, consumed_at, failed_attempts
        )
        VALUES ($1,$2,$3,$4,$5,NULL,0)
      `,
      [id, profile.id, codeHash, createdAt, expiresAt],
    );
    await client.query('COMMIT');

    return profile;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function consumeClientProfileLoginCode({ id, codeHash, maxAttempts = 5, now = new Date() } = {}) {
  if (!id || !codeHash || !(await ensureAdminDatabaseSchema())) {
    return null;
  }

  const client = await getAdminDatabasePool().connect();
  const nowIso = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const normalizedMaxAttempts = Math.max(1, Number(maxAttempts) || 5);

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `
        SELECT p.*, c.code_hash AS login_code_hash, c.failed_attempts
        FROM bolt_user_profile_login_codes c
        JOIN bolt_admin_client_profiles p ON p.id = c.profile_id
        WHERE
          c.id = $1
          AND c.consumed_at IS NULL
          AND c.expires_at > $2::timestamptz
          AND c.failed_attempts < $3
        FOR UPDATE OF c
        LIMIT 1
      `,
      [id, nowIso, normalizedMaxAttempts],
    );

    if (!result.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }

    if (result.rows[0].login_code_hash !== codeHash) {
      await client.query(
        `
          UPDATE bolt_user_profile_login_codes
          SET failed_attempts = failed_attempts + 1
          WHERE id = $1
        `,
        [id],
      );
      await client.query('COMMIT');

      return null;
    }

    await client.query(
      `
        UPDATE bolt_user_profile_login_codes
        SET consumed_at = $2
        WHERE id = $1
      `,
      [id, nowIso],
    );
    await client.query('COMMIT');

    return mapClientProfileRow(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
