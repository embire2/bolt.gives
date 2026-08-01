import { createCookie } from '@remix-run/cloudflare';
import { fetchRuntimeControlJson } from '@bolt/runtime/lib/.server/runtime-control';
import type { UserProfile } from '~/lib/profile-context';

type ProfileCookieValue = {
  id: string;
  token: string;
};

const PROFILE_AUTHORIZATION_SCHEME = 'BoltProfile';

export function parseProfileAuthorizationHeader(value: string | null): ProfileCookieValue | null {
  const match = String(value || '').match(/^BoltProfile\s+([0-9a-f-]{20,64})\.([A-Za-z0-9_-]{32,128})$/i);

  if (!match?.[1] || !match[2]) {
    return null;
  }

  return { id: match[1], token: match[2] };
}

export function serializeProfileAuthorization(credentials: ProfileCookieValue) {
  return `${PROFILE_AUTHORIZATION_SCHEME} ${credentials.id}.${credentials.token}`;
}

type ProfileSessionPayload = {
  ok: true;
  profile: UserProfile;
  session: {
    id: string;
    token: string;
    expiresAt: string;
  };
};

type RuntimeEnv = Record<string, string | undefined>;

export type ProfileBillingStatus = {
  plan: 'free' | 'custom-domain';
  status: 'inactive' | 'pending' | 'active' | 'past_due' | 'canceled';
  tokensAllowance: number;
  tokensUsed: number;
  tokensRemaining: number;
  periodStart: string | null;
  periodEnd: string | null;
};

function getProfileCookieSecret(runtimeEnv: RuntimeEnv = {}) {
  const runtimeSecret =
    runtimeEnv.BOLT_PROFILE_COOKIE_SECRET?.trim() ||
    runtimeEnv.BOLT_TENANT_ADMIN_COOKIE_SECRET?.trim() ||
    runtimeEnv.BOLT_MANAGED_INSTANCE_COOKIE_SECRET?.trim() ||
    runtimeEnv.BOLT_HOSTED_FREE_RELAY_SECRET?.trim();

  if (runtimeSecret) {
    return runtimeSecret;
  }

  if (typeof process !== 'undefined') {
    const configured =
      process.env?.BOLT_PROFILE_COOKIE_SECRET?.trim() ||
      process.env?.BOLT_TENANT_ADMIN_COOKIE_SECRET?.trim() ||
      process.env?.BOLT_MANAGED_INSTANCE_COOKIE_SECRET?.trim() ||
      process.env?.BOLT_HOSTED_FREE_RELAY_SECRET?.trim();

    if (configured) {
      return configured;
    }
  }

  return 'bolt-profile-dev-secret-change-me';
}

export function createProfileCookie(runtimeEnv: RuntimeEnv = {}) {
  return createCookie('bolt_profile_session', {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure:
      runtimeEnv.NODE_ENV === 'production' ||
      (typeof process !== 'undefined' ? process.env.NODE_ENV === 'production' : true),
    maxAge: 60 * 60 * 24 * 365,
    secrets: [getProfileCookieSecret(runtimeEnv)],
  });
}

export async function readProfileCookie(request: Request, runtimeEnv: RuntimeEnv = {}) {
  const value = (await createProfileCookie(runtimeEnv).parse(request.headers.get('Cookie'))) as
    | ProfileCookieValue
    | undefined;

  if (!value?.id || !value.token) {
    return null;
  }

  return value;
}

export async function readProfileCredentials(request: Request, runtimeEnv: RuntimeEnv = {}) {
  return (
    parseProfileAuthorizationHeader(request.headers.get('Authorization')) || readProfileCookie(request, runtimeEnv)
  );
}

export async function resolveProfileSession(
  request: Request,
  runtimeEnv: RuntimeEnv = {},
): Promise<UserProfile | null> {
  const value = await readProfileCredentials(request, runtimeEnv);

  if (!value) {
    return null;
  }

  try {
    const payload = await fetchRuntimeControlJson<{ ok: true; profile: UserProfile }>(
      '/profile/session',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      },
      runtimeEnv,
    );
    return payload.profile;
  } catch {
    return null;
  }
}

export async function registerProfile(
  input: { name: string; email: string; country: string },
  runtimeEnv: RuntimeEnv = {},
) {
  return await fetchRuntimeControlJson<ProfileSessionPayload>(
    '/profile/register',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    runtimeEnv,
  );
}

export async function requestProfileLogin(input: { email: string; returnTo: string }, runtimeEnv: RuntimeEnv = {}) {
  return await fetchRuntimeControlJson<{ ok: true; message: string }>(
    '/profile/login/request',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    runtimeEnv,
  );
}

export async function consumeProfileLogin(token: string, runtimeEnv: RuntimeEnv = {}) {
  return await fetchRuntimeControlJson<ProfileSessionPayload>(
    '/profile/login/consume',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    },
    runtimeEnv,
  );
}

export async function revokeProfileSession(request: Request, runtimeEnv: RuntimeEnv = {}) {
  const value = await readProfileCredentials(request, runtimeEnv);

  if (!value) {
    return;
  }

  await fetchRuntimeControlJson(
    '/profile/logout',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    },
    runtimeEnv,
  ).catch(() => null);
}

export async function serializeProfileSession(session: ProfileSessionPayload['session'], runtimeEnv: RuntimeEnv = {}) {
  return await createProfileCookie(runtimeEnv).serialize({
    id: session.id,
    token: session.token,
  } satisfies ProfileCookieValue);
}

export async function clearProfileSession(runtimeEnv: RuntimeEnv = {}) {
  return await createProfileCookie(runtimeEnv).serialize('', { maxAge: 0 });
}

export async function getProfileBillingStatus(request: Request, runtimeEnv: RuntimeEnv = {}) {
  const credentials = await readProfileCredentials(request, runtimeEnv);

  if (!credentials) {
    return null;
  }

  const payload = await fetchRuntimeControlJson<{ ok: true; billing: ProfileBillingStatus }>(
    '/profile/billing/status',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    },
    runtimeEnv,
  );

  return payload.billing;
}

export async function createProfileBillingCheckout(request: Request, runtimeEnv: RuntimeEnv = {}) {
  const credentials = await readProfileCredentials(request, runtimeEnv);

  if (!credentials) {
    return null;
  }

  return await fetchRuntimeControlJson<{ ok: true; checkoutUrl: string; billing: ProfileBillingStatus }>(
    '/profile/billing/checkout',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    },
    runtimeEnv,
  );
}

export async function recordProfileBillingUsage(
  request: Request,
  input: { runId: string; totalTokens: number },
  runtimeEnv: RuntimeEnv = {},
) {
  const credentials = await readProfileCredentials(request, runtimeEnv);

  if (!credentials) {
    return null;
  }

  const payload = await fetchRuntimeControlJson<{ ok: true; billing: ProfileBillingStatus }>(
    '/profile/billing/usage',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...credentials, ...input }),
    },
    runtimeEnv,
  );

  return payload.billing;
}

export async function attachProfileBillingDomain(
  request: Request,
  input: { sessionId: string; customDomain: string },
  runtimeEnv: RuntimeEnv = {},
) {
  const credentials = await readProfileCookie(request, runtimeEnv);

  if (!credentials) {
    return null;
  }

  return await fetchRuntimeControlJson<{
    ok: true;
    requiresCheckout: false;
    dnsInstructions: { note: string };
  }>(
    '/profile/billing/attach-domain',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...credentials, ...input }),
    },
    runtimeEnv,
  );
}
