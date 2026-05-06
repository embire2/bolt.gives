import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchRuntimeControlJson, getRuntimeControlBaseUrl } from './runtime-control';

describe('runtime control client', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('uses an explicit runtime control URL without a trailing slash', () => {
    vi.stubEnv('BOLT_RUNTIME_CONTROL_URL', 'https://runtime.example.com/runtime/');

    expect(getRuntimeControlBaseUrl()).toBe('https://runtime.example.com/runtime');
  });

  it('falls back to the canonical runtime when Cloudflare rejects local direct-IP fetches', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('error code: 1003', { status: 500 }))
      .mockResolvedValueOnce(Response.json({ ok: true, messages: [] }));

    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchRuntimeControlJson('/shout/messages')).resolves.toEqual({ ok: true, messages: [] });
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://127.0.0.1:4321/runtime/shout/messages', undefined);
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://bolt.gives/runtime/shout/messages', undefined);
  });

  it('does not hide ordinary runtime control failures', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('runtime unavailable', { status: 503 }));

    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchRuntimeControlJson('/shout/messages')).rejects.toThrow('runtime unavailable');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
