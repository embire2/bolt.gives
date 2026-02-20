import { describe, expect, it } from 'vitest';
import type { ModelInfo } from '~/lib/modules/llm/types';
import {
  buildInstanceSelectionStorageKey,
  getRememberedProviderModel,
  parseApiKeysCookie,
  pickPreferredProviderName,
  readInstanceSelection,
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
        invalid: 42,
      }),
    );

    expect(parsed).toEqual({
      OpenAI: 'sk-live',
    });
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

  it('resolves model preference as remembered -> saved -> first model', () => {
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
    expect(fallbackThird).toBe('gpt-4o');
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
});
