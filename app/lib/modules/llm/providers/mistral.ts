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
    { name: 'mistral-medium-2505', label: 'Mistral Medium 3', provider: 'Mistral', maxTokenAllowed: 128000 },
    { name: 'mistral-small-2503', label: 'Mistral Small 3.1', provider: 'Mistral', maxTokenAllowed: 32768 },
    { name: 'mistral-small-2501', label: 'Mistral Small 3', provider: 'Mistral', maxTokenAllowed: 32768 },
    { name: 'mistral-large-2411', label: 'Mistral Large (24.11)', provider: 'Mistral', maxTokenAllowed: 128000 },
    { name: 'codestral-2501', label: 'Codestral 2', provider: 'Mistral', maxTokenAllowed: 32768 },
    { name: 'devstral-small-2505', label: 'Devstral Small', provider: 'Mistral', maxTokenAllowed: 32768 },
    { name: 'mistral-ocr-2505', label: 'Mistral OCR 2', provider: 'Mistral', maxTokenAllowed: 128000 },
    { name: 'mistral-saba-2502', label: 'Mistral Saba', provider: 'Mistral', maxTokenAllowed: 32768 },
    { name: 'pixtral-large-2411', label: 'Pixtral Large', provider: 'Mistral', maxTokenAllowed: 128000 },
    { name: 'mistral-large-latest', label: 'Mistral Large (Latest)', provider: 'Mistral', maxTokenAllowed: 128000 },
    { name: 'mistral-small-latest', label: 'Mistral Small (Latest)', provider: 'Mistral', maxTokenAllowed: 32768 },
    { name: 'codestral-latest', label: 'Codestral (Latest)', provider: 'Mistral', maxTokenAllowed: 32768 },
    { name: 'magistral-small', label: 'Magistral Small (Reasoning)', provider: 'Mistral', maxTokenAllowed: 32768 },
    { name: 'magistral-medium', label: 'Magistral Medium (Reasoning)', provider: 'Mistral', maxTokenAllowed: 128000 },
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
