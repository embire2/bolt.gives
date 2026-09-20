import { createCookie } from '@remix-run/cloudflare';

export type TenantAdminSession = { username: string; issuedAt: string };
type AdminIdentity = { username: string; mustChangePassword?: boolean; passwordUpdatedAt?: string | null };

export function createAdminSessionCookie() {
  const development = ['development', 'test'].includes(process.env.NODE_ENV || '');
  const secret = process.env.BOLT_TENANT_ADMIN_COOKIE_SECRET?.trim();

  if (!secret && !development) {
    throw new Error('Admin session signing is not configured.');
  }

  return createCookie(development ? 'bolt_tenant_admin' : '__Host-bolt_tenant_admin', {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: !development,
    maxAge: 60 * 60 * 12,
    secrets: [secret || 'bolt-tenant-admin-dev-secret-change-me'],
  });
}

export function isAuthenticatedAdminSession(
  session: TenantAdminSession | null | undefined,
  admin: AdminIdentity | undefined,
) {
  const issuedAt = Date.parse(session?.issuedAt || '');
  const age = Date.now() - issuedAt;

  return Boolean(
    session?.username &&
    session.username === admin?.username &&
    Number.isFinite(age) &&
    age >= 0 &&
    age <= 12 * 60 * 60 * 1000 &&
    (!admin?.passwordUpdatedAt || issuedAt >= Date.parse(admin.passwordUpdatedAt)),
  );
}

export function requirePrivilegedAdminSession(
  session: TenantAdminSession | null | undefined,
  admin: AdminIdentity | undefined,
  actionLabel: string,
) {
  if (!isAuthenticatedAdminSession(session, admin)) {
    return 'Sign in as tenant admin first.';
  }

  if (admin?.mustChangePassword) {
    return `Change the default admin password before ${actionLabel}.`;
  }

  return null;
}
