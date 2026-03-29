import { afterEach, describe, expect, it, vi } from 'vitest';
import { loader } from '~/routes/api.github-template';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

describe('api.github-template loader', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  it('returns 400 when repo query param is missing', async () => {
    const response = (await loader({
      request: new Request('https://bolt.gives/api/github-template'),
      context: {},
    } as any)) as Response;

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toContain('Repository name is required');
  });

  it('returns empty list with fallback header when remote template fetch fails', async () => {
    process.env.NODE_ENV = 'development';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('', { status: 404, statusText: 'Not Found' })) as unknown as typeof fetch,
    );

    const response = (await loader({
      request: new Request('https://bolt.gives/api/github-template?repo=xKevIsDev/bolt-vite-react-ts-template'),
      context: {},
    } as any)) as Response;

    expect(response.status).toBe(200);
    expect(response.headers.get('x-bolt-template-fallback')).toBe('1');

    const payload = await response.json();
    expect(Array.isArray(payload)).toBe(true);
    expect(payload).toHaveLength(0);
  });
});
