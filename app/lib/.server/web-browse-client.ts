import { createScopedLogger } from '~/utils/logger';
import { isAllowedUrl } from '~/utils/url';

const logger = createScopedLogger('web-browse-client');

const DEFAULT_SERVICE_URL = 'http://127.0.0.1:4179';
const DEFAULT_TIMEOUT_MS = 30_000;

export interface BrowserSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface BrowserSearchResponse {
  query: string;
  results: BrowserSearchResult[];
  engine: string;
}

export interface BrowserPageResponse {
  url: string;
  finalUrl: string;
  status: number;
  title: string;
  description: string;
  content: string;
  headings: string[];
  links: Array<{ title: string; url: string }>;
}

function getServiceUrl(env?: Env): string {
  const processEnv =
    typeof globalThis !== 'undefined' && 'process' in globalThis
      ? (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env
      : undefined;
  const configured = env?.WEB_BROWSE_SERVICE_URL || processEnv?.WEB_BROWSE_SERVICE_URL;
  const value = configured?.trim() || DEFAULT_SERVICE_URL;

  return value.endsWith('/') ? value.slice(0, -1) : value;
}

async function callService<T>(
  path: string,
  body: Record<string, unknown>,
  options?: {
    env?: Env;
    timeoutMs?: number;
  },
): Promise<T> {
  const serviceUrl = getServiceUrl(options?.env);
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const response = await fetch(`${serviceUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.warn(`Web browse service request failed (${response.status}): ${errorText}`);
    throw new Error(`Web browsing service error: ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function searchWebWithPlaywright(
  params: {
    query: string;
    maxResults?: number;
  },
  options?: {
    env?: Env;
  },
): Promise<BrowserSearchResponse> {
  const query = params.query?.trim();

  if (!query) {
    throw new Error('Search query is required');
  }

  return callService<BrowserSearchResponse>(
    '/search',
    {
      query,
      maxResults: params.maxResults ?? 5,
    },
    options,
  );
}

export async function browsePageWithPlaywright(
  params: {
    url: string;
    maxChars?: number;
  },
  options?: {
    env?: Env;
  },
): Promise<BrowserPageResponse> {
  const url = params.url?.trim();

  if (!url) {
    throw new Error('URL is required');
  }

  if (!isAllowedUrl(url)) {
    throw new Error('URL is not allowed. Only public HTTP/HTTPS URLs are accepted.');
  }

  return callService<BrowserPageResponse>(
    '/browse',
    {
      url,
      maxChars: params.maxChars ?? 20_000,
    },
    options,
  );
}
