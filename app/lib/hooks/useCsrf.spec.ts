// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCsrfToken, securedFetch } from './useCsrf';

describe('useCsrf', () => {
  beforeEach(() => {
    document.cookie = 'csrf_token=; Max-Age=0; Path=/';
    vi.restoreAllMocks();
  });

  it('mints and persists a csrf token when none exists', () => {
    const token = getCsrfToken();

    expect(token).toBeTruthy();
    expect(document.cookie).toContain('csrf_token=');
  });

  it('injects the csrf header and same-origin credentials for POST requests', async () => {
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const response = await securedFetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ ok: true }),
    });

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    const headers = new Headers(init.headers);

    expect(url).toBe('/api/chat');
    expect(init.credentials).toBe('same-origin');
    expect(headers.get('X-CSRF-Token')).toBeTruthy();
  });
});
