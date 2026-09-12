import { afterEach, describe, expect, it, vi } from 'vitest';

const { browse } = vi.hoisted(() => ({ browse: vi.fn() }));
vi.mock('@bolt/agent/lib/.server/web-browse-client', () => ({ browsePageWithPlaywright: browse }));
import { action } from '~/routes/api.web-search';

afterEach(() => {
  vi.restoreAllMocks();
  browse.mockReset();
});

function call(url: string) {
  return action({
    request: new Request('https://bolt.gives/api/web-search', { method: 'POST', body: JSON.stringify({ url }) }),
    context: {},
  } as never);
}
describe('web page extraction route', () => {
  it('does not bypass protected transports on failure', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    browse.mockRejectedValue(new Error('fixture transport unavailable'));
    expect((await call('https://example.com')).status).toBe(502);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects non-public destinations before browsing', async () => {
    expect((await call('http://[::ffff:127.0.0.1]/secret')).status).toBe(400);
    expect(browse).not.toHaveBeenCalled();
  });
  it('returns extracted public content, not an upstream error page', async () => {
    browse.mockResolvedValue({
      status: 200,
      title: 'Example',
      description: '',
      content: 'Public text',
      finalUrl: 'https://example.com/',
    });
    expect(await (await call('https://example.com')).json()).toMatchObject({
      success: true,
      data: { content: 'Public text' },
    });
    browse.mockResolvedValue({ status: 404 });
    expect((await call('https://example.com')).status).toBe(502);
  });
});
