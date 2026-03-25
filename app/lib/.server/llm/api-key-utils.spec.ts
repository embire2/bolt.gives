import { describe, expect, it } from 'vitest';
import { hydrateApiKeysFromRuntimeEnv, mergeAndSanitizeApiKeys, normalizeApiKeys } from './api-key-utils';

describe('api-key-utils', () => {
  it('normalizes keys by removing blank entries', () => {
    const normalized = normalizeApiKeys({
      OpenAI: '   ',
      Anthropic: 'key-anthropic',
      AmazonBedrock: '{"region":"us-east-1"}',
      bad: 123,
    });

    expect(normalized).toEqual({
      Anthropic: 'key-anthropic',
      AmazonBedrock: '{"region":"us-east-1"}',
    });
  });

  it('keeps cookie keys when body payload sends empty placeholders', () => {
    const merged = mergeAndSanitizeApiKeys({
      cookieApiKeys: {
        OpenAI: 'cookie-openai-key',
      },
      bodyApiKeys: {
        OpenAI: '',
      },
    });

    expect(merged.OpenAI).toBe('cookie-openai-key');
  });

  it('lets non-empty body keys override cookie keys', () => {
    const merged = mergeAndSanitizeApiKeys({
      cookieApiKeys: {
        OpenAI: 'cookie-openai-key',
      },
      bodyApiKeys: {
        OpenAI: 'body-openai-key',
      },
    });

    expect(merged.OpenAI).toBe('body-openai-key');
  });

  it('hydrates missing provider keys from runtime env', () => {
    const hydrated = hydrateApiKeysFromRuntimeEnv({
      apiKeys: {},
      runtimeEnv: {
        OPENAI_API_KEY: 'env-openai-key',
      },
      providerTokenKeyByName: {
        OpenAI: 'OPENAI_API_KEY',
        Anthropic: 'ANTHROPIC_API_KEY',
      },
    });

    expect(hydrated.OpenAI).toBe('env-openai-key');
    expect(hydrated.Anthropic).toBeUndefined();
  });

  it('does not overwrite existing non-empty key with env value', () => {
    const hydrated = hydrateApiKeysFromRuntimeEnv({
      apiKeys: {
        OpenAI: 'ui-openai-key',
      },
      runtimeEnv: {
        OPENAI_API_KEY: 'env-openai-key',
      },
      providerTokenKeyByName: {
        OpenAI: 'OPENAI_API_KEY',
      },
    });

    expect(hydrated.OpenAI).toBe('ui-openai-key');
  });

  it('forces server-managed providers to use the runtime env key instead of user input', () => {
    const hydrated = hydrateApiKeysFromRuntimeEnv({
      apiKeys: {
        FREE: 'user-supplied-free-key',
      },
      runtimeEnv: {
        FREE_OPENROUTER_API_KEY: 'env-free-key',
      },
      providerTokenKeyByName: {
        FREE: 'FREE_OPENROUTER_API_KEY',
      },
      serverManagedProviderNames: ['FREE'],
    });

    expect(hydrated.FREE).toBe('env-free-key');
  });

  it('drops user-supplied values for server-managed providers when no env key exists', () => {
    const hydrated = hydrateApiKeysFromRuntimeEnv({
      apiKeys: {
        FREE: 'user-supplied-free-key',
      },
      runtimeEnv: {},
      providerTokenKeyByName: {
        FREE: 'FREE_OPENROUTER_API_KEY',
      },
      serverManagedProviderNames: ['FREE'],
    });

    expect(hydrated.FREE).toBeUndefined();
  });
});
