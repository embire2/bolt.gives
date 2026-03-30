import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('FirecrawlRunner');

export function isFirecrawlEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return localStorage.getItem('bolt_firecrawl_enabled') === 'true' && !!localStorage.getItem('bolt_firecrawl_api_key');
}

export interface FirecrawlScrapeResult {
  success: boolean;
  data?: {
    markdown: string;
    title?: string;
    url: string;
  };
  error?: string;
}

interface FirecrawlApiResponse {
  success?: boolean;
  data?: {
    markdown?: string;
    metadata?: {
      title?: string;
    };
  };
}

/**
 * Scrapes a URL using the Firecrawl API instead of local Playwright.
 */
export async function scrapeWithFirecrawl(url: string): Promise<FirecrawlScrapeResult> {
  const apiKey = localStorage.getItem('bolt_firecrawl_api_key');

  if (!apiKey) {
    return { success: false, error: 'Firecrawl API key is missing. Please add it in settings.' };
  }

  logger.info(`Scraping with Firecrawl API: ${url}`);

  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Firecrawl API error: ${response.status} - ${errorData}`);
    }

    const data = (await response.json()) as FirecrawlApiResponse;

    if (data.success && data.data) {
      return {
        success: true,
        data: {
          markdown: data.data.markdown || '',
          title: data.data.metadata?.title || url,
          url,
        },
      };
    } else {
      throw new Error('Invalid response structure from Firecrawl');
    }
  } catch (error) {
    logger.error('Firecrawl scraping failed', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
