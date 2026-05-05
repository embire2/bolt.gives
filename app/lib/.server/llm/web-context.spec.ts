import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hydrateWebsiteSourceContext, extractPublicUrlsFromText, WEBSITE_SOURCE_CONTEXT_MARKER } from './web-context';
import { browsePageWithPlaywright } from '~/lib/.server/web-browse-client';

vi.mock('~/lib/.server/web-browse-client', () => {
  return {
    browsePageWithPlaywright: vi.fn(),
  };
});

describe('web source context hydration', () => {
  beforeEach(() => {
    vi.mocked(browsePageWithPlaywright).mockReset();
    vi.mocked(browsePageWithPlaywright).mockResolvedValue({
      url: 'https://example.com/',
      finalUrl: 'https://example.com/',
      status: 200,
      title: 'Example Company',
      description: 'Industrial design and consulting.',
      content: 'Services include brand strategy, product design, and implementation support.',
      headings: ['Services', 'Case Studies'],
      links: [{ title: 'Contact', url: 'https://example.com/contact' }],
    });
  });

  it('extracts only public http/https URLs from user text', () => {
    expect(
      extractPublicUrlsFromText('Use https://example.com, ignore http://127.0.0.1:3000 and ftp://example.com/file.'),
    ).toEqual(['https://example.com/']);
  });

  it('appends scraped website content to the latest user message', async () => {
    const result = await hydrateWebsiteSourceContext([
      {
        role: 'user',
        content: 'Scrape https://example.com and build a modern replacement website.',
      },
    ]);

    expect(result.sources).toHaveLength(1);
    expect(result.failures).toHaveLength(0);
    expect(result.messages[0].content).toContain(WEBSITE_SOURCE_CONTEXT_MARKER);
    expect(result.messages[0].content).toContain('Example Company');
    expect(result.messages[0].content).toContain('brand strategy');
    expect(vi.mocked(browsePageWithPlaywright)).toHaveBeenCalledWith(
      { url: 'https://example.com/', maxChars: 6000 },
      { env: undefined },
    );
  });

  it('appends scraped website content to structured text message parts', async () => {
    const result = await hydrateWebsiteSourceContext([
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Scrape https://example.com and build a modern replacement website.',
          },
        ],
      },
    ]);

    expect(result.sources).toHaveLength(1);
    expect(result.messages[0].content).toEqual([
      {
        type: 'text',
        text: expect.stringContaining(WEBSITE_SOURCE_CONTEXT_MARKER),
      },
    ]);
    expect(JSON.stringify(result.messages[0].content)).toContain('brand strategy');
  });

  it('reads URLs from AI SDK parts when content is empty', async () => {
    const result = await hydrateWebsiteSourceContext([
      {
        role: 'user',
        content: '',
        parts: [
          {
            type: 'text',
            text: 'Scrape https://example.com and build a modern replacement website.',
          },
        ],
      },
    ]);

    expect(result.sources).toHaveLength(1);
    expect(result.messages[0].content).toContain(WEBSITE_SOURCE_CONTEXT_MARKER);
    expect(result.messages[0].parts?.[0]).toEqual({
      type: 'text',
      text: expect.stringContaining(WEBSITE_SOURCE_CONTEXT_MARKER),
    });
  });

  it('does not throw or mutate the prompt when all website scrapes fail', async () => {
    vi.mocked(browsePageWithPlaywright).mockRejectedValueOnce(new Error('browser closed'));

    const messages = [
      {
        role: 'user' as const,
        content: 'Scrape https://example.com and build a modern replacement website.',
      },
    ];
    const result = await hydrateWebsiteSourceContext(messages);

    expect(result.sources).toHaveLength(0);
    expect(result.failures).toEqual([{ url: 'https://example.com/', error: 'browser closed' }]);
    expect(result.messages).toBe(messages);
  });
});
