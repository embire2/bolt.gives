import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { browsePageWithPlaywright, searchWebWithPlaywright } from '~/lib/.server/web-browse-client';

function formatLinks(links: Array<{ title: string; url: string }>): string {
  if (!links.length) {
    return '(none)';
  }

  return links
    .slice(0, 10)
    .map((link, index) => `${index + 1}. ${link.title || '(untitled)'} - ${link.url}`)
    .join('\n');
}

export function createWebBrowsingTools(env?: Env): ToolSet {
  return {
    web_search: tool({
      description:
        'Search the web for current documentation, guides, and references. Use this when the user asks you to study external APIs, libraries, or websites.',
      parameters: z.object({
        query: z.string().min(2).describe('The search query.'),
        maxResults: z.number().int().min(1).max(8).optional().describe('How many results to return.'),
      }),
      execute: async ({ query, maxResults }) => {
        const response = await searchWebWithPlaywright({ query, maxResults }, { env });

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
        'Open a specific web page and extract the main content. Use this to read and study API documentation links before writing code or summaries.',
      parameters: z.object({
        url: z.string().url().describe('The documentation or web page URL to read.'),
        maxChars: z
          .number()
          .int()
          .min(1000)
          .max(40000)
          .optional()
          .describe('Maximum number of characters to return from the page content.'),
      }),
      execute: async ({ url, maxChars }) => {
        const page = await browsePageWithPlaywright({ url, maxChars }, { env });

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
      },
    }),
  };
}
