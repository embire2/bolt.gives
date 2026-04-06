import { FREE_PROVIDER_NAME } from '~/lib/modules/llm/providers/free';
import { normalizeCredential, normalizeHttpUrl } from '~/lib/runtime/credentials';

const DEFAULT_HOSTED_FREE_RELAY_ORIGIN = 'https://alpha1.bolt.gives';
const DEFAULT_HOSTED_FREE_RELAY_VERIFIER_URL = 'http://127.0.0.1:4321/runtime/internal/hosted-free-relay/verify';
const HOSTED_FREE_PROXY_HOSTS = new Set(['bolt-gives.pages.dev']);
export const HOSTED_FREE_RELAY_HEADER = 'X-Bolt-Hosted-Free-Relay';
export const HOSTED_FREE_RELAY_SECRET_HEADER = 'X-Bolt-Hosted-Free-Relay-Secret';

function shouldUseDefaultRelayHost(hostname: string) {
  if (HOSTED_FREE_PROXY_HOSTS.has(hostname) || hostname.endsWith('.bolt-gives.pages.dev')) {
    return true;
  }

  return hostname.endsWith('.pages.dev') && hostname !== 'pages.dev';
}

export function resolveHostedFreeRelayOrigin(options: {
  requestUrl: URL;
  providerName?: string;
  apiKey?: string;
  runtimeEnv?: Record<string, string>;
}) {
  if (options.providerName !== FREE_PROVIDER_NAME) {
    return undefined;
  }

  if (normalizeCredential(options.apiKey)) {
    return undefined;
  }

  const relaySecret = getHostedFreeRelaySecret(options.runtimeEnv);
  const configuredRelayOrigin =
    normalizeHttpUrl(options.runtimeEnv?.HOSTED_FREE_RELAY_ORIGIN) ||
    normalizeHttpUrl(options.runtimeEnv?.BOLT_HOSTED_FREE_RELAY_ORIGIN);
  const defaultRelayOrigin =
    relaySecret && shouldUseDefaultRelayHost(options.requestUrl.hostname)
      ? DEFAULT_HOSTED_FREE_RELAY_ORIGIN
      : undefined;
  const relayOrigin = relaySecret ? configuredRelayOrigin || defaultRelayOrigin : undefined;

  if (!relayOrigin || relayOrigin === options.requestUrl.origin) {
    return undefined;
  }

  return relayOrigin;
}

function buildRelayHeaders(request: Request) {
  const headers = new Headers();
  const contentType = request.headers.get('Content-Type');
  const accept = request.headers.get('Accept');
  const cookie = request.headers.get('Cookie');

  if (contentType) {
    headers.set('Content-Type', contentType);
  }

  if (accept) {
    headers.set('Accept', accept);
  }

  if (cookie) {
    headers.set('Cookie', cookie);
  }

  headers.set(HOSTED_FREE_RELAY_HEADER, '1');
  headers.set('X-Bolt-Forwarded-Host', request.headers.get('Host') || '');

  return headers;
}

export function getHostedFreeRelaySecret(runtimeEnv?: Record<string, string>) {
  return (
    normalizeCredential(runtimeEnv?.BOLT_HOSTED_FREE_RELAY_SECRET) ||
    normalizeCredential(runtimeEnv?.HOSTED_FREE_RELAY_SECRET)
  );
}

export function isHostedFreeRelayRequest(request: Request) {
  return request.headers.get(HOSTED_FREE_RELAY_HEADER) === '1';
}

export function isHostedFreeRelayAuthorized(options: {
  request: Request;
  runtimeEnv?: Record<string, string>;
  providerName?: string;
}) {
  if (!isHostedFreeRelayRequest(options.request)) {
    return true;
  }

  if (options.providerName !== FREE_PROVIDER_NAME) {
    return false;
  }

  const expectedSecret = getHostedFreeRelaySecret(options.runtimeEnv);
  const providedSecret = normalizeCredential(options.request.headers.get(HOSTED_FREE_RELAY_SECRET_HEADER));

  if (!expectedSecret || !providedSecret) {
    return false;
  }

  return expectedSecret === providedSecret;
}

export function resolveHostedFreeRelayVerifierUrl(runtimeEnv?: Record<string, string>) {
  return (
    normalizeHttpUrl(runtimeEnv?.BOLT_HOSTED_FREE_RELAY_VERIFIER_URL) ||
    normalizeHttpUrl(runtimeEnv?.HOSTED_FREE_RELAY_VERIFIER_URL) ||
    DEFAULT_HOSTED_FREE_RELAY_VERIFIER_URL
  );
}

export async function verifyHostedFreeRelayAuthorization(options: {
  request: Request;
  runtimeEnv?: Record<string, string>;
  providerName?: string;
  fetchImpl?: typeof fetch;
}) {
  if (!isHostedFreeRelayRequest(options.request)) {
    return true;
  }

  if (options.providerName !== FREE_PROVIDER_NAME) {
    return false;
  }

  if (isHostedFreeRelayAuthorized(options)) {
    return true;
  }

  const providedSecret = normalizeCredential(options.request.headers.get(HOSTED_FREE_RELAY_SECRET_HEADER));

  if (!providedSecret) {
    return false;
  }

  const fetchImpl = options.fetchImpl || fetch;
  const verifierUrl = resolveHostedFreeRelayVerifierUrl(options.runtimeEnv);

  try {
    const response = await fetchImpl(verifierUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        providerName: options.providerName,
        providedSecret,
      }),
    });

    if (!response.ok) {
      return false;
    }

    const payload = (await response.json().catch(() => null)) as { authorized?: boolean } | null;

    return payload?.authorized === true;
  } catch {
    return false;
  }
}

export async function relayHostedFreeRequest(options: {
  request: Request;
  requestUrl: URL;
  relayOrigin: string;
  body: unknown;
  runtimeEnv?: Record<string, string>;
}) {
  const relayUrl = new URL(`${options.requestUrl.pathname}${options.requestUrl.search}`, options.relayOrigin);
  const headers = buildRelayHeaders(options.request);
  const relaySecret = getHostedFreeRelaySecret(options.runtimeEnv);

  if (relaySecret) {
    headers.set(HOSTED_FREE_RELAY_SECRET_HEADER, relaySecret);
  }

  return fetch(relayUrl, {
    method: options.request.method,
    headers,
    body: JSON.stringify(options.body),
  });
}
