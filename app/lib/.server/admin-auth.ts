import { createCookie } from '@remix-run/cloudflare';
import { fetchRuntimeControlJson } from '~/lib/.server/runtime-control';

export type TenantAdminSession = {
  username: string;
  issuedAt: string;
};

type TenantAdminStatusPayload = {
  admin?: {
    username?: string;
  };
};

function getTenantAdminCookieSecret() {
  if (typeof process !== 'undefined' && process.env?.BOLT_TENANT_ADMIN_COOKIE_SECRET?.trim()) {
    return process.env.BOLT_TENANT_ADMIN_COOKIE_SECRET.trim();
  }

  return 'bolt-tenant-admin-dev-secret-change-me';
}

function createTenantAdminSessionCookie() {
  return createCookie('bolt_tenant_admin', {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: typeof process !== 'undefined' ? process.env.NODE_ENV === 'production' : true,
    maxAge: 60 * 60 * 12,
    secrets: [getTenantAdminCookieSecret()],
  });
}

export async function readTenantAdminSession(request: Request): Promise<TenantAdminSession | null> {
  try {
    const cookie = createTenantAdminSessionCookie();
    const parsed = (await cookie.parse(request.headers.get('Cookie'))) as TenantAdminSession | undefined;

    if (!parsed?.username) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export async function isTenantAdminAuthorized(request: Request): Promise<boolean> {
  const session = await readTenantAdminSession(request);

  if (!session?.username) {
    return false;
  }

  try {
    const status = await fetchRuntimeControlJson<TenantAdminStatusPayload>('/tenant-admin/status');
    const adminUsername = status.admin?.username;

    return Boolean(adminUsername && adminUsername === session.username);
  } catch {
    return false;
  }
}
