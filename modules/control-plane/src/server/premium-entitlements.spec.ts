import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import {
  activatePremiumEntitlement,
  buildPremiumCheckoutPayload,
  buildProfileBillingCheckoutPayload,
  consumePremiumTaskCredits,
  estimatePremiumTaskCredits,
  normalizePremiumEntitlementRegistry,
  recordPremiumTaskTokens,
  resolvePremiumStripeEventStatus,
  upsertPendingPremiumEntitlement,
  verifyStripeWebhookSignature,
} from './premium-entitlements.mjs';

describe('Custom Domain entitlements', () => {
  it('classifies complex production work above a small copy edit without charging arbitrary credits', () => {
    const copyEdit = estimatePremiumTaskCredits('Change the heading to Hello.', { chatMode: 'build' });
    const fullStack = estimatePremiumTaskCredits(
      'Build a production full-stack app with PostgreSQL authentication, Stripe webhooks, Cloudflare deployment and Playwright e2e tests.',
      { chatMode: 'build', contextFileCount: 12 },
    );

    expect(fullStack).toBeGreaterThan(copyEdit);
    expect(fullStack).toBeLessThanOrEqual(600);
  });

  it('records real API tokens and resets the 10,000-token balance only for a new paid period', () => {
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
    expect(charge.remaining).toBe(10_000);

    if (!charge.ok || !charge.usage) {
      throw new Error('Expected the active Custom Domain task to pass preflight.');
    }

    const usage = recordPremiumTaskTokens(registry, {
      sessionId: 'session-1',
      runId: 'run-1',
      totalTokens: 1_234,
      complexity: charge.usage.complexity,
    });
    expect(usage).toMatchObject({ ok: true, tokens: 1_234, remaining: 8_766, duplicate: false });

    activatePremiumEntitlement(entitlement, {
      eventId: 'evt_2',
      subscriptionId: 'sub_1',
      periodStart: '2026-08-25T00:00:00.000Z',
      periodEnd: '2026-09-22T00:00:00.000Z',
    });
    expect(entitlement.creditsUsed).toBe(0);
  });

  it('refuses tasks after the project token allowance is exhausted', () => {
    const registry = normalizePremiumEntitlementRegistry({
      version: 2,
      entitlements: [
        {
          sessionId: 'session-1',
          deploymentId: 'deployment-1',
          customDomain: 'example.com',
          status: 'active',
          meteringUnit: 'tokens',
          creditsAllowance: 10_000,
          creditsUsed: 10_000,
        },
      ],
    });

    expect(
      consumePremiumTaskCredits(registry, {
        sessionId: 'session-1',
        prompt: 'Fix one button.',
        chatMode: 'build',
      }),
    ).toMatchObject({ ok: false, reason: 'tokens-exhausted', remaining: 0 });
  });

  it('migrates legacy complexity-credit usage to a fresh token meter once', () => {
    const registry = normalizePremiumEntitlementRegistry({
      version: 1,
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

    expect(registry.version).toBe(2);
    expect(registry.entitlements[0]).toMatchObject({
      meteringUnit: 'tokens',
      creditsAllowance: 10_000,
      creditsUsed: 0,
    });
  });

  it('does not double-record tokens when a completion event is retried', () => {
    const registry = normalizePremiumEntitlementRegistry({
      version: 2,
      entitlements: [
        {
          sessionId: 'session-1',
          deploymentId: 'deployment-1',
          customDomain: 'example.com',
          status: 'active',
          meteringUnit: 'tokens',
          creditsAllowance: 10_000,
          creditsUsed: 0,
        },
      ],
    });

    const first = recordPremiumTaskTokens(registry, {
      sessionId: 'session-1',
      runId: 'run-1',
      totalTokens: 400,
      complexity: 'standard',
    });
    const duplicate = recordPremiumTaskTokens(registry, {
      sessionId: 'session-1',
      runId: 'run-1',
      totalTokens: 400,
      complexity: 'standard',
    });

    expect(first).toMatchObject({ tokens: 400, remaining: 9_600, duplicate: false });
    expect(duplicate).toMatchObject({ tokens: 0, remaining: 9_600, duplicate: true });
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

  it('builds a $5 monthly launch subscription with project-scoped metadata', () => {
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
      recurring: { interval: 'month', interval_count: 1 },
    });
    expect(payload.subscription_data.metadata).toMatchObject({
      kind: 'webcoder-premium',
      sessionId: 'session-1',
      deploymentId: 'deployment-1',
      creditsAllowance: '10000',
      billingInterval: 'month',
      launchPromotion: 'true',
      regularValueUsd: '20',
    });
    expect(payload.line_items[0].price_data.product_data.description).toContain('$20/month value');
  });

  it('maps delayed-payment failures and expired Checkout sessions to non-active states', () => {
    expect(resolvePremiumStripeEventStatus('checkout.session.async_payment_failed')).toBe('past_due');
    expect(resolvePremiumStripeEventStatus('invoice.payment_failed')).toBe('past_due');
    expect(resolvePremiumStripeEventStatus('checkout.session.expired')).toBe('canceled');
    expect(resolvePremiumStripeEventStatus('customer.subscription.updated', 'active')).toBe('active');
    expect(resolvePremiumStripeEventStatus('customer.subscription.updated', 'unpaid')).toBe('past_due');
  });

  it('builds an authenticated profile subscription without exposing a Stripe secret', () => {
    const payload = buildProfileBillingCheckoutPayload({
      origin: 'https://bolt.gives',
      profile: { id: 'profile-1', email: 'ada@example.com' },
      priceUsd: 5,
      tokensAllowance: 10_000,
    });

    expect(payload).toMatchObject({
      mode: 'subscription',
      client_reference_id: 'profile-1',
      customer_email: 'ada@example.com',
      subscription_data: {
        metadata: { kind: 'bolt-profile-custom-domain', profileId: 'profile-1', tokensAllowance: '10000' },
      },
    });
    expect(JSON.stringify(payload)).not.toContain('sk_');
  });
});
