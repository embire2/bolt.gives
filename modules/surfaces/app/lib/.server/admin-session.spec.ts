import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAdminSessionCookie, isAuthenticatedAdminSession, requirePrivilegedAdminSession } from './admin-session';

describe('admin sessions', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('never falls back to a public development secret in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BOLT_TENANT_ADMIN_COOKIE_SECRET', '');
    expect(() => createAdminSessionCookie()).toThrow('not configured');
  });
  it('uses protected request bindings even when a compiled process shim has no secrets', async () => {
    vi.stubEnv('BOLT_TENANT_ADMIN_COOKIE_SECRET', '');

    const cookie = createAdminSessionCookie({
      NODE_ENV: 'production',
      BOLT_TENANT_ADMIN_COOKIE_SECRET: 'private-fixture-signing-key',
    });
    expect(await cookie.serialize({ username: 'admin', issuedAt: new Date().toISOString() })).toMatch(
      /^__Host-bolt_tenant_admin=/,
    );
  });
  it('rejects expired sessions and sessions issued before a password change', () => {
    const admin = { username: 'admin', passwordUpdatedAt: new Date(Date.now() - 30_000).toISOString() };
    expect(isAuthenticatedAdminSession({ username: 'admin', issuedAt: new Date().toISOString() }, admin)).toBe(true);
    expect(
      isAuthenticatedAdminSession({ username: 'admin', issuedAt: new Date(Date.now() - 60_000).toISOString() }, admin),
    ).toBe(false);
    expect(
      isAuthenticatedAdminSession(
        { username: 'admin', issuedAt: new Date(Date.now() - 13 * 3_600_000).toISOString() },
        { username: 'admin' },
      ),
    ).toBe(false);
    expect(isAuthenticatedAdminSession({ username: 'admin', issuedAt: 'invalid' }, admin)).toBe(false);
    expect(requirePrivilegedAdminSession(null, admin, 'changing policy')).toContain('Sign in');
  });
});
