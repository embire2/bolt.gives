import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runtimeControlMocks = vi.hoisted(() => ({
  fetchRuntimeControlJson: vi.fn(),
}));

vi.mock('~/lib/.server/runtime-control', () => ({
  fetchRuntimeControlJson: runtimeControlMocks.fetchRuntimeControlJson,
}));

describe('managed instances route', () => {
  beforeEach(() => {
    runtimeControlMocks.fetchRuntimeControlJson.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('falls back to the signed session cookie instance when runtime session lookup fails', async () => {
    const route = await import('../../app/routes/managed-instances');

    runtimeControlMocks.fetchRuntimeControlJson.mockImplementation(async (pathname: string) => {
      if (pathname === '/managed-instances/spawn') {
        return {
          ok: true,
          sessionToken: 'session-token-123',
          instance: {
            id: 'instance-1',
            projectName: 'clinic-trial',
            email: 'owner@example.com',
            pagesUrl: 'https://clinic-trial.pages.dev',
            trialEndsAt: '2026-04-19T12:00:00.000Z',
            currentGitSha: 'abc1234',
            currentDeploymentId: null,
            status: 'active',
            createdAt: '2026-04-04T12:00:00.000Z',
            updatedAt: '2026-04-04T12:05:00.000Z',
            lastError: null,
          },
        };
      }

      if (pathname === '/managed-instances/config') {
        return {
          supported: true,
          trialDays: 15,
          rootDomain: 'pages.dev',
          sourceBranch: 'main',
        };
      }

      if (pathname.startsWith('/managed-instances/session')) {
        throw new Error('Managed instance session not found.');
      }

      throw new Error(`Unexpected runtime pathname: ${pathname}`);
    });

    const actionRequest = new Request('https://alpha1.bolt.gives/managed-instances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        intent: 'spawn',
        name: 'Owner Example',
        email: 'owner@example.com',
        subdomain: 'clinic-trial',
        company: 'OpenWeb',
        role: 'Founder',
        phone: '+27 11 555 0101',
        country: 'South Africa',
        useCase: 'Clinic scheduling prototype',
      }),
    });

    const actionResponse = await route.action({
      request: actionRequest,
      context: {},
      params: {},
    } as any);

    expect(actionResponse.status).toBe(302);

    const setCookie = actionResponse.headers.get('Set-Cookie');
    expect(setCookie).toBeTruthy();

    const loaderResponse = await route.loader({
      request: new Request('https://alpha1.bolt.gives/managed-instances', {
        headers: { Cookie: String(setCookie).split(';')[0] },
      }),
      context: {},
      params: {},
    } as any);

    expect(loaderResponse.status).toBe(200);

    const payload = await loaderResponse.json();

    expect(payload.instance).toMatchObject({
      projectName: 'clinic-trial',
      pagesUrl: 'https://clinic-trial.pages.dev',
      status: 'active',
      currentGitSha: 'abc1234',
    });
  });
});
