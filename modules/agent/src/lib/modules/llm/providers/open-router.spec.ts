import { afterEach, describe, expect, it, vi } from 'vitest';
import OpenRouterProvider from './open-router';

describe('OpenRouterProvider.getDynamicModels', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('returns no dynamic models when API key is not configured', async () => {
    vi.stubEnv('OPEN_ROUTER_API_KEY', '');

    const provider = new OpenRouterProvider();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const models = await provider.getDynamicModels({}, undefined, {});

    expect(models).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetches key-scoped model catalog with auth header and maps values', async () => {
    const provider = new OpenRouterProvider();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'openai/gpt-4o',
            name: 'OpenAI GPT-4o',
            context_length: 128000,
            pricing: {
              prompt: '0.000005',
              completion: '0.000015',
            },
          },
        ],
      }),
    } as Response);

    const models = await provider.getDynamicModels({}, undefined, {
      OPEN_ROUTER_API_KEY: 'sk-or-test',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [, init] = fetchSpy.mock.calls[0]!;
    const headers = (init?.headers ?? {}) as Record<string, string>;

    expect(headers.Authorization).toBe('Bearer sk-or-test');
    expect(headers['HTTP-Referer']).toBe('https://bolt.gives');
    expect(headers['X-Title']).toBe('bolt.gives');

    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      provider: 'OpenRouter',
      name: 'openai/gpt-4o',
      maxTokenAllowed: 128000,
    });
    expect(models[0]?.label).toContain('OpenAI GPT-4o');
    expect(models[0]?.label).toContain('in:$5.00');
    expect(models[0]?.label).toContain('out:$15.00');
  });
});
