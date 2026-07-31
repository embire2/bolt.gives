import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createCheckout: vi.fn() }));

vi.mock('@bolt/runtime/lib/runtime/hosted-runtime-client', () => ({
  createHostedRuntimeCustomDomainCheckout: mocks.createCheckout,
}));

import { startCustomDomainBilling } from './custom-domain-account';

describe('Custom Domain account attachment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('attaches an already-paid account without creating another Checkout session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true, dnsInstructions: { note: 'Create the A record.' } }), {
          status: 200,
        }),
      ),
    );

    await expect(
      startCustomDomainBilling({ sessionId: 'session-1', customDomain: 'app.example.com' }),
    ).resolves.toEqual({ status: 'Create the A record.', checkoutUrl: null });
    expect(mocks.createCheckout).not.toHaveBeenCalled();
  });

  it('falls back to Stripe Checkout when the account is not paid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: false, requiresCheckout: true }), {
          status: 402,
        }),
      ),
    );
    mocks.createCheckout.mockResolvedValue({
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_123',
      dnsInstructions: { note: 'Checkout required.' },
    });

    await expect(
      startCustomDomainBilling({ sessionId: 'session-1', customDomain: 'app.example.com' }),
    ).resolves.toEqual({
      status: 'Checkout required.',
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_123',
    });
    expect(mocks.createCheckout).toHaveBeenCalledOnce();
  });
});
