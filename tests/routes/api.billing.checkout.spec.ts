import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createProfileBillingCheckout: vi.fn(),
  resolveProfileSession: vi.fn(),
}));

vi.mock('@bolt/runtime/lib/.server/runtime-env', () => ({
  resolveRuntimeEnvFromContext: () => ({}),
}));

vi.mock('~/lib/.server/profile-session', () => ({
  createProfileBillingCheckout: mocks.createProfileBillingCheckout,
  resolveProfileSession: mocks.resolveProfileSession,
}));

import { action } from '~/routes/api.billing.checkout';

function createRequest(origin = 'https://bolt.gives') {
  return new Request('https://bolt.gives/api/billing/checkout', {
    method: 'POST',
    headers: { Origin: origin },
  });
}

describe('account billing checkout route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects cross-origin checkout attempts', async () => {
    const response = await action({ request: createRequest('https://attacker.example'), context: {} } as never);

    expect(response.status).toBe(403);
    expect(mocks.resolveProfileSession).not.toHaveBeenCalled();
  });

  it('requires an authenticated profile instead of redirecting to Chat', async () => {
    mocks.resolveProfileSession.mockResolvedValue(null);

    const response = await action({ request: createRequest(), context: {} } as never);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ message: 'Login before upgrading your account.' });
    expect(mocks.createProfileBillingCheckout).not.toHaveBeenCalled();
  });

  it('returns the Stripe-hosted checkout URL for an authenticated profile', async () => {
    mocks.resolveProfileSession.mockResolvedValue({ id: 'profile-1' });
    mocks.createProfileBillingCheckout.mockResolvedValue({
      ok: true,
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_123',
    });

    const response = await action({ request: createRequest(), context: {} } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_123',
    });
    expect(mocks.createProfileBillingCheckout).toHaveBeenCalledOnce();
  });
});
