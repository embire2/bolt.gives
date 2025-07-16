import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import type { LanguageModelV1 } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

export default class GoogleProvider extends BaseProvider {
  name = 'Google';
  getApiKeyLink = 'https://aistudio.google.com/app/apikey';

  config = {
    apiTokenKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
  };

  staticModels: ModelInfo[] = [
    { name: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'Google', maxTokenAllowed: 1048576 },
    { name: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'Google', maxTokenAllowed: 1048576 },
    { name: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', provider: 'Google', maxTokenAllowed: 1048576 },
    { name: 'gemini-2.5-flash-live', label: 'Gemini 2.5 Flash Live', provider: 'Google', maxTokenAllowed: 1048576 },
    { name: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', provider: 'Google', maxTokenAllowed: 1048576 },
    { name: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite', provider: 'Google', maxTokenAllowed: 1048576 },
    { name: 'gemini-2.0-pro', label: 'Gemini 2.0 Pro (Experimental)', provider: 'Google', maxTokenAllowed: 1048576 },
    { name: 'gemini-2.0-flash-live', label: 'Gemini 2.0 Flash Live', provider: 'Google', maxTokenAllowed: 1048576 },
    {
      name: 'gemini-2.0-flash-thinking-exp-01-21',
      label: 'Gemini 2.0 Flash Thinking Exp',
      provider: 'Google',
      maxTokenAllowed: 65536,
    },
    { name: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', provider: 'Google', maxTokenAllowed: 1048576 },
    { name: 'gemini-1.5-flash-8b', label: 'Gemini 1.5 Flash 8B', provider: 'Google', maxTokenAllowed: 1048576 },
    { name: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', provider: 'Google', maxTokenAllowed: 2097152 },
  ];

  async getDynamicModels(
    apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv?: Record<string, string>,
  ): Promise<ModelInfo[]> {
    const { apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: settings,
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
    });

    if (!apiKey) {
      throw `Missing Api Key configuration for ${this.name} provider`;
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
      headers: {
        ['Content-Type']: 'application/json',
      },
    });

    const res = (await response.json()) as any;

    const data = res.models.filter((model: any) => model.outputTokenLimit > 8000);

    return data.map((m: any) => ({
      name: m.name.replace('models/', ''),
      label: `${m.displayName} - context ${Math.floor((m.inputTokenLimit + m.outputTokenLimit) / 1000) + 'k'}`,
      provider: this.name,
      maxTokenAllowed: m.inputTokenLimit + m.outputTokenLimit || 8000,
    }));
  }

  getModelInstance(options: {
    model: string;
    serverEnv: any;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): LanguageModelV1 {
    const { model, serverEnv, apiKeys, providerSettings } = options;

    const { apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: providerSettings?.[this.name],
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
    });

    if (!apiKey) {
      throw new Error(`Missing API key for ${this.name} provider`);
    }

    const google = createGoogleGenerativeAI({
      apiKey,
    });

    return google(model);
  }
}
