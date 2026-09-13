#!/usr/bin/env node
// Explicit live Checkout inspection only: never enters card details or submits a payment.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { parse } from 'dotenv';
import { chromium, expect } from 'playwright/test';

if (!process.argv.includes('--live')) {
  throw new Error('Pass --live to create and expire an unpaid operator test checkout.');
}

const base = process.env.BASE_URL || 'https://alpha1.bolt.gives';

if (!['https://alpha1.bolt.gives', 'https://bolt.gives'].includes(base)) {
  throw new Error('Unsupported live acceptance target.');
}

const config = parse(await fs.readFile(process.env.BOLT_E2E_ENV_FILE || '/etc/bolt-gives/alpha-isolated.env', 'utf8'));
const email = `billing-${Date.now()}@example.invalid`;
const output = 'output/playwright/stripe-checkout';
await fs.mkdir(output, { recursive: true, mode: 0o700 });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
let checkoutId;
let pool;
const report = { stages: [], paid: false };

async function stripe(route, method = 'GET') {
  const response = await fetch(`https://api.stripe.com/v1/${route}`, {
    method,
    signal: AbortSignal.timeout(20_000),
    headers: { Authorization: `Bearer ${config.BOLT_STRIPE_SECRET_KEY}` },
  });

  if (!response.ok) {
    throw new Error(`Stripe acceptance request failed (${response.status}).`);
  }

  return response.json();
}

try {
  await page.goto(`${base}/chat`);
  await page.getByLabel('Name and Surname').fill('Billing Acceptance');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Country', { exact: true }).fill('South Africa');
  await page.getByRole('button', { name: 'Create profile and continue' }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.goto(`${base}/pricing`);

  const checkoutResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/billing/checkout',
  );
  await page.getByRole('button', { name: 'Upgrade securely' }).click();

  const response = await checkoutResponse;
  assert.equal(response.status(), 200);

  await page.waitForURL('https://checkout.stripe.com/**', { timeout: 45_000 });
  checkoutId = page.url().match(/cs_(?:live|test)_[A-Za-z0-9]+/)?.[0];
  assert.ok(checkoutId, 'Checkout identity missing');
  await expect(page.getByText('Custom Domain account', { exact: false }).first()).toBeVisible({ timeout: 45_000 });

  const checkout = await stripe(`checkout/sessions/${checkoutId}?expand[]=line_items`);
  assert.equal(checkout.mode, 'subscription');
  assert.equal(checkout.amount_total, 500);
  assert.equal(checkout.currency, 'usd');
  assert.equal(checkout.payment_status, 'unpaid');
  assert.equal(checkout.line_items.data[0].price.recurring.interval, 'month');
  await page.screenshot({ path: `${output}/unpaid-checkout.png`, fullPage: true });
  report.stages.push('normal onboarding and pricing open real USD 5 monthly Stripe Checkout without paying');

  const body = JSON.stringify({
    id: `evt_bolt_acceptance_${crypto.randomUUID()}`,
    type: 'bolt.acceptance.noop',
    data: { object: {} },
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHmac('sha256', config.BOLT_STRIPE_WEBHOOK_SECRET)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  const send = (content, signed) =>
    fetch(`${base}/runtime/billing/stripe/webhook`, {
      method: 'POST',
      body: content,
      headers: {
        'Content-Type': 'application/json',
        ...(signed ? { 'Stripe-Signature': `t=${timestamp},v1=${signature}` } : {}),
      },
      signal: AbortSignal.timeout(20_000),
    });
  assert.equal((await send(body, false)).status, 400);
  assert.equal((await send(`${body} `, true)).status, 400);

  for (let attempt = 0; attempt < 2; attempt++) {
    const webhook = await send(body, true);
    assert.equal(webhook.status, 200);
    assert.equal((await webhook.json()).received, true);
  }
  report.stages.push('public webhook rejects unsigned/tampered requests and accepts a signed no-op replay');
  report.ok = true;
} catch (error) {
  report.ok = false;
  report.error = error.message;
  process.exitCode = 1;
} finally {
  checkoutId ||= page.url().match(/cs_(?:live|test)_[A-Za-z0-9]+/)?.[0];
  await browser.close();

  if (checkoutId) {
    const expired = await stripe(`checkout/sessions/${checkoutId}/expire`, 'POST');
    assert.equal(expired.status, 'expired');
    report.stages.push('owned unpaid checkout expired');
  }

  Object.assign(
    process.env,
    Object.fromEntries(Object.entries(config).filter(([key]) => key.startsWith('BOLT_ADMIN_DATABASE_'))),
  );

  const database = await import('../modules/control-plane/src/server/admin-db.mjs');
  pool = database.getAdminDatabasePool();
  await pool.query('DELETE FROM bolt_admin_client_profiles WHERE email = $1 AND name = $2', [
    email,
    'Billing Acceptance',
  ]);
  await pool.end();
  await fs.writeFile(`${output}/report.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(report));
}
