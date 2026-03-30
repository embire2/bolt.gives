import { createScopedLogger } from '~/utils/logger';
import { isAllowedUrl } from '~/utils/url';

const logger = createScopedLogger('web-browse-client');

const DEFAULT_SERVICE_URL = 'http://127.0.0.1:4179';
const DEFAULT_TIMEOUT_MS = 30_000;
const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v1';

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

function getEnvVar(key: string, env?: Env): string | undefined {
  const processEnv =
    typeof globalThis !== 'undefined' && 'process' in globalThis
      ? (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env
      : undefined;
  return (env as unknown as Record<string, string | undefined>)?.[key] || processEnv?.[key];
}

function getServiceUrl(env?: Env): string {
  const configured = getEnvVar('WEB_BROWSE_SERVICE_URL', env);
  const value = configured?.trim() || DEFAULT_SERVICE_URL;

  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function getFirecrawlApiKey(env?: Env): string | undefined {
  return getEnvVar('FIRECRAWL_API_KEY', env)?.trim();
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

/**
 * Scrape a page using the Firecrawl cloud API.
 * Returns a BrowserPageResponse shaped object for drop-in compatibility.
 */
async function browsePageWithFirecrawl(url: string, apiKey: string, maxChars: number): Promise<BrowserPageResponse> {
  const response = await fetch(`${FIRECRAWL_API_URL}/scrape`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      url,
      formats: ['markdown'],
      onlyMainContent: true,
    }),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Firecrawl API error (${response.status}): ${errorText}`);
  }

  const result = (await response.json()) as any;

  if (!result.success || !result.data) {
    throw new Error('Firecrawl returned an unsuccessful response');
  }

  const markdown: string = (result.data.markdown || '').slice(0, maxChars);
  const metadata = result.data.metadata || {};

  return {
    url,
    finalUrl: result.data.metadata?.sourceURL || url,
    status: result.data.metadata?.statusCode || 200,
    title: metadata.title || '',
    description: metadata.description || metadata.ogDescription || '',
    content: markdown,
    headings: [],
    links: (result.data.links || [])
      .slice(0, 40)
      .map((link: string | { url: string; text?: string }) =>
        typeof link === 'string' ? { title: '', url: link } : { title: link.text || '', url: link.url },
      ),
  };
}

/**
 * Search the web using the Firecrawl cloud API.
 * Returns a BrowserSearchResponse for drop-in compatibility.
 */
async function searchWebWithFirecrawl(
  query: string,
  apiKey: string,
  maxResults: number,
): Promise<BrowserSearchResponse> {
  const response = await fetch(`${FIRECRAWL_API_URL}/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      limit: maxResults,
    }),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Firecrawl search API error (${response.status}): ${errorText}`);
  }

  const result = (await response.json()) as any;

  return {
    query,
    engine: 'firecrawl',
    results: (result.data || []).slice(0, maxResults).map((item: any) => ({
      title: item.metadata?.title || item.url || '',
      url: item.url || '',
      snippet: (item.markdown || '').slice(0, 200),
    })),
  };
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

  const maxResults = params.maxResults ?? 5;

  // Try Firecrawl first when API key is available
  const firecrawlKey = getFirecrawlApiKey(options?.env);

  if (firecrawlKey) {
    try {
      logger.info('Using Firecrawl for web search');
      return await searchWebWithFirecrawl(query, firecrawlKey, maxResults);
    } catch (err) {
      logger.warn('Firecrawl search failed, falling back to Playwright:', err);
    }
  }

  return callService<BrowserSearchResponse>(
    '/search',
    {
      query,
      maxResults,
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

  const maxChars = params.maxChars ?? 20_000;

  // Try Firecrawl first when API key is available
  const firecrawlKey = getFirecrawlApiKey(options?.env);

  if (firecrawlKey) {
    try {
      logger.info('Using Firecrawl for page browsing');
      return await browsePageWithFirecrawl(url, firecrawlKey, maxChars);
    } catch (err) {
      logger.warn('Firecrawl browse failed, falling back to Playwright:', err);
    }
  }

  return callService<BrowserPageResponse>(
    '/browse',
    {
      url,
      maxChars,
    },
    options,
  );
}
