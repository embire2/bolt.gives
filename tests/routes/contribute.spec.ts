import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { action } = await import('../../app/routes/contribute');

describe('/contribute action', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('forwards contributor applications to the runtime control plane', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        notification: { status: 'sent' },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const formData = new FormData();
    formData.set('fullName', 'Ada Lovelace');
    formData.set('email', 'ADA@example.com');
    formData.set('githubUsername', '@ada-dev');
    formData.set('role', 'Runtime engineer');
    formData.set('location', 'UTC+2');
    formData.set('profileUrl', 'https://example.com/ada');
    formData.set('portfolioUrl', 'https://github.com/ada-dev/project');
    formData.set('availability', '4 hours/week');
    formData.set('experience', 'I have shipped React, Remix, Cloudflare, and runtime orchestration projects.');
    formData.set('contributionAreas', 'Prompt-to-preview reliability, E2E tests, and docs.');
    formData.set('why', 'I want to help make transparent open-source AI coding infrastructure more reliable.');

    const response = await action({
      request: new Request('https://bolt.gives/contribute', {
        method: 'POST',
        headers: {
          'cf-connecting-ip': '31.6.62.180',
          'user-agent': 'Vitest',
        },
        body: formData,
      }),
      context: { cloudflare: {} as never },
      params: {},
    } as never);
    const payload = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      success: true,
      notificationStatus: 'sent',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:4321/runtime/contributor-applications');

    const forwardedPayload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(forwardedPayload.email).toBe('ada@example.com');
    expect(forwardedPayload.githubUsername).toBe('ada-dev');
    expect(forwardedPayload.sourceUrl).toBe('https://bolt.gives/contribute');
  });

  it('rejects incomplete contributor applications before contacting the runtime', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const formData = new FormData();
    formData.set('fullName', 'A');
    formData.set('email', 'not-an-email');
    formData.set('githubUsername', '');
    formData.set('experience', 'short');
    formData.set('contributionAreas', '');
    formData.set('why', 'short');

    const response = await action({
      request: new Request('https://bolt.gives/contribute', {
        method: 'POST',
        body: formData,
      }),
      context: { cloudflare: {} as never },
      params: {},
    } as never);
    const payload = (await response.json()) as any;

    expect(response.status).toBe(400);
    expect(payload.success).toBe(false);
    expect(payload.error).toContain('highlighted');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
