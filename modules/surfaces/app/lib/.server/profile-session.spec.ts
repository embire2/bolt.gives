import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createProfileCookie,
  parseProfileAuthorizationHeader,
  readProfileCookie,
  registerProfile,
  serializeProfileAuthorization,
} from './profile-session';

afterEach(() => vi.unstubAllGlobals());

describe('Profile registration forwarding', () => {
  it('keeps different visitors out of the shared backend IP rate-limit bucket', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => Response.json({ ok: true }));

    vi.stubGlobal('fetch', fetchMock);

    const input = { name: 'Test User', email: 'test@example.invalid', country: 'South Africa' };
    const env = { BOLT_RUNTIME_CONTROL_URL: 'http://127.0.0.1:4321/runtime' };

    for (const ip of ['192.0.2.1', '192.0.2.2']) {
      await registerProfile(
        input,
        env,
        new Request('https://bolt.example/profile/register', {
          headers: { 'cf-connecting-ip': ip },
        }),
      );
    }

    expect(fetchMock.mock.calls.map(([, init]) => init.headers['x-forwarded-for'])).toEqual(['192.0.2.1', '192.0.2.2']);
  });

  it('does not invent a client identity when the trusted edge supplies none', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await registerProfile(
      { name: 'Test User', email: 'test@example.invalid', country: 'South Africa' },
      {},
      new Request('https://bolt.example/profile/register'),
    );
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ 'Content-Type': 'application/json' });
  });
});

describe('Desktop profile authorization', () => {
  it('chooses the cookie name from explicit runtime configuration, not bundle build mode', () => {
    expect(createProfileCookie({ NODE_ENV: 'development' }).name).toBe('bolt_profile_session');
    expect(createProfileCookie({}).name).toBe('__Host-bolt_profile_session');
  });
  it('uses a host-only production cookie and does not trust the legacy parent-domain name', async () => {
    const env = { NODE_ENV: 'production', BOLT_PROFILE_COOKIE_SECRET: 'fixture-only-cookie-key' };
    const cookie = await createProfileCookie(env).serialize({ id: 'fixture', token: 'fixture-token' });
    expect(cookie).toMatch(/^__Host-bolt_profile_session=/);
    expect(cookie).toContain('Secure');
    expect(cookie).not.toContain('Domain=');

    const request = new Request('https://bolt.example', { headers: { Cookie: cookie.replace('__Host-', '') } });
    expect(await readProfileCookie(request, env)).toBeNull();
  });

  it('round-trips a native profile session without accepting malformed values', () => {
    const credentials = {
      id: '01f00000-0000-4000-8000-000000000001',
      token: 'Abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE',
    };

    expect(parseProfileAuthorizationHeader(serializeProfileAuthorization(credentials))).toEqual(credentials);
    expect(parseProfileAuthorizationHeader('Bearer secret')).toBeNull();
    expect(parseProfileAuthorizationHeader('BoltProfile missing-token')).toBeNull();
  });
});
