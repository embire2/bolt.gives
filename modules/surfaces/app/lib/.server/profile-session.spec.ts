import { describe, expect, it } from 'vitest';
import {
  createProfileCookie,
  parseProfileAuthorizationHeader,
  readProfileCookie,
  serializeProfileAuthorization,
} from './profile-session';

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
