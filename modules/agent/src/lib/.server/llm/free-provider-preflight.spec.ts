import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ensureFreeProviderAvailability,
  isHostedFreeCreditsExhausted,
  resetFreeProviderPreflightCache,
} from './free-provider-preflight';
import { FREE_HOSTED_MODEL, FREE_PROVIDER_NAME } from '@bolt/agent/lib/modules/llm/free-provider-config';

describe('ensureFreeProviderAvailability', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
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

  it('throws a rate-limit error when MagnetAPI rejects the hosted model', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({
          error: {
            message: 'gpt-5.6 is temporarily rate-limited upstream.',
          },
        }),
      }),
    );

    await expect(
      ensureFreeProviderAvailability({
        providerName: FREE_PROVIDER_NAME,
        modelName: FREE_HOSTED_MODEL,
        apiKey: 'magnet-real-secret',
      }),
    ).rejects.toThrow('FREE_PROVIDER_RATE_LIMITED');
  });

  it('throws a credits-exhausted error when the hosted route is operator-funded and out of credits', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 402,
        json: async () => ({
          error: {
            message: 'Insufficient credits. Add wallet credit in MagnetAPI.',
          },
        }),
      }),
    );

    await expect(
      ensureFreeProviderAvailability({
        providerName: FREE_PROVIDER_NAME,
        modelName: FREE_HOSTED_MODEL,
        apiKey: 'magnet-real-secret',
      }),
    ).rejects.toThrow('FREE_PROVIDER_CREDITS_EXHAUSTED');
  });

  it('recognizes Magnet payment-required stream errors after a cached preflight', () => {
    expect(isHostedFreeCreditsExhausted(undefined, 'Payment Required')).toBe(true);
    expect(isHostedFreeCreditsExhausted(undefined, 'The model is temporarily unavailable')).toBe(false);
  });

  it('returns unavailable when the hosted FREE route is unavailable', async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({
        error: {
          message: 'gpt-5.6 is temporarily unavailable upstream.',
        },
      }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    await expect(
      ensureFreeProviderAvailability({
        providerName: FREE_PROVIDER_NAME,
        modelName: FREE_HOSTED_MODEL,
        apiKey: 'magnet-real-secret',
      }),
    ).rejects.toThrow('FREE_PROVIDER_UNAVAILABLE');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.magnetapi.org/v1/responses',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(String(fetchSpy.mock.calls[0]?.[1]?.body)).toContain(FREE_HOSTED_MODEL);
    expect(String(fetchSpy.mock.calls[0]?.[1]?.body)).toContain('max_output_tokens');
  });

  it('expires transient upstream failures quickly so automatic repair can retry', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-30T18:00:00.000Z'));

    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ detail: 'The configured provider accounts are temporarily unavailable.' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });
    vi.stubGlobal('fetch', fetchSpy);

    await expect(
      ensureFreeProviderAvailability({
        providerName: FREE_PROVIDER_NAME,
        modelName: FREE_HOSTED_MODEL,
        apiKey: 'magnet-real-secret',
      }),
    ).rejects.toThrow('FREE_PROVIDER_UNAVAILABLE');

    vi.advanceTimersByTime(5_001);

    await expect(
      ensureFreeProviderAvailability({
        providerName: FREE_PROVIDER_NAME,
        modelName: FREE_HOSTED_MODEL,
        apiKey: 'magnet-real-secret',
      }),
    ).resolves.toMatchObject({ resolvedModelName: FREE_HOSTED_MODEL });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('preserves actionable top-level upstream errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ error: 'The selected model is warming up.' }),
      }),
    );

    await expect(
      ensureFreeProviderAvailability({
        providerName: FREE_PROVIDER_NAME,
        modelName: FREE_HOSTED_MODEL,
        apiKey: 'magnet-real-secret',
      }),
    ).rejects.toThrow('The selected model is warming up.');
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
      apiKey: 'magnet-real-secret',
    });
    await expect(
      ensureFreeProviderAvailability({
        providerName: FREE_PROVIDER_NAME,
        modelName: FREE_HOSTED_MODEL,
        apiKey: 'magnet-real-secret',
      }),
    ).resolves.toMatchObject({
      resolvedModelName: FREE_HOSTED_MODEL,
      usedFallback: false,
    });
    await expect(
      ensureFreeProviderAvailability({
        providerName: FREE_PROVIDER_NAME,
        modelName: FREE_HOSTED_MODEL,
        apiKey: 'magnet-real-secret',
      }),
    ).resolves.toMatchObject({
      resolvedModelName: FREE_HOSTED_MODEL,
      usedFallback: false,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('preflights and caches each selected hosted model independently', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchSpy);

    await ensureFreeProviderAvailability({
      providerName: FREE_PROVIDER_NAME,
      modelName: 'claude-opus-4-8',
      apiKey: 'magnet-real-secret',
    });
    await ensureFreeProviderAvailability({
      providerName: FREE_PROVIDER_NAME,
      modelName: 'claude-sonnet-5',
      apiKey: 'magnet-real-secret',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(String(fetchSpy.mock.calls[0]?.[1]?.body)).toContain('claude-opus-4-8');
    expect(String(fetchSpy.mock.calls[1]?.[1]?.body)).toContain('claude-sonnet-5');
  });

  it('uses the Claude Messages contract when preflighting hosted Claude models', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchSpy);

    await ensureFreeProviderAvailability({
      providerName: FREE_PROVIDER_NAME,
      modelName: 'claude-opus-4-8',
      apiKey: 'magnet-real-secret',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.magnetapi.org/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'anthropic-version': '2023-06-01',
        }),
      }),
    );
    expect(JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body))).toEqual({
      model: 'claude-opus-4-8',
      max_tokens: 16,
      messages: [{ role: 'user', content: 'Reply with OK' }],
    });
  });

  it('falls back to the default before probing an unapproved FREE model', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchSpy);

    await expect(
      ensureFreeProviderAvailability({
        providerName: FREE_PROVIDER_NAME,
        modelName: 'arbitrary-model',
        apiKey: 'magnet-real-secret',
      }),
    ).resolves.toEqual({ resolvedModelName: FREE_HOSTED_MODEL, usedFallback: true });

    expect(String(fetchSpy.mock.calls[0]?.[1]?.body)).toContain(FREE_HOSTED_MODEL);
    expect(String(fetchSpy.mock.calls[0]?.[1]?.body)).not.toContain('arbitrary-model');
  });
});
