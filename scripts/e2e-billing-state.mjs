#!/usr/bin/env node
// Disposable PostgreSQL only. No operator environment, Stripe calls, or real payments.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';

const run = promisify(execFile);
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bolt-billing-state-'));
const uid = process.getuid() === 0 ? 65534 : process.getuid();
const gid = process.getuid() === 0 ? 65534 : process.getgid();
await fs.chown(root, uid, gid);

const options = { cwd: root, uid, gid, env: { PATH: '/usr/bin:/bin', HOME: root } };
const bin = process.env.BOLT_E2E_PG_BIN || '/usr/lib/postgresql/16/bin';
const socket = net.createServer();
await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));

const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));

let postgres;
let pool;

try {
  await run(`${bin}/initdb`, ['-D', `${root}/pg`, '-A', 'trust', '-U', 'fixture', '--no-locale'], options);
  postgres = spawn(`${bin}/postgres`, ['-D', `${root}/pg`, '-h', '127.0.0.1', '-p', String(port), '-k', root], {
    ...options,
    stdio: 'ignore',
  });

  for (let attempt = 0; attempt < 60; attempt++) {
    if (
      await run(`${bin}/pg_isready`, ['-h', '127.0.0.1', '-p', String(port)], options)
        .then(() => true)
        .catch(() => false)
    ) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  process.env.BOLT_ADMIN_DATABASE_URL = `postgresql://fixture@127.0.0.1:${port}/postgres`;
  process.env.BOLT_ADMIN_DATABASE_SSL = 'disable';

  const database = await import('../modules/control-plane/src/server/admin-db.mjs');
  const billing = await import('../modules/control-plane/src/server/profile-billing-db.mjs');
  await database.ensureAdminDatabaseSchema();
  pool = database.getAdminDatabasePool();
  await pool.query(
    "INSERT INTO bolt_admin_client_profiles (id, name, email, created_at, updated_at) VALUES ('owned-fixture', 'Billing fixture', 'billing@example.invalid', NOW(), NOW())",
  );
  await billing.upsertPendingProfileBilling({ profileId: 'owned-fixture', checkoutSessionId: 'cs_fixture' });

  const event = {
    profileId: 'owned-fixture',
    status: 'active',
    eventId: 'evt_paid',
    eventCreated: 100,
    periodStart: '2026-09-01T00:00:00Z',
    periodEnd: '2026-10-01T00:00:00Z',
  };
  await billing.updateProfileBillingFromStripe(event);
  await billing.recordProfileBillingTokens({ profileId: 'owned-fixture', runId: 'run_one', totalTokens: 123 });
  await Promise.all(Array.from({ length: 5 }, () => billing.updateProfileBillingFromStripe(event)));
  assert.equal((await billing.getProfileBilling('owned-fixture')).tokensUsed, 123);
  await billing.updateProfileBillingFromStripe({ ...event, eventId: 'evt_update', eventCreated: 200 });
  await billing.updateProfileBillingFromStripe(event);
  await billing.updateProfileBillingFromStripe({
    ...event,
    eventId: 'evt_delayed',
    eventCreated: 50,
    status: 'canceled',
    periodStart: '2026-08-01T00:00:00Z',
  });

  let state = await billing.getProfileBilling('owned-fixture');
  assert.equal(state.tokensUsed, 123);
  assert.equal(state.status, 'active');
  assert.equal(state.periodStart, '2026-09-01T00:00:00.000Z');
  await billing.updateProfileBillingFromStripe({
    ...event,
    eventId: 'evt_renewed',
    eventCreated: 300,
    periodStart: '2026-10-01T00:00:00Z',
    periodEnd: '2026-11-01T00:00:00Z',
  });
  state = await billing.getProfileBilling('owned-fixture');
  assert.equal(state.tokensUsed, 0);
  assert.equal(state.periodStart, '2026-10-01T00:00:00.000Z');
  console.log(
    'PASS: paid activation, concurrent duplicates, non-adjacent replay, stale cancellation, monotonic periods and renewal.',
  );
} finally {
  await pool?.end();

  if (postgres && postgres.exitCode === null) {
    const closed = once(postgres, 'close');
    postgres.kill('SIGTERM');
    await closed;
  }

  await fs.rm(root, { recursive: true, force: true });
}
