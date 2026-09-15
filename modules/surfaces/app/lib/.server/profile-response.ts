import { serializeProfileSession } from './profile-session';

export function clearProviderCookies(headers = new Headers()) {
  for (const name of ['apiKeys', 'bolt_api_key_owner']) {
    headers.append('Set-Cookie', `${name}=; Path=/; Max-Age=0; SameSite=Lax`);
  }
  return headers;
}

export async function profileLoginHeaders(
  session: Parameters<typeof serializeProfileSession>[0],
  env: Record<string, string | undefined>,
) {
  const headers = clearProviderCookies();
  headers.append('Set-Cookie', await serializeProfileSession(session, env));

  return headers;
}
