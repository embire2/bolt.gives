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

  it('rejects contributor application posts without contacting the runtime control plane', async () => {
    const fetchMock = vi.fn();
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

    expect(response.status).toBe(410);
    expect(payload.success).toBe(false);
    expect(payload.error).toContain('application form has been retired');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects non-post action calls as unsupported', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await action({
      request: new Request('https://bolt.gives/contribute', {
        method: 'PUT',
      }),
      context: { cloudflare: {} as never },
      params: {},
    } as never);
    const payload = (await response.json()) as any;

    expect(response.status).toBe(405);
    expect(payload.success).toBe(false);
    expect(payload.error).toContain('Method not allowed');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
