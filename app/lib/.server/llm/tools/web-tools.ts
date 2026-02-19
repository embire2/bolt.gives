import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { browsePageWithPlaywright, searchWebWithPlaywright } from '~/lib/.server/web-browse-client';
import { isAllowedUrl } from '~/utils/url';

function formatLinks(links: Array<{ title: string; url: string }>): string {
  if (!links.length) {
    return '(none)';
  }

  return links
    .slice(0, 10)
    .map((link, index) => `${index + 1}. ${link.title || '(untitled)'} - ${link.url}`)
    .join('\n');
}

function buildBrowseFailureResult(params: { url: string; title: string; message: string; status?: number }) {
  const status = params.status ?? 400;

  return {
    url: params.url,
    finalUrl: params.url,
    status,
    title: params.title,
    description: params.message,
    content: '',
    headings: [],
    links: [],
    markdown: [
      `# ${params.title}`,
      '',
      `URL: ${params.url}`,
      '',
      params.message,
      '',
      'If you need web browsing, provide a public HTTP/HTTPS URL.',
    ].join('\n'),
  };
}

export function createWebBrowsingTools(env?: Env): ToolSet {
  const seenSearchQueries = new Map<string, number>();
  const seenBrowseUrls = new Map<string, number>();
  const browseCache = new Map<string, Awaited<ReturnType<typeof browsePageWithPlaywright>>>();

  return {
    web_search: tool({
      description:
        'Search the web for current documentation, guides, and references. Use this when the user asks for external docs but does not provide a direct URL, or when one follow-up search is needed to fill a specific gap.',
      parameters: z.object({
        query: z.string().min(2).describe('The search query.'),
        maxResults: z
          .union([z.number().int().min(1).max(8), z.null()])
          .describe('How many results to return. Use null to apply the default (5).'),
      }),
      execute: async ({ query, maxResults }) => {
        const normalizedQuery = query.trim().toLowerCase();
        const searchCount = (seenSearchQueries.get(normalizedQuery) || 0) + 1;
        seenSearchQueries.set(normalizedQuery, searchCount);

        if (searchCount > 1) {
          return {
            query,
            engine: 'duckduckgo',
            results: [],
            markdown:
              'Repeated web_search call for the same query detected. Reuse previous search findings and continue with synthesis without calling web_search again.',
          };
        }

        const response = await searchWebWithPlaywright({ query, maxResults: maxResults ?? 5 }, { env });

        return {
          query: response.query,
          engine: response.engine,
          results: response.results,
          markdown: response.results
            .map((result, index) => `${index + 1}. [${result.title}](${result.url})\n   - ${result.snippet}`)
            .join('\n'),
        };
      },
    }),

    web_browse: tool({
      description:
        'Open a specific web page and extract the main content. Use this first when the user gives a documentation URL, then synthesize the result instead of repeatedly searching.',
      parameters: z.object({
        url: z.string().min(8).describe('The documentation or web page URL to read.'),
        maxChars: z
          .union([z.number().int().min(1000).max(40000), z.null()])
          .describe('Maximum number of characters to return. Use null to apply the default (15000).'),
      }),
      execute: async ({ url, maxChars }) => {
        let parsedUrl: URL;

        try {
          parsedUrl = new URL(url.trim());
        } catch {
          return buildBrowseFailureResult({
            url,
            title: 'Invalid URL',
            message: 'The URL could not be parsed. Provide a valid public HTTP/HTTPS URL.',
            status: 400,
          });
        }

        const normalizedSourceUrl = parsedUrl.toString();

        if (!isAllowedUrl(normalizedSourceUrl)) {
          return buildBrowseFailureResult({
            url: normalizedSourceUrl,
            title: 'URL Not Allowed',
            message: 'This URL is blocked for security. Localhost/private network URLs are not allowed.',
            status: 400,
          });
        }

        const normalizedUrl = normalizedSourceUrl.toLowerCase();
        const browseCount = (seenBrowseUrls.get(normalizedUrl) || 0) + 1;
        seenBrowseUrls.set(normalizedUrl, browseCount);

        if (browseCount > 1) {
          const cachedPage = browseCache.get(normalizedUrl);

          if (cachedPage) {
            return {
              url: cachedPage.url,
              finalUrl: cachedPage.finalUrl,
              status: 208,
              title: 'Repeated URL Browse Prevented',
              description: '',
              content: '',
              headings: [],
              links: [],
              markdown: [
                '# Repeated URL Browse Prevented',
                '',
                `The URL was already browsed: ${cachedPage.finalUrl || cachedPage.url}`,
                '',
                'Reuse the earlier findings and continue with synthesis. Do not call web_browse on this URL again.',
              ].join('\n'),
            };
          }

          return {
            url,
            finalUrl: url,
            status: 200,
            title: 'Repeated URL Browse Prevented',
            description: '',
            content: '',
            headings: [],
            links: [],
            markdown: [
              '# Repeated URL Browse Prevented',
              '',
              `The URL was already browsed: ${url}`,
              '',
              'Reuse the earlier findings and continue with synthesis. Do not call web_browse on this URL again.',
            ].join('\n'),
          };
        }

        try {
          const page = await browsePageWithPlaywright(
            { url: normalizedSourceUrl, maxChars: maxChars ?? 15000 },
            { env },
          );
          browseCache.set(normalizedUrl, page);

          return {
            ...page,
            markdown: [
              `# ${page.title || 'Untitled page'}`,
              '',
              `Source: ${page.finalUrl}`,
              '',
              page.description ? `Description: ${page.description}` : '',
              '',
              '## Headings',
              page.headings
                .slice(0, 20)
                .map((heading) => `- ${heading}`)
                .join('\n') || '- (none)',
              '',
              '## Main Content',
              page.content,
              '',
              '## Links',
              formatLinks(page.links),
            ]
              .filter(Boolean)
              .join('\n'),
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown web browse error';

          return buildBrowseFailureResult({
            url: normalizedSourceUrl,
            title: 'Web Browse Failed',
            message: `Could not browse this URL: ${message}`,
            status: 502,
          });
        }
      },
    }),
  };
}
