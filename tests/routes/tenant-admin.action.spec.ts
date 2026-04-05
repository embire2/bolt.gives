import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('tenant-admin action auth flow', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('returns a cookie-backed redirect document for admin login', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
      text: async () => '',
    });

    vi.stubGlobal('fetch', fetchMock);

    const { action } = await import('../../app/routes/tenant-admin');

    const request = new Request('https://admin.bolt.gives/tenant-admin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        intent: 'login',
        username: 'admin',
        password: 'admin',
      }),
    });

    const response = await action({ request, context: { cloudflare: {} as never }, params: {} });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    expect(response.headers.get('Set-Cookie')).toContain('bolt_tenant_admin=');
    expect(body).toContain('window.location.replace("/tenant-admin")');
  });
});
