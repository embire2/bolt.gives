import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import type { LanguageModelV1 } from 'ai';
import { createMistral } from '@ai-sdk/mistral';

export default class MistralProvider extends BaseProvider {
  name = 'Mistral';
  getApiKeyLink = 'https://console.mistral.ai/api-keys/';

  config = {
    apiTokenKey: 'MISTRAL_API_KEY',
  };

  staticModels: ModelInfo[] = [
    {
      name: 'mistral-medium-latest',
      label: 'Mistral Medium 3.5',
      provider: 'Mistral',
      maxTokenAllowed: 128000,
      maxCompletionTokens: 32768,
    },
    {
      name: 'mistral-small-latest',
      label: 'Mistral Small 4',
      provider: 'Mistral',
      maxTokenAllowed: 128000,
      maxCompletionTokens: 32768,
    },
    {
      name: 'codestral-latest',
      label: 'Codestral Premier',
      provider: 'Mistral',
      maxTokenAllowed: 256000,
      maxCompletionTokens: 32768,
    },
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
      defaultApiTokenKey: 'MISTRAL_API_KEY',
    });

    if (!apiKey) {
      throw new Error(`Missing API key for ${this.name} provider`);
    }

    const mistral = createMistral({
      apiKey,
    });

    return mistral(model);
  }
}
