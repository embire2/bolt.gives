#!/usr/bin/env node
// Operator-only provisioning. Never emits credentials or creates payments.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { parse } from 'dotenv';

const args = process.argv.slice(2);
const value = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const envFile = path.resolve(value('--env', '/etc/bolt-gives/runtime.env'));
const origin = new URL(value('--origin', 'https://bolt.gives'));

if (
  origin.protocol !== 'https:' ||
  origin.pathname !== '/' ||
  origin.search ||
  origin.hash ||
  origin.username ||
  origin.password
) {
  throw new Error('An HTTPS application origin without credentials or a path is required.');
}

const url = `${origin.origin}/runtime/billing/stripe/webhook`;
const contents = await fs.readFile(envFile, 'utf8');
const env = parse(contents);

if (!env.BOLT_STRIPE_SECRET_KEY) {
  throw new Error('Protected environment has no Stripe secret key.');
}

const events = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
  'invoice.paid',
  'invoice.payment_failed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
];

async function stripe(route, form) {
  const response = await fetch(`https://api.stripe.com/v1/${route}`, {
    method: form ? 'POST' : 'GET',
    signal: AbortSignal.timeout(20_000),
    headers: {
      Authorization: `Bearer ${env.BOLT_STRIPE_SECRET_KEY}`,
      ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: form ? new URLSearchParams(form) : undefined,
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Stripe request failed (${response.status}; ${data.error?.code || 'unknown'}).`);
  }

  return data;
}

const endpoints = [];
let cursor = '';

do {
  const page = await stripe(`webhook_endpoints?limit=100${cursor ? `&starting_after=${cursor}` : ''}`);
  endpoints.push(...page.data.filter((entry) => entry.url === url));
  cursor = page.has_more ? page.data.at(-1).id : '';
} while (cursor);

if (endpoints.length > 1) {
  throw new Error('Duplicate application webhooks found; refusing an ambiguous update.');
}

let endpoint = endpoints[0];

if (!endpoint && args.includes('--apply')) {
  // Disabled until the operator restarts the runtime with this endpoint's signing secret.
  endpoint = await stripe('webhook_endpoints', {
    url,
    description: 'bolt.gives signed subscription fulfillment',
    ...Object.fromEntries(events.map((event, index) => [`enabled_events[${index}]`, event])),
  });
  await stripe(`webhook_endpoints/${endpoint.id}`, { disabled: 'true' });
  endpoint.status = 'disabled';

  const backup = `${envFile}.before-stripe-${Date.now()}`;
  await fs.copyFile(envFile, backup, fs.constants.COPYFILE_EXCL);
  await fs.chmod(backup, 0o600);

  const updates = { BOLT_STRIPE_WEBHOOK_SECRET: endpoint.secret, BOLT_STRIPE_WEBHOOK_ENDPOINT_ID: endpoint.id };
  const lines = contents
    .split('\n')
    .filter((line) => !Object.keys(updates).some((key) => new RegExp(`^(?:export\\s+)?${key}=`).test(line)));
  lines.push(...Object.entries(updates).map(([key, entry]) => `${key}=${entry}`));

  const temporary = `${envFile}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${lines.join('\n')}\n`, { mode: 0o600, flag: 'wx' });
  await fs.rename(temporary, envFile);
  console.log(
    'Dedicated webhook created disabled; signing secret saved to protected environment. Restart before --enable.',
  );
}

if (args.includes('--enable')) {
  if (!endpoint || endpoint.id !== env.BOLT_STRIPE_WEBHOOK_ENDPOINT_ID || !env.BOLT_STRIPE_WEBHOOK_SECRET) {
    throw new Error('Refusing activation without a saved endpoint identity and signing secret.');
  }

  endpoint = await stripe(`webhook_endpoints/${endpoint.id}`, { disabled: 'false' });
}

console.log(
  JSON.stringify({
    url,
    configured: Boolean(endpoint),
    status: endpoint?.status || 'missing',
    events: endpoint?.enabled_events || [],
  }),
);
