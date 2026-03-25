import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureFreeProviderAvailability, resetFreeProviderPreflightCache } from './free-provider-preflight';
import { FREE_PROVIDER_NAME, FREE_QWEN_MODEL } from '~/lib/modules/llm/providers/free';

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
    ).resolves.toBeUndefined();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('throws a rate-limit error when OpenRouter rejects the hosted free model', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({
          error: {
            message: 'qwen/qwen3-coder:free is temporarily rate-limited upstream.',
          },
        }),
      }),
    );

    await expect(
      ensureFreeProviderAvailability({
        providerName: FREE_PROVIDER_NAME,
        modelName: FREE_QWEN_MODEL,
        apiKey: 'sk-or-v1-real-secret',
      }),
    ).rejects.toThrow('FREE_PROVIDER_RATE_LIMITED');
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
      modelName: FREE_QWEN_MODEL,
      apiKey: 'sk-or-v1-real-secret',
    });
    await ensureFreeProviderAvailability({
      providerName: FREE_PROVIDER_NAME,
      modelName: FREE_QWEN_MODEL,
      apiKey: 'sk-or-v1-real-secret',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
