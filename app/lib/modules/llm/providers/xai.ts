import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import type { LanguageModelV1 } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

export default class XAIProvider extends BaseProvider {
  name = 'xAI';
  getApiKeyLink = 'https://docs.x.ai/docs/quickstart#creating-an-api-key';

  config = {
    apiTokenKey: 'XAI_API_KEY',
  };

  staticModels: ModelInfo[] = [
    { name: 'grok-4', label: 'Grok 4', provider: 'xAI', maxTokenAllowed: 131072 },
    { name: 'grok-4-heavy', label: 'Grok 4 Heavy', provider: 'xAI', maxTokenAllowed: 131072 },
    { name: 'grok-3', label: 'Grok 3', provider: 'xAI', maxTokenAllowed: 131072 },
    { name: 'grok-3-mini', label: 'Grok 3 Mini', provider: 'xAI', maxTokenAllowed: 131072 },
    { name: 'grok-beta', label: 'Grok Beta', provider: 'xAI', maxTokenAllowed: 131072 },
    { name: 'grok-2', label: 'Grok 2', provider: 'xAI', maxTokenAllowed: 32768 },
    { name: 'grok-2-mini', label: 'Grok 2 Mini', provider: 'xAI', maxTokenAllowed: 32768 },
    { name: 'grok-2-1212', label: 'Grok 2 1212', provider: 'xAI', maxTokenAllowed: 32768 },
  ];

  getModelInstance(options: {
    model: string;
    serverEnv: Env;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): LanguageModelV1 {
    const { model, serverEnv, apiKeys, providerSettings } = options;

    const { apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: providerSettings?.[this.name],
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: 'XAI_API_KEY',
    });

    if (!apiKey) {
      throw new Error(`Missing API key for ${this.name} provider`);
    }

    const openai = createOpenAI({
      baseURL: 'https://api.x.ai/v1',
      apiKey,
    });

    return openai(model);
  }
}
