import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateFreeProviderSelection, isHostedFreeCreditsExhausted } from './free-provider-validation';
import { FREE_HOSTED_MODEL, FREE_PROVIDER_NAME } from '@bolt/agent/lib/modules/llm/free-provider-config';

describe('validateFreeProviderSelection', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('does not call the upstream or start a paid probe before real generation', () => {
    const fetchSpy = vi.fn(() => {
      throw new Error('No network during selection');
    });
    vi.stubGlobal('fetch', fetchSpy);

    for (const modelName of [FREE_HOSTED_MODEL, 'claude-opus-4-8', 'claude-sonnet-5', 'claude-fable-5']) {
      expect(
        validateFreeProviderSelection({
          providerName: FREE_PROVIDER_NAME,
          modelName,
          apiKey: 'fixture-key',
        }),
      ).toEqual({ resolvedModelName: modelName, usedFallback: false });
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('leaves non-FREE provider selection and validation to its provider', () => {
    expect(validateFreeProviderSelection({ providerName: 'OpenAI', modelName: 'fixture-model' })).toEqual({
      resolvedModelName: 'fixture-model',
      usedFallback: false,
    });
  });

  it.each([undefined, '', '   '])('still rejects a missing hosted credential: %s', (apiKey) => {
    expect(() =>
      validateFreeProviderSelection({
        providerName: FREE_PROVIDER_NAME,
        modelName: FREE_HOSTED_MODEL,
        apiKey,
      }),
    ).toThrow('Missing API key for FREE provider');
  });

  it('restricts unapproved models to the hosted default', () => {
    expect(
      validateFreeProviderSelection({
        providerName: FREE_PROVIDER_NAME,
        modelName: 'unapproved',
        apiKey: 'fixture-key',
      }),
    ).toEqual({ resolvedModelName: FREE_HOSTED_MODEL, usedFallback: true });
  });

  it('does not reuse a successful selection after a credential was removed', () => {
    validateFreeProviderSelection({
      providerName: FREE_PROVIDER_NAME,
      modelName: FREE_HOSTED_MODEL,
      apiKey: 'fixture-key',
    });
    expect(() =>
      validateFreeProviderSelection({ providerName: FREE_PROVIDER_NAME, modelName: FREE_HOSTED_MODEL }),
    ).toThrow('Missing API key');
  });
});

describe('isHostedFreeCreditsExhausted', () => {
  it.each([
    [402, ''],
    [undefined, 'Payment Required'],
    [undefined, 'Insufficient credits'],
    [undefined, 'Wallet balance exhausted'],
  ])('recognizes actual generation funding failures (%s, %s)', (status, message) => {
    expect(isHostedFreeCreditsExhausted(status as number | undefined, String(message))).toBe(true);
  });
  it('does not disguise rate limits or timeouts as funding failures', () => {
    expect(isHostedFreeCreditsExhausted(429, 'Rate limit exceeded')).toBe(false);
    expect(isHostedFreeCreditsExhausted(503, 'Network timeout')).toBe(false);
  });
});
