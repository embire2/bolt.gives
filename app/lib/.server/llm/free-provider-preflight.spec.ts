import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureFreeProviderAvailability, resetFreeProviderPreflightCache } from './free-provider-preflight';
import { FREE_HOSTED_MODEL, FREE_PROVIDER_NAME } from '~/lib/modules/llm/providers/free';

describe('ensureFreeProviderAvailability', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetFreeProviderPreflightCache();
  });

  it('passes through for non-FREE providers', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(
      ensureFreeProviderAvailability({
        providerName: 'OpenAI',
        modelName: 'gpt-5.4',
        apiKey: 'sk-test',
      }),
    ).resolves.toMatchObject({
      resolvedModelName: 'gpt-5.4',
      usedFallback: false,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('throws a rate-limit error when OpenRouter rejects the hosted model', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({
          error: {
            message: 'deepseek/deepseek-v3.2 is temporarily rate-limited upstream.',
          },
        }),
      }),
    );

    await expect(
      ensureFreeProviderAvailability({
        providerName: FREE_PROVIDER_NAME,
        modelName: FREE_HOSTED_MODEL,
        apiKey: 'sk-or-v1-real-secret',
      }),
    ).rejects.toThrow('FREE_PROVIDER_RATE_LIMITED');
  });

  it('returns unavailable when the hosted deepseek route is unavailable', async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({
        error: {
          message: 'deepseek/deepseek-v3.2 is temporarily unavailable upstream.',
        },
      }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    await expect(
      ensureFreeProviderAvailability({
        providerName: FREE_PROVIDER_NAME,
        modelName: FREE_HOSTED_MODEL,
        apiKey: 'sk-or-v1-real-secret',
      }),
    ).rejects.toThrow('FREE_PROVIDER_UNAVAILABLE');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]?.[1]?.body)).toContain(FREE_HOSTED_MODEL);
  });

  it('caches a successful result for the same token fingerprint', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchSpy);

    await ensureFreeProviderAvailability({
      providerName: FREE_PROVIDER_NAME,
      modelName: FREE_HOSTED_MODEL,
      apiKey: 'sk-or-v1-real-secret',
    });
    await expect(
      ensureFreeProviderAvailability({
        providerName: FREE_PROVIDER_NAME,
        modelName: FREE_HOSTED_MODEL,
        apiKey: 'sk-or-v1-real-secret',
      }),
    ).resolves.toMatchObject({
      resolvedModelName: FREE_HOSTED_MODEL,
      usedFallback: false,
    });
    await expect(
      ensureFreeProviderAvailability({
        providerName: FREE_PROVIDER_NAME,
        modelName: FREE_HOSTED_MODEL,
        apiKey: 'sk-or-v1-real-secret',
      }),
    ).resolves.toMatchObject({
      resolvedModelName: FREE_HOSTED_MODEL,
      usedFallback: false,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
