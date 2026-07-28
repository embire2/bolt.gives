#!/usr/bin/env node

import crypto from 'node:crypto';

export const DEFAULT_PREMIUM_CREDIT_ALLOWANCE = 10_000;

const PREMIUM_STATUSES = new Set(['pending', 'active', 'past_due', 'canceled']);

export function verifyStripeWebhookSignature(rawBody, signatureHeader, secret, options = {}) {
  const toleranceSeconds = Math.max(0, Number(options.toleranceSeconds ?? 300));
  const nowSeconds = Math.floor(Number(options.nowMs ?? Date.now()) / 1000);
  const parts = String(signatureHeader || '')
    .split(',')
    .map((entry) => entry.trim().split('=', 2));
  const timestamp = Number(parts.find(([key]) => key === 't')?.[1]);
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value);

  if (!secret || !Number.isFinite(timestamp) || signatures.length === 0) {
    return false;
  }

  if (toleranceSeconds > 0 && Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    return false;
  }

  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');

  return signatures.some((signature) => {
    try {
      const signatureBuffer = Buffer.from(signature, 'hex');
      return (
        signatureBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
      );
    } catch {
      return false;
    }
  });
}

export function estimatePremiumTaskCredits(prompt, options = {}) {
  const content = String(prompt || '').trim();
  const normalized = content.toLowerCase();
  let credits = options.chatMode === 'build' ? 45 : 20;

  credits += Math.min(120, Math.ceil(content.length / 120) * 4);
  credits += Math.min(80, Math.max(0, Number(options.contextFileCount || 0)) * 2);

  const complexitySignals = [
    [/\b(full[- ]?stack|end[- ]?to[- ]?end|production|architecture|migrat|refactor)\b/g, 30],
    [/\b(database|postgres|authentication|authorization|billing|stripe|webhook|oauth)\b/g, 24],
    [/\b(deploy|cloudflare|docker|kubernetes|server|infrastructure|ci\/cd)\b/g, 22],
    [/\b(test|e2e|playwright|security|performance|accessibility)\b/g, 16],
    [/\b(page|route|component|feature|integration|api)\b/g, 8],
  ];

  for (const [pattern, weight] of complexitySignals) {
    const matches = normalized.match(pattern);
    credits += Math.min(weight * 3, (matches?.length || 0) * weight);
  }

  return Math.max(20, Math.min(600, Math.round(credits)));
}

export function buildPremiumCheckoutPayload(options) {
  const metadata = {
    kind: 'webcoder-premium',
    sessionId: options.deployment.sessionId,
    deploymentId: options.deployment.id,
    subdomain: options.deployment.subdomain,
    boltHostname: options.deployment.hostname,
    customDomain: options.customDomain,
    creditsAllowance: String(options.creditsAllowance),
  };

  return {
    mode: 'subscription',
    success_url: `${options.origin}/chat?premium=success&domain=${encodeURIComponent(options.customDomain)}&checkout_session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${options.origin}/chat?custom_domain=cancelled&domain=${encodeURIComponent(options.customDomain)}`,
    client_reference_id: options.deployment.sessionId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(Number(options.priceUsd) * 100),
          recurring: { interval: 'day', interval_count: 28 },
          product_data: {
            name: 'WebCoder.codes Premium',
            description: `$${options.priceUsd} every 28 days for ${options.customDomain}, Premium Agent access, and ${Number(options.creditsAllowance).toLocaleString('en-US')} credits`,
          },
        },
      },
    ],
    metadata,
    subscription_data: { metadata },
  };
}

export function normalizePremiumEntitlementRegistry(input) {
  const now = new Date().toISOString();

  return {
    version: 1,
    entitlements: (Array.isArray(input?.entitlements) ? input.entitlements : [])
      .map((entry) => ({
        id: String(entry?.id || crypto.randomUUID()),
        sessionId: String(entry?.sessionId || ''),
        deploymentId: String(entry?.deploymentId || ''),
        customDomain: String(entry?.customDomain || '')
          .trim()
          .toLowerCase(),
        status: PREMIUM_STATUSES.has(entry?.status) ? entry.status : 'pending',
        stripeCheckoutSessionId:
          typeof entry?.stripeCheckoutSessionId === 'string' ? entry.stripeCheckoutSessionId : null,
        stripeSubscriptionId: typeof entry?.stripeSubscriptionId === 'string' ? entry.stripeSubscriptionId : null,
        stripeCustomerId: typeof entry?.stripeCustomerId === 'string' ? entry.stripeCustomerId : null,
        creditsAllowance: Math.max(1, Number(entry?.creditsAllowance || DEFAULT_PREMIUM_CREDIT_ALLOWANCE)),
        creditsUsed: Math.max(0, Number(entry?.creditsUsed || 0)),
        periodStart: typeof entry?.periodStart === 'string' ? entry.periodStart : null,
        periodEnd: typeof entry?.periodEnd === 'string' ? entry.periodEnd : null,
        lastStripeEventId: typeof entry?.lastStripeEventId === 'string' ? entry.lastStripeEventId : null,
        createdAt: typeof entry?.createdAt === 'string' ? entry.createdAt : now,
        updatedAt: typeof entry?.updatedAt === 'string' ? entry.updatedAt : now,
      }))
      .filter((entry) => entry.sessionId && entry.deploymentId),
    usage: (Array.isArray(input?.usage) ? input.usage : []).slice(-2000),
    processedStripeEventIds: (Array.isArray(input?.processedStripeEventIds) ? input.processedStripeEventIds : []).slice(
      -1000,
    ),
    events: (Array.isArray(input?.events) ? input.events : []).slice(-500),
  };
}

export function upsertPendingPremiumEntitlement(registry, input) {
  let entitlement = registry.entitlements.find((entry) => entry.sessionId === input.sessionId);
  const now = new Date().toISOString();

  if (!entitlement) {
    entitlement = {
      id: crypto.randomUUID(),
      sessionId: input.sessionId,
      deploymentId: input.deploymentId,
      customDomain: input.customDomain,
      status: 'pending',
      stripeCheckoutSessionId: input.stripeCheckoutSessionId || null,
      stripeSubscriptionId: null,
      stripeCustomerId: null,
      creditsAllowance: Number(input.creditsAllowance || DEFAULT_PREMIUM_CREDIT_ALLOWANCE),
      creditsUsed: 0,
      periodStart: null,
      periodEnd: null,
      lastStripeEventId: null,
      createdAt: now,
      updatedAt: now,
    };
    registry.entitlements.unshift(entitlement);
  } else {
    entitlement.deploymentId = input.deploymentId;
    entitlement.customDomain = input.customDomain;
    entitlement.stripeCheckoutSessionId = input.stripeCheckoutSessionId || entitlement.stripeCheckoutSessionId;
    entitlement.updatedAt = now;
  }

  return entitlement;
}

export function activatePremiumEntitlement(entitlement, input = {}) {
  const nextPeriodStart = input.periodStart || entitlement.periodStart;
  const isNewPaidPeriod = Boolean(nextPeriodStart && nextPeriodStart !== entitlement.periodStart);

  entitlement.status = 'active';
  entitlement.stripeCheckoutSessionId = input.checkoutSessionId || entitlement.stripeCheckoutSessionId;
  entitlement.stripeSubscriptionId = input.subscriptionId || entitlement.stripeSubscriptionId;
  entitlement.stripeCustomerId = input.customerId || entitlement.stripeCustomerId;
  entitlement.periodStart = nextPeriodStart || null;
  entitlement.periodEnd = input.periodEnd || entitlement.periodEnd;
  entitlement.lastStripeEventId = input.eventId || entitlement.lastStripeEventId;
  entitlement.updatedAt = new Date().toISOString();

  if (isNewPaidPeriod) {
    entitlement.creditsUsed = 0;
  }

  return entitlement;
}

export function updatePremiumEntitlementStatus(entitlement, status, eventId) {
  entitlement.status = PREMIUM_STATUSES.has(status) ? status : entitlement.status;
  entitlement.lastStripeEventId = eventId || entitlement.lastStripeEventId;
  entitlement.updatedAt = new Date().toISOString();

  return entitlement;
}

export function resolvePremiumStripeEventStatus(eventType, subscriptionStatus = '') {
  if (eventType === 'checkout.session.async_payment_failed' || eventType === 'invoice.payment_failed') {
    return 'past_due';
  }

  if (eventType === 'checkout.session.expired' || eventType === 'customer.subscription.deleted') {
    return 'canceled';
  }

  if (eventType.startsWith('customer.subscription.')) {
    if (subscriptionStatus === 'active' || subscriptionStatus === 'trialing') {
      return 'active';
    }

    if (subscriptionStatus === 'canceled' || subscriptionStatus === 'incomplete_expired') {
      return 'canceled';
    }

    return 'past_due';
  }

  return null;
}

export function consumePremiumTaskCredits(registry, input) {
  const entitlement = registry.entitlements.find(
    (entry) => entry.sessionId === input.sessionId && entry.status === 'active',
  );

  if (!entitlement) {
    return { ok: false, reason: 'inactive', credits: 0, remaining: 0, entitlement: null };
  }

  const credits = estimatePremiumTaskCredits(input.prompt, input);
  const remaining = Math.max(0, entitlement.creditsAllowance - entitlement.creditsUsed);

  if (credits > remaining) {
    return { ok: false, reason: 'credits-exhausted', credits, remaining, entitlement };
  }

  entitlement.creditsUsed += credits;
  entitlement.updatedAt = new Date().toISOString();

  const usage = {
    id: crypto.randomUUID(),
    sessionId: input.sessionId,
    credits,
    complexity: credits >= 300 ? 'deep' : credits >= 140 ? 'advanced' : credits >= 70 ? 'standard' : 'quick',
    promptHash: crypto
      .createHash('sha256')
      .update(String(input.prompt || ''))
      .digest('hex'),
    chatMode: input.chatMode === 'build' ? 'build' : 'discuss',
    createdAt: entitlement.updatedAt,
  };
  registry.usage = [...registry.usage.slice(-1999), usage];

  return {
    ok: true,
    reason: null,
    credits,
    remaining: Math.max(0, entitlement.creditsAllowance - entitlement.creditsUsed),
    entitlement,
    usage,
  };
}

export function appendPremiumEntitlementEvent(registry, event) {
  registry.events = [
    ...registry.events.slice(-499),
    {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...event,
    },
  ];
}

export function sanitizePremiumEntitlement(entitlement) {
  if (!entitlement) {
    return {
      plan: 'free',
      status: 'inactive',
      creditsAllowance: 0,
      creditsUsed: 0,
      creditsRemaining: 0,
      periodEnd: null,
      customDomain: null,
    };
  }

  return {
    plan: 'webcoder-premium',
    status: entitlement.status,
    creditsAllowance: entitlement.creditsAllowance,
    creditsUsed: entitlement.creditsUsed,
    creditsRemaining: Math.max(0, entitlement.creditsAllowance - entitlement.creditsUsed),
    periodEnd: entitlement.periodEnd,
    customDomain: entitlement.customDomain,
  };
}
