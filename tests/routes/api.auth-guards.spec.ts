import { beforeEach, describe, expect, it, vi } from 'vitest';

const adminAuthMocks = vi.hoisted(() => ({
  isTenantAdminAuthorized: vi.fn(),
}));
const runtimeControlMocks = vi.hoisted(() => ({
  fetchRuntimeControlJson: vi.fn(),
}));

vi.mock('~/lib/.server/admin-auth', () => ({
  isTenantAdminAuthorized: adminAuthMocks.isTenantAdminAuthorized,
}));
vi.mock('~/lib/.server/runtime-control', () => ({
  fetchRuntimeControlJson: runtimeControlMocks.fetchRuntimeControlJson,
}));

describe('route-local auth guards', () => {
  beforeEach(() => {
    adminAuthMocks.isTenantAdminAuthorized.mockReset();
    runtimeControlMocks.fetchRuntimeControlJson.mockReset();
  });

  it('blocks managed instance spawn passthrough when caller is not admin-authenticated', async () => {
    adminAuthMocks.isTenantAdminAuthorized.mockResolvedValue(false);
    const route = await import('../../app/routes/api.managed-instances.spawn');

    const response = await route.action({
      request: new Request('https://alpha1.bolt.gives/api/managed-instances/spawn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      context: {},
      params: {},
    } as any);

    expect(response.status).toBe(403);
    expect(runtimeControlMocks.fetchRuntimeControlJson).not.toHaveBeenCalled();
  });

  it('blocks shout send passthrough when caller is not admin-authenticated', async () => {
    adminAuthMocks.isTenantAdminAuthorized.mockResolvedValue(false);
    const route = await import('../../app/routes/api.shout.send');

    const response = await route.action({
      request: new Request('https://alpha1.bolt.gives/api/shout/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author: 'x', content: 'y' }),
      }),
      context: {},
      params: {},
    } as any);

    expect(response.status).toBe(403);
    expect(runtimeControlMocks.fetchRuntimeControlJson).not.toHaveBeenCalled();
  });

  it('returns minimal diagnostics to unauthenticated callers', async () => {
    adminAuthMocks.isTenantAdminAuthorized.mockResolvedValue(false);
    const route = await import('../../app/routes/api.system.diagnostics');

    const response = await route.loader({
      request: new Request('https://alpha1.bolt.gives/api/system/diagnostics'),
      context: {},
      params: {},
    } as any);
    const payload = await response.json();

    expect(payload.authenticated).toBe(false);
    expect(payload.environment).toBeUndefined();
  });

  it('blocks privileged git-info actions when caller is not admin-authenticated', async () => {
    adminAuthMocks.isTenantAdminAuthorized.mockResolvedValue(false);
    const route = await import('../../app/routes/api.system.git-info');

    const response = await route.loader({
      request: new Request('https://alpha1.bolt.gives/api/system/git-info?action=getUser'),
      context: {},
      params: {},
    } as any);

    expect(response.status).toBe(403);
  });

  it('keeps non-privileged local git metadata endpoint available', async () => {
    adminAuthMocks.isTenantAdminAuthorized.mockResolvedValue(false);
    const route = await import('../../app/routes/api.system.git-info');

    const response = await route.loader({
      request: new Request('https://alpha1.bolt.gives/api/system/git-info'),
      context: {},
      params: {},
    } as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.local).toBeTruthy();
  });
});
