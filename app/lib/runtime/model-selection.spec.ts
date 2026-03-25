import { describe, expect, it } from 'vitest';
import type { ModelInfo } from '~/lib/modules/llm/types';
import {
  buildInstanceSelectionStorageKey,
  getRememberedProviderModel,
  hasUsableApiKey,
  parseApiKeysCookie,
  pickPreferredProviderName,
  readProviderHistory,
  readInstanceSelection,
  recordProviderHistory,
  rememberInstanceSelection,
  rememberProviderModelSelection,
  resolvePreferredModelName,
} from './model-selection';

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

describe('model-selection utilities', () => {
  it('parses and normalizes api key cookies', () => {
    const parsed = parseApiKeysCookie(
      JSON.stringify({
        OpenAI: ' sk-live ',
        Anthropic: '',
        Together: ' ROTATE_REQUIRED ',
        invalid: 42,
      }),
    );

    expect(parsed).toEqual({
      OpenAI: 'sk-live',
    });
  });

  it('treats placeholder api keys as unusable', () => {
    expect(
      hasUsableApiKey(
        {
          OpenAI: 'ROTATE_REQUIRED',
          Anthropic: '  your_key_here  ',
          Groq: 'gsk_realish_token',
        },
        'OpenAI',
      ),
    ).toBe(false);

    expect(hasUsableApiKey({ Anthropic: 'your_key_here' }, 'Anthropic')).toBe(false);
    expect(hasUsableApiKey({ Groq: 'gsk_realish_token' }, 'Groq')).toBe(true);
  });

  it('prefers the most recently configured provider when it is active and usable', () => {
    const preferred = pickPreferredProviderName({
      activeProviderNames: ['OpenAI', 'Anthropic', 'Ollama'],
      apiKeys: {
        OpenAI: 'sk-openai',
        Anthropic: 'sk-anthropic',
      },
      localProviderNames: ['Ollama'],
      savedProviderName: 'OpenAI',
      lastConfiguredProviderName: 'Anthropic',
      fallbackProviderName: 'OpenAI',
    });

    expect(preferred).toBe('Anthropic');
  });

  it('falls back to local provider when no cloud key is configured', () => {
    const preferred = pickPreferredProviderName({
      activeProviderNames: ['OpenAI', 'Ollama'],
      apiKeys: {},
      localProviderNames: ['Ollama'],
      savedProviderName: 'OpenAI',
      fallbackProviderName: 'OpenAI',
    });

    expect(preferred).toBe('Ollama');
  });

  it('prefers the hosted FREE provider when it is env-configured and no selection is saved', () => {
    const preferred = pickPreferredProviderName({
      activeProviderNames: ['FREE', 'OpenAI', 'LMStudio'],
      apiKeys: {},
      configuredProviderNames: ['FREE'],
      localProviderNames: ['LMStudio'],
      fallbackProviderName: 'FREE',
    });

    expect(preferred).toBe('FREE');
  });

  it('prefers an env-configured provider over local fallback during bootstrap', () => {
    const preferred = pickPreferredProviderName({
      activeProviderNames: ['OpenAI', 'LMStudio'],
      apiKeys: {},
      configuredProviderNames: ['OpenAI'],
      localProviderNames: ['LMStudio'],
      savedProviderName: 'OpenAI',
      fallbackProviderName: 'LMStudio',
    });

    expect(preferred).toBe('OpenAI');
  });

  it('treats invalid Bedrock JSON config as unusable and picks a valid provider key', () => {
    const preferred = pickPreferredProviderName({
      activeProviderNames: ['AmazonBedrock', 'OpenAI', 'Ollama'],
      apiKeys: {
        AmazonBedrock: 'not-json',
        OpenAI: 'sk-openai',
      },
      localProviderNames: ['Ollama'],
      savedProviderName: 'AmazonBedrock',
      lastConfiguredProviderName: 'AmazonBedrock',
      fallbackProviderName: 'OpenAI',
    });

    expect(preferred).toBe('OpenAI');
  });

  it('resolves model preference as remembered -> saved -> preferred fallback', () => {
    const models: ModelInfo[] = [
      { name: 'gpt-4o', label: 'GPT-4o', provider: 'OpenAI', maxTokenAllowed: 128000 },
      { name: 'gpt-5-codex', label: 'GPT-5 Codex', provider: 'OpenAI', maxTokenAllowed: 128000 },
    ];

    const rememberedFirst = resolvePreferredModelName({
      providerName: 'OpenAI',
      models,
      rememberedModelName: 'gpt-5-codex',
      savedModelName: 'gpt-4o',
    });
    const savedSecond = resolvePreferredModelName({
      providerName: 'OpenAI',
      models,
      savedModelName: 'gpt-4o',
    });
    const fallbackThird = resolvePreferredModelName({
      providerName: 'OpenAI',
      models,
    });

    expect(rememberedFirst).toBe('gpt-5-codex');
    expect(savedSecond).toBe('gpt-4o');
    expect(fallbackThird).toBe('gpt-5-codex');
  });

  it('prefers a stronger default model instead of alphabetical fallback when saved models are invalid', () => {
    const models: ModelInfo[] = [
      { name: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', provider: 'OpenAI', maxTokenAllowed: 16000 },
      { name: 'gpt-4o', label: 'GPT-4o', provider: 'OpenAI', maxTokenAllowed: 128000 },
      { name: 'gpt-5.4', label: 'GPT-5.4', provider: 'OpenAI', maxTokenAllowed: 128000, maxCompletionTokens: 12000 },
    ];

    const resolved = resolvePreferredModelName({
      providerName: 'OpenAI',
      models,
      rememberedModelName: 'missing-model',
      savedModelName: 'also-missing',
    });

    expect(resolved).toBe('gpt-5.4');
  });

  it('stores and retrieves provider model selections', () => {
    const storage = createMemoryStorage();
    rememberProviderModelSelection('OpenAI', 'gpt-5-codex', storage);

    expect(getRememberedProviderModel('OpenAI', storage)).toBe('gpt-5-codex');
  });

  it('stores and retrieves per-instance provider/model selection', () => {
    const storage = createMemoryStorage();
    const hostname = 'alpha1.bolt.gives';

    rememberInstanceSelection(
      {
        hostname,
        providerName: 'OpenAI',
        modelName: 'gpt-5-codex',
      },
      storage,
    );

    expect(buildInstanceSelectionStorageKey(hostname)).toBe('bolt_instance_selection_v1:alpha1.bolt.gives');
    expect(readInstanceSelection(hostname, storage)).toMatchObject({
      providerName: 'OpenAI',
      modelName: 'gpt-5-codex',
    });
  });

  it('tracks provider history by recency without duplicates', () => {
    const storage = createMemoryStorage();
    recordProviderHistory('OpenAI', storage);
    recordProviderHistory('Anthropic', storage);
    recordProviderHistory('OpenAI', storage);

    expect(readProviderHistory(storage)).toEqual(['OpenAI', 'Anthropic']);
  });
});
