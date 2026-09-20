import { afterEach, describe, expect, it, vi } from 'vitest';
import { loader, action } from '~/routes/managed-instances';

vi.mock('~/components/header/Header', () => ({ Header: () => null }));
vi.mock('~/components/ui/BackgroundRays', () => ({ default: () => null }));

afterEach(() => vi.restoreAllMocks());

const env = {
  NODE_ENV: 'production',
  BOLT_RUNTIME_CONTROL_PUBLIC_URL: 'https://staging.example/runtime',
  BOLT_MANAGED_INSTANCE_COOKIE_SECRET: 'fixture-session-signing-secret',
};

describe('managed-instance request environment', () => {
  it('loads support from the configured request runtime, not the production fallback', async () => {
    const transport = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ supported: true }));
    const response = await loader({
      request: new Request('https://staging.example/managed-instances'),
      context: { cloudflare: { env } },
    } as never);
    expect(transport).toHaveBeenCalledWith('https://staging.example/runtime/managed-instances/config', undefined);
    expect((await response.json()).support.supported).toBe(true);
  });

  it('sends registration to that same runtime and signs a host-only session cookie', async () => {
    const transport = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ ok: true, profile: { id: 'fixture', email: 'fixture@example.invalid' } }))
      .mockResolvedValueOnce(
        Response.json({
          sessionToken: 'fixture',
          instance: { email: 'fixture@example.invalid', projectName: 'fixture' },
        }),
      );
    const response = await action({
      request: new Request('https://staging.example/managed-instances', {
        method: 'POST',
        headers: { Authorization: `BoltProfile 11111111-1111-1111-1111-111111111111.${'a'.repeat(40)}` },
        body: new URLSearchParams({
          intent: 'spawn',
          name: 'Fixture',
          email: 'fixture@example.invalid',
          subdomain: 'fixture',
        }),
      }),
      context: { cloudflare: { env } },
    } as never);
    expect(transport.mock.calls[0][0]).toBe('https://staging.example/runtime/profile/session');
    expect(transport.mock.calls[1][0]).toBe('https://staging.example/runtime/managed-instances/spawn');
    expect(response.status).toBe(302);
    expect(response.headers.get('Set-Cookie')).toMatch(/^__Host-bolt_managed_instance=/);
  });
});
