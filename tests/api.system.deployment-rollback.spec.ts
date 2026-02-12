import { describe, expect, it, vi } from 'vitest';
import { action } from '../app/routes/api.deployment.rollback';

describe('deployment rollback api', () => {
  it('returns 405 for non-POST requests', async () => {
    const response = await action({
      request: new Request('http://local.test/api/deployment/rollback', { method: 'GET' }),
      context: {},
      params: {},
    } as any);

    expect(response.status).toBe(405);
  });

  it('returns 200 and forwards to provider rollback handler', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await action({
      request: new Request('http://local.test/api/deployment/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'vercel',
          deploymentId: 'dep_123',
          token: 'token',
        }),
      }),
      context: {},
      params: {},
    } as any);

    expect(response.status).toBe(200);
    const json = (await response.json()) as any;
    expect(json.result?.ok).toBe(true);

    // Vercel promote endpoint
    expect(fetchMock).toHaveBeenCalledWith('https://api.vercel.com/v13/deployments/dep_123/promote', expect.anything());
    vi.unstubAllGlobals();
  });

  it('returns 500 when provider rollback fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => 'bad',
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await action({
      request: new Request('http://local.test/api/deployment/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'netlify',
          deploymentId: 'site_123',
          token: 'token',
        }),
      }),
      context: {},
      params: {},
    } as any);

    expect(response.status).toBe(500);
    const json = (await response.json()) as any;
    expect(String(json.error)).toContain('bad');
    vi.unstubAllGlobals();
  });
});

