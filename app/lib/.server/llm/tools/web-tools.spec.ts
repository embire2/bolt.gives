import { describe, expect, it, vi } from 'vitest';
import { createWebBrowsingTools } from './web-tools';

vi.mock('~/lib/.server/web-browse-client', () => {
  return {
    searchWebWithPlaywright: vi.fn(async () => ({
      query: 'remix loaders',
      engine: 'duckduckgo',
      results: [
        {
          title: 'Remix Loader Docs',
          url: 'https://remix.run/docs/en/main/route/loader',
          snippet: 'How loaders work in Remix.',
        },
      ],
    })),
    browsePageWithPlaywright: vi.fn(async () => ({
      url: 'https://example.com/docs',
      finalUrl: 'https://example.com/docs',
      status: 200,
      title: 'Example Docs',
      description: 'Example API docs.',
      content: 'GET /v1/widgets returns all widgets.',
      headings: ['Overview', 'Authentication'],
      links: [{ title: 'Auth', url: 'https://example.com/docs/auth' }],
    })),
  };
});

describe('createWebBrowsingTools', () => {
  it('returns web_search and web_browse tools with executable handlers', async () => {
    const tools = createWebBrowsingTools();

    expect(tools.web_search).toBeDefined();
    expect(tools.web_browse).toBeDefined();

    const searchResult = await tools.web_search.execute?.({ query: 'remix loaders', maxResults: 3 }, {} as any);
    expect(searchResult?.engine).toBe('duckduckgo');
    expect(searchResult?.markdown).toContain('Remix Loader Docs');

    const browseResult = await tools.web_browse.execute?.({ url: 'https://example.com/docs' }, {} as any);
    expect(browseResult?.title).toBe('Example Docs');
    expect(browseResult?.markdown).toContain('## Main Content');
    expect(browseResult?.markdown).toContain('GET /v1/widgets');
  });

  it('guards against repeated search/browse loops for identical inputs', async () => {
    const tools = createWebBrowsingTools();

    const firstSearch = await tools.web_search.execute?.({ query: 'remix loaders', maxResults: 3 }, {} as any);
    expect(firstSearch?.results?.length).toBeGreaterThan(0);

    const secondSearch = await tools.web_search.execute?.({ query: 'remix loaders', maxResults: 3 }, {} as any);
    expect(secondSearch?.results).toEqual([]);
    expect(secondSearch?.markdown).toContain('Repeated web_search call');

    const firstBrowse = await tools.web_browse.execute?.({ url: 'https://example.com/docs' }, {} as any);
    expect(firstBrowse?.title).toBe('Example Docs');

    const secondBrowse = await tools.web_browse.execute?.({ url: 'https://example.com/docs' }, {} as any);
    expect(secondBrowse?.markdown).toContain('Repeated URL Browse Prevented');
  });
});
