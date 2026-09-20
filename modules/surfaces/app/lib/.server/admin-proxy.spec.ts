import { afterEach, describe, expect, it, vi } from 'vitest';
import { proxyManagedAdmin } from './admin-proxy';

describe('same-domain admin gateway', () => {
  afterEach(() => vi.unstubAllGlobals());

  const env = { BOLT_RUNTIME_CONTROL_PUBLIC_URL: 'https://backend.example/runtime' };
  it('streams the protected backend without distributing the admin secret', async () => {
    const mock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 303,
        headers: {
          Location: 'https://backend.example/admin',
          'Set-Cookie': '__Host-bolt_tenant_admin=signed; Path=/; HttpOnly; Secure',
        },
      }),
    );
    vi.stubGlobal('fetch', mock);

    const response = await proxyManagedAdmin(
      new Request('https://client.example/admin', {
        method: 'POST',
        headers: { Origin: 'https://client.example', 'X-Forwarded-Host': 'spoof.example' },
        body: 'intent=login',
      }),
      env,
    );
    expect(response?.headers.get('Location')).toBe('https://client.example/admin');
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
    expect(response?.headers.get('Set-Cookie')).toContain('HttpOnly');
    expect(mock.mock.calls[0][1].redirect).toBe('manual');
    expect(mock.mock.calls[0][1].headers.get('Origin')).toBe('https://backend.example');
    expect(mock.mock.calls[0][1].headers.has('X-Forwarded-Host')).toBe(false);
  });
  it('blocks sibling-origin mutations and avoids self proxy loops', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const response = await proxyManagedAdmin(
      new Request('https://client.example/admin', { method: 'POST', headers: { Origin: 'https://preview.example' } }),
      env,
    );
    expect(response?.status).toBe(403);
    expect(await proxyManagedAdmin(new Request('https://backend.example/admin'), env)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
