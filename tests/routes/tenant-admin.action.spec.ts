import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('tenant-admin action auth flow', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it(
    'returns a cookie-backed redirect response for admin login',
    async () => {
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
    expect(response.status).toBe(303);
    expect(response.headers.get('Set-Cookie')).toContain('bolt_tenant_admin=');
    expect(response.headers.get('Location')).toBe('/tenant-admin');
    },
    15000,
  );

  it(
    'forwards smtp configuration writes to the runtime endpoint for authenticated admins',
    async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
        text: async () => '',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          admin: { username: 'admin' },
          tenants: [],
          clientProfiles: [],
          emailMessages: [],
          bugReports: [],
          managedInstances: [],
          managedSupport: { supported: false, trialDays: 0, rootDomain: 'pages.dev', sourceBranch: 'main' },
          mailSupport: {
            configured: false,
            host: null,
            port: 587,
            secure: false,
            user: null,
            hasPassword: false,
            fromAddress: null,
            transportLabel: null,
            reason: 'SMTP is not configured on the runtime service yet.',
          },
        }),
        text: async () => '',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
        text: async () => '',
      });

    vi.stubGlobal('fetch', fetchMock);

    const { action } = await import('../../app/routes/tenant-admin');

    const loginRequest = new Request('https://admin.bolt.gives/tenant-admin', {
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

    const loginResponse = await action({ request: loginRequest, context: { cloudflare: {} as never }, params: {} });
    const adminCookie = loginResponse.headers.get('Set-Cookie');
    expect(adminCookie).toContain('bolt_tenant_admin=');

    const request = new Request('https://admin.bolt.gives/tenant-admin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: String(adminCookie),
      },
      body: new URLSearchParams({
        intent: 'configure-smtp',
        smtpHost: 'smtp.example.com',
        smtpPort: '587',
        smtpUser: 'mailer',
        smtpPassword: 'secret',
        smtpFromAddress: 'hello@example.com',
        smtpSecure: 'on',
      }),
    });

    const response = await action({ request, context: { cloudflare: {} as never }, params: {} });
    expect(response.status).toBe(303);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2]?.[0]).toContain('/tenant-admin/mail/config');
    },
    15000,
  );
});
