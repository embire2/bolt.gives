import { fetchRuntimeControlJson } from '@bolt/runtime/lib/.server/runtime-control';

export function isSingleUserMode(env: Record<string, string | undefined> = {}) {
  return (
    (env.BOLT_SELF_HOST_MODE ?? (typeof process !== 'undefined' ? process.env.BOLT_SELF_HOST_MODE : '')) ===
    'single-user'
  );
}

export function loginSelfHost(accessToken: string, env: Record<string, string | undefined>) {
  return fetchRuntimeControlJson<{ session: { id: string; token: string; expiresAt: string } }>(
    '/profile/self-host/login',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessToken }) },
    env,
  );
}
