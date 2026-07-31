import { ensureAdminDatabaseSchema, getAdminDatabasePool } from './admin-db.mjs';

export function normalizeProfileBillingTimestamp(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mapProfileBillingRow(row) {
  if (!row) {
    return null;
  }

  const tokensAllowance = Math.max(0, Number(row.tokens_allowance || 0));
  const tokensUsed = Math.max(0, Number(row.tokens_used || 0));

  return {
    profileId: row.profile_id,
    status: row.status,
    stripeCheckoutSessionId: row.stripe_checkout_session_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    stripeCustomerId: row.stripe_customer_id,
    tokensAllowance,
    tokensUsed,
    tokensRemaining: Math.max(0, tokensAllowance - tokensUsed),
    periodStart: normalizeProfileBillingTimestamp(row.period_start),
    periodEnd: normalizeProfileBillingTimestamp(row.period_end),
    lastStripeEventId: row.last_stripe_event_id,
    createdAt: normalizeProfileBillingTimestamp(row.created_at),
    updatedAt: normalizeProfileBillingTimestamp(row.updated_at),
  };
}

export function shouldResetProfileBillingUsage({ status, nextPeriodStart, currentPeriodStart } = {}) {
  return Boolean(status === 'active' && nextPeriodStart && nextPeriodStart !== currentPeriodStart);
}

export async function getProfileBilling(profileId) {
  if (!profileId || !(await ensureAdminDatabaseSchema())) {
    return null;
  }

  const result = await getAdminDatabasePool().query(
    `SELECT * FROM bolt_user_profile_billing WHERE profile_id = $1 LIMIT 1`,
    [profileId],
  );

  return mapProfileBillingRow(result.rows[0]);
}

export async function findProfileBillingByStripe({ profileId, checkoutSessionId, subscriptionId } = {}) {
  if (!(profileId || checkoutSessionId || subscriptionId) || !(await ensureAdminDatabaseSchema())) {
    return null;
  }

  const result = await getAdminDatabasePool().query(
    `
      SELECT *
      FROM bolt_user_profile_billing
      WHERE
        ($1::text IS NOT NULL AND profile_id = $1)
        OR ($2::text IS NOT NULL AND stripe_checkout_session_id = $2)
        OR ($3::text IS NOT NULL AND stripe_subscription_id = $3)
      LIMIT 1
    `,
    [profileId || null, checkoutSessionId || null, subscriptionId || null],
  );

  return mapProfileBillingRow(result.rows[0]);
}

export async function upsertPendingProfileBilling({ profileId, checkoutSessionId, tokensAllowance = 10_000 } = {}) {
  if (!profileId || !checkoutSessionId || !(await ensureAdminDatabaseSchema())) {
    return null;
  }

  const now = new Date().toISOString();
  const result = await getAdminDatabasePool().query(
    `
      INSERT INTO bolt_user_profile_billing (
        profile_id, status, stripe_checkout_session_id, stripe_subscription_id, stripe_customer_id,
        tokens_allowance, tokens_used, period_start, period_end, last_stripe_event_id, created_at, updated_at
      )
      VALUES ($1,'pending',$2,NULL,NULL,$3,0,NULL,NULL,NULL,$4,$4)
      ON CONFLICT (profile_id) DO UPDATE SET
        status = CASE WHEN bolt_user_profile_billing.status = 'active' THEN 'active' ELSE 'pending' END,
        stripe_checkout_session_id = EXCLUDED.stripe_checkout_session_id,
        tokens_allowance = EXCLUDED.tokens_allowance,
        updated_at = EXCLUDED.updated_at
      RETURNING *
    `,
    [profileId, checkoutSessionId, Math.max(1, Number(tokensAllowance || 10_000)), now],
  );

  return mapProfileBillingRow(result.rows[0]);
}

export async function updateProfileBillingFromStripe(input = {}) {
  const current = await findProfileBillingByStripe(input);

  if (!current) {
    return null;
  }

  if (input.eventId && current.lastStripeEventId === input.eventId) {
    return current;
  }

  const nextPeriodStart = input.periodStart || current.periodStart;
  const resetUsage = shouldResetProfileBillingUsage({
    status: input.status,
    nextPeriodStart,
    currentPeriodStart: current.periodStart,
  });
  const result = await getAdminDatabasePool().query(
    `
      UPDATE bolt_user_profile_billing
      SET
        status = $2,
        stripe_checkout_session_id = COALESCE($3, stripe_checkout_session_id),
        stripe_subscription_id = COALESCE($4, stripe_subscription_id),
        stripe_customer_id = COALESCE($5, stripe_customer_id),
        tokens_allowance = $6,
        tokens_used = CASE WHEN $7::boolean THEN 0 ELSE tokens_used END,
        period_start = COALESCE($8::timestamptz, period_start),
        period_end = COALESCE($9::timestamptz, period_end),
        last_stripe_event_id = COALESCE($10, last_stripe_event_id),
        updated_at = $11
      WHERE profile_id = $1
      RETURNING *
    `,
    [
      current.profileId,
      input.status || current.status,
      input.checkoutSessionId || null,
      input.subscriptionId || null,
      input.customerId || null,
      Math.max(1, Number(input.tokensAllowance || current.tokensAllowance || 10_000)),
      resetUsage,
      input.periodStart || null,
      input.periodEnd || null,
      input.eventId || null,
      new Date().toISOString(),
    ],
  );

  return mapProfileBillingRow(result.rows[0]);
}

export async function recordProfileBillingTokens({ profileId, runId, totalTokens } = {}) {
  const tokens = Math.max(0, Math.floor(Number(totalTokens || 0)));

  if (!profileId || !runId || tokens <= 0 || !(await ensureAdminDatabaseSchema())) {
    return await getProfileBilling(profileId);
  }

  const now = new Date().toISOString();
  const result = await getAdminDatabasePool().query(
    `
      WITH inserted AS (
        INSERT INTO bolt_user_profile_billing_usage (run_id, profile_id, tokens, created_at)
        VALUES ($2,$1,$3,$4)
        ON CONFLICT (run_id) DO NOTHING
        RETURNING tokens
      )
      UPDATE bolt_user_profile_billing
      SET
        tokens_used = LEAST(tokens_allowance, tokens_used + COALESCE((SELECT tokens FROM inserted), 0)),
        updated_at = CASE WHEN EXISTS (SELECT 1 FROM inserted) THEN $4 ELSE updated_at END
      WHERE profile_id = $1 AND status = 'active'
      RETURNING *
    `,
    [profileId, runId, tokens, now],
  );

  return mapProfileBillingRow(result.rows[0]) || (await getProfileBilling(profileId));
}
