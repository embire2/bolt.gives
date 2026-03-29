import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWebBrowsingTools } from './web-tools';
import { browsePageWithPlaywright, searchWebWithPlaywright } from '~/lib/.server/web-browse-client';

vi.mock('~/lib/.server/web-browse-client', () => {
  return {
    searchWebWithPlaywright: vi.fn(),
    browsePageWithPlaywright: vi.fn(),
  };
});

describe('createWebBrowsingTools', () => {
  beforeEach(() => {
    vi.mocked(searchWebWithPlaywright).mockReset();
    vi.mocked(browsePageWithPlaywright).mockReset();

    vi.mocked(searchWebWithPlaywright).mockResolvedValue({
      query: 'remix loaders',
      engine: 'duckduckgo',
      results: [
        {
          title: 'Remix Loader Docs',
          url: 'https://remix.run/docs/en/main/route/loader',
          snippet: 'How loaders work in Remix.',
        },
      ],
    });

    vi.mocked(browsePageWithPlaywright).mockResolvedValue({
      url: 'https://example.com/docs',
      finalUrl: 'https://example.com/docs',
      status: 200,
      title: 'Example Docs',
      description: 'Example API docs.',
      content: 'GET /v1/widgets returns all widgets.',
      headings: ['Overview', 'Authentication'],
      links: [{ title: 'Auth', url: 'https://example.com/docs/auth' }],
    });
  });

  it('requires strict-compatible tool parameters (no optional object keys)', () => {
    const tools = createWebBrowsingTools();

    const searchWithoutMaxResults = tools.web_search.parameters.safeParse({ query: 'remix loaders' });
    expect(searchWithoutMaxResults.success).toBe(false);

    const searchWithNullMaxResults = tools.web_search.parameters.safeParse({
      query: 'remix loaders',
      maxResults: null,
    });
    expect(searchWithNullMaxResults.success).toBe(true);

    const browseWithoutMaxChars = tools.web_browse.parameters.safeParse({ url: 'https://example.com/docs' });
    expect(browseWithoutMaxChars.success).toBe(false);

    const browseWithNullMaxChars = tools.web_browse.parameters.safeParse({
      url: 'https://example.com/docs',
      maxChars: null,
    });
    expect(browseWithNullMaxChars.success).toBe(true);
  });

  it('returns web_search and web_browse tools with executable handlers', async () => {
    const tools = createWebBrowsingTools();

    expect(tools.web_search).toBeDefined();
    expect(tools.web_browse).toBeDefined();

    const searchResult = await tools.web_search.execute?.({ query: 'remix loaders', maxResults: 3 }, {} as any);
    expect(searchResult?.engine).toBe('duckduckgo');
    expect(searchResult?.markdown).toContain('Remix Loader Docs');

    const browseResult = await tools.web_browse.execute?.(
      { url: 'https://example.com/docs', maxChars: null },
      {} as any,
    );
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

    const firstBrowse = await tools.web_browse.execute?.(
      { url: 'https://example.com/docs', maxChars: null },
      {} as any,
    );
    expect(firstBrowse?.title).toBe('Example Docs');

    const secondBrowse = await tools.web_browse.execute?.(
      { url: 'https://example.com/docs', maxChars: null },
      {} as any,
    );
    expect(secondBrowse?.markdown).toContain('Repeated URL Browse Prevented');
  });

  it('returns a non-throwing result for blocked local/private URLs', async () => {
    const tools = createWebBrowsingTools();

    const result = await tools.web_browse.execute?.({ url: 'http://127.0.0.1:5173', maxChars: null }, {} as any);

    expect(result?.status).toBe(400);
    expect(result?.title).toBe('URL Not Allowed');
    expect(result?.markdown).toContain('Localhost/private network URLs are not allowed');
    expect(vi.mocked(browsePageWithPlaywright)).not.toHaveBeenCalled();
  });

  it('returns a non-throwing result when web browsing fails upstream', async () => {
    vi.mocked(browsePageWithPlaywright).mockRejectedValueOnce(new Error('navigation timeout'));

    const tools = createWebBrowsingTools();

    const result = await tools.web_browse.execute?.({ url: 'https://example.com/docs', maxChars: null }, {} as any);

    expect(result?.status).toBe(502);
    expect(result?.title).toBe('Web Browse Failed');
    expect(result?.markdown).toContain('navigation timeout');
  });
});
