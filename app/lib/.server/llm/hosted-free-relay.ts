import { FREE_PROVIDER_NAME } from '~/lib/modules/llm/providers/free';
import { normalizeCredential, normalizeHttpUrl } from '~/lib/runtime/credentials';

const DEFAULT_HOSTED_FREE_RELAY_ORIGIN = 'https://alpha1.bolt.gives';
const HOSTED_FREE_PROXY_HOSTS = new Set(['bolt-gives.pages.dev']);

function shouldUseDefaultRelayHost(hostname: string) {
  return HOSTED_FREE_PROXY_HOSTS.has(hostname) || hostname.endsWith('.bolt-gives.pages.dev');
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

  const configuredRelayOrigin =
    normalizeHttpUrl(options.runtimeEnv?.HOSTED_FREE_RELAY_ORIGIN) ||
    normalizeHttpUrl(options.runtimeEnv?.BOLT_HOSTED_FREE_RELAY_ORIGIN);
  const defaultRelayOrigin = shouldUseDefaultRelayHost(options.requestUrl.hostname)
    ? DEFAULT_HOSTED_FREE_RELAY_ORIGIN
    : undefined;
  const relayOrigin = configuredRelayOrigin || defaultRelayOrigin;

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

  headers.set('X-Bolt-Hosted-Free-Relay', '1');
  headers.set('X-Bolt-Forwarded-Host', request.headers.get('Host') || '');

  return headers;
}

export async function relayHostedFreeRequest(options: {
  request: Request;
  requestUrl: URL;
  relayOrigin: string;
  body: unknown;
}) {
  const relayUrl = new URL(`${options.requestUrl.pathname}${options.requestUrl.search}`, options.relayOrigin);

  return fetch(relayUrl, {
    method: options.request.method,
    headers: buildRelayHeaders(options.request),
    body: JSON.stringify(options.body),
  });
}
