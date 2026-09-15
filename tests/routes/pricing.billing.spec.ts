import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getBilling } = vi.hoisted(() => ({ getBilling: vi.fn() }));
vi.mock('~/lib/.server/profile-session', () => ({ getProfileBillingStatus: getBilling }));
vi.mock('@bolt/runtime/lib/.server/runtime-env', () => ({ resolveRuntimeEnvFromContext: () => ({}) }));
import { loader } from '../../modules/surfaces/app/routes/pricing';

async function load(query = '?billing=success') {
  return loader({ request: new Request(`https://app.example/pricing${query}`), context: {}, params: {} } as never);
}

describe('pricing payment confirmation', () => {
  beforeEach(() => {
    getBilling.mockReset();
  });
  it('does not turn a forged success URL into payment confirmation', async () => {
    getBilling.mockResolvedValue(null);
    expect(await (await load()).json()).toMatchObject({ billingState: 'none' });
  });
  it('uses active server entitlements with a valid paid period', async () => {
    getBilling.mockResolvedValue({ plan: 'custom-domain', status: 'active', periodEnd: '2099-01-01T00:00:00Z' });

    const response = await load();
    expect(await response.json()).toMatchObject({ billingState: 'active' });
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
  it('does not confirm an expired active record', async () => {
    getBilling.mockResolvedValue({ plan: 'custom-domain', status: 'active', periodEnd: '2000-01-01T00:00:00Z' });
    expect(await (await load()).json()).toMatchObject({ billingState: 'none' });
  });
  it('distinguishes a delayed webhook from an unavailable billing server', async () => {
    getBilling.mockResolvedValue({ status: 'pending' });
    expect(await (await load()).json()).toMatchObject({ billingState: 'pending' });
    getBilling.mockRejectedValue(new Error('fixture outage'));
    expect(await (await load()).json()).toMatchObject({ billingState: 'unavailable' });
  });
  it('does not request billing when just browsing pricing', async () => {
    expect(await (await load('')).json()).toMatchObject({ billingState: 'none' });
    expect(getBilling).not.toHaveBeenCalled();
  });
});
