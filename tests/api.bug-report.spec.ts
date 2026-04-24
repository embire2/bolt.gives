import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('/api/bug-report action', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('forwards validated bug reports to the runtime control plane', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        bugReport: { id: 'bug-123' },
        notification: { status: 'sent' },
      }),
    });

    vi.stubGlobal('fetch', fetchMock);

    const { action } = await import('../app/routes/api.bug-report');

    const request = new Request('https://alpha1.bolt.gives/api/bug-report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cf-connecting-ip': '31.6.62.180',
        'user-agent': 'Mozilla/5.0 Firefox',
      },
      body: JSON.stringify({
        fullName: 'Ada Lovelace',
        reporterEmail: 'ADA@example.com',
        issue: 'Preview stayed blank after install completed.',
        summary: 'Blank preview after install',
        pageUrl: 'https://alpha1.bolt.gives',
        appVersion: '3.0.9',
        provider: 'FREE',
        model: 'deepseek/deepseek-v3.2',
        browser: 'Firefox',
      }),
    });

    const response = await action({ request, context: { cloudflare: {} as never }, params: {} } as never);
    const payload = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      success: true,
      bugReportId: 'bug-123',
      notificationStatus: 'sent',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:4321/runtime/bug-reports');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
        'cf-connecting-ip': '31.6.62.180',
      }),
    });

    const forwardedPayload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(forwardedPayload.reporterEmail).toBe('ada@example.com');
    expect(forwardedPayload.fullName).toBe('Ada Lovelace');
  });

  it('rejects incomplete bug reports before contacting the runtime', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { action } = await import('../app/routes/api.bug-report');

    const request = new Request('https://alpha1.bolt.gives/api/bug-report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fullName: 'A',
        reporterEmail: 'not-an-email',
        issue: 'short',
      }),
    });

    const response = await action({ request, context: { cloudflare: {} as never }, params: {} } as never);
    const payload = (await response.json()) as any;

    expect(response.status).toBe(400);
    expect(payload.error).toBe('Invalid bug report details.');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
