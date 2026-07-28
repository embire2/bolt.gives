import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import {
  activatePremiumEntitlement,
  buildPremiumCheckoutPayload,
  consumePremiumTaskCredits,
  estimatePremiumTaskCredits,
  normalizePremiumEntitlementRegistry,
  resolvePremiumStripeEventStatus,
  upsertPendingPremiumEntitlement,
  verifyStripeWebhookSignature,
} from './premium-entitlements.mjs';

describe('WebCoder Premium entitlements', () => {
  it('charges more credits for complex production work than a small copy edit', () => {
    const copyEdit = estimatePremiumTaskCredits('Change the heading to Hello.', { chatMode: 'build' });
    const fullStack = estimatePremiumTaskCredits(
      'Build a production full-stack app with PostgreSQL authentication, Stripe webhooks, Cloudflare deployment and Playwright e2e tests.',
      { chatMode: 'build', contextFileCount: 12 },
    );

    expect(fullStack).toBeGreaterThan(copyEdit);
    expect(fullStack).toBeLessThanOrEqual(600);
  });

  it('resets 10,000 credits only when Stripe confirms a new paid period', () => {
    const registry = normalizePremiumEntitlementRegistry({});
    const entitlement = upsertPendingPremiumEntitlement(registry, {
      sessionId: 'session-1',
      deploymentId: 'deployment-1',
      customDomain: 'example.com',
      stripeCheckoutSessionId: 'cs_1',
    });
    activatePremiumEntitlement(entitlement, {
      eventId: 'evt_1',
      subscriptionId: 'sub_1',
      periodStart: '2026-07-28T00:00:00.000Z',
      periodEnd: '2026-08-25T00:00:00.000Z',
    });

    const charge = consumePremiumTaskCredits(registry, {
      sessionId: 'session-1',
      prompt: 'Build and test a dashboard.',
      chatMode: 'build',
    });
    expect(charge.ok).toBe(true);
    expect(charge.remaining).toBeLessThan(10_000);

    activatePremiumEntitlement(entitlement, {
      eventId: 'evt_2',
      subscriptionId: 'sub_1',
      periodStart: '2026-08-25T00:00:00.000Z',
      periodEnd: '2026-09-22T00:00:00.000Z',
    });
    expect(entitlement.creditsUsed).toBe(0);
  });

  it('refuses tasks after the project allowance is exhausted', () => {
    const registry = normalizePremiumEntitlementRegistry({
      entitlements: [
        {
          sessionId: 'session-1',
          deploymentId: 'deployment-1',
          customDomain: 'example.com',
          status: 'active',
          creditsAllowance: 10_000,
          creditsUsed: 9_995,
        },
      ],
    });

    expect(
      consumePremiumTaskCredits(registry, {
        sessionId: 'session-1',
        prompt: 'Fix one button.',
        chatMode: 'build',
      }),
    ).toMatchObject({ ok: false, reason: 'credits-exhausted', remaining: 5 });
  });

  it('verifies Stripe signatures against the unmodified request body and rejects stale payloads', () => {
    const body = '{"id":"evt_1"}';
    const secret = 'whsec_test';
    const timestamp = 1_800_000_000;
    const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');

    expect(
      verifyStripeWebhookSignature(body, `t=${timestamp},v1=${signature}`, secret, {
        nowMs: timestamp * 1000,
      }),
    ).toBe(true);
    expect(
      verifyStripeWebhookSignature(`${body}\n`, `t=${timestamp},v1=${signature}`, secret, {
        nowMs: timestamp * 1000,
      }),
    ).toBe(false);
    expect(
      verifyStripeWebhookSignature(body, `t=${timestamp},v1=${signature}`, secret, {
        nowMs: (timestamp + 301) * 1000,
      }),
    ).toBe(false);
  });

  it('builds a $5 subscription that renews every 28 days with project-scoped metadata', () => {
    const payload = buildPremiumCheckoutPayload({
      origin: 'https://premium.bolt.gives',
      customDomain: 'example.com',
      priceUsd: 5,
      creditsAllowance: 10_000,
      deployment: {
        id: 'deployment-1',
        sessionId: 'session-1',
        subdomain: 'example',
        hostname: 'example.bolt.gives',
      },
    });

    expect(payload.mode).toBe('subscription');
    expect(payload.line_items[0].price_data).toMatchObject({
      unit_amount: 500,
      recurring: { interval: 'day', interval_count: 28 },
    });
    expect(payload.subscription_data.metadata).toMatchObject({
      kind: 'webcoder-premium',
      sessionId: 'session-1',
      deploymentId: 'deployment-1',
      creditsAllowance: '10000',
    });
  });

  it('maps delayed-payment failures and expired Checkout sessions to non-active states', () => {
    expect(resolvePremiumStripeEventStatus('checkout.session.async_payment_failed')).toBe('past_due');
    expect(resolvePremiumStripeEventStatus('invoice.payment_failed')).toBe('past_due');
    expect(resolvePremiumStripeEventStatus('checkout.session.expired')).toBe('canceled');
    expect(resolvePremiumStripeEventStatus('customer.subscription.updated', 'active')).toBe('active');
    expect(resolvePremiumStripeEventStatus('customer.subscription.updated', 'unpaid')).toBe('past_due');
  });
});
