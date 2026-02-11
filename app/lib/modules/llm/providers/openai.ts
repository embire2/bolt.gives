import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import type { LanguageModelV1 } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

export default class OpenAIProvider extends BaseProvider {
  name = 'OpenAI';
  getApiKeyLink = 'https://platform.openai.com/api-keys';

  config = {
    apiTokenKey: 'OPENAI_API_KEY',
  };

  staticModels: ModelInfo[] = [
    /*
     * Essential fallback models - only the most stable/reliable ones
     * GPT-4o: 128k context, high performance, recommended for most tasks
     */
    { name: 'gpt-4o', label: 'GPT-4o', provider: 'OpenAI', maxTokenAllowed: 128000, maxCompletionTokens: 16384 },

    // GPT-3.5-turbo: 16k context, fast and cost-effective
    {
      name: 'gpt-3.5-turbo',
      label: 'GPT-3.5 Turbo',
      provider: 'OpenAI',
      maxTokenAllowed: 16000,
      maxCompletionTokens: 4096,
    },
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
      defaultApiTokenKey: 'OPENAI_API_KEY',
    });

    if (!apiKey) {
      throw `Missing Api Key configuration for ${this.name} provider`;
    }

    const response = await fetch(`https://api.openai.com/v1/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const res = (await response.json()) as any;
    const staticModelIds = this.staticModels.map((m) => m.name);

    const data = res.data.filter(
      (model: any) =>
        model.object === 'model' &&
        (model.id.startsWith('gpt-') || model.id.startsWith('o') || model.id.startsWith('chatgpt-')) &&
        !staticModelIds.includes(model.id),
    );

    return data.map((m: any) => {
      // Get accurate context window from OpenAI API
      let contextWindow = 32000; // default fallback

      // OpenAI provides context_length in their API response
      if (m.context_length) {
        contextWindow = m.context_length;
      } else if (m.id?.includes('gpt-4o')) {
        contextWindow = 128000; // GPT-4o has 128k context
      } else if (m.id?.includes('gpt-4-turbo') || m.id?.includes('gpt-4-1106')) {
        contextWindow = 128000; // GPT-4 Turbo has 128k context
      } else if (m.id?.includes('gpt-4')) {
        contextWindow = 8192; // Standard GPT-4 has 8k context
      } else if (m.id?.includes('gpt-3.5-turbo')) {
        contextWindow = 16385; // GPT-3.5-turbo has 16k context
      }

      // Determine completion token limits based on model type
      let maxCompletionTokens = 16384; // default for most models

      if (m.id?.startsWith('o1-preview') || m.id?.startsWith('o1-mini') || m.id?.startsWith('o1')) {
        // Reasoning models have specific completion limits
        maxCompletionTokens = m.id?.includes('mini') ? 8192 : 16384;
      } else if (m.id?.includes('gpt-4o')) {
        maxCompletionTokens = 16384;
      } else if (m.id?.includes('gpt-4')) {
        maxCompletionTokens = 8192;
      } else if (m.id?.includes('gpt-3.5-turbo')) {
        maxCompletionTokens = 4096;
      }

      return {
        name: m.id,
        label: `${m.id} (${Math.floor(contextWindow / 1000)}k context)`,
        provider: this.name,
        maxTokenAllowed: Math.min(contextWindow, 128000), // Cap at 128k for safety
        maxCompletionTokens,
      };
    });
  }

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
      defaultApiTokenKey: 'OPENAI_API_KEY',
    });

    if (!apiKey) {
      throw new Error(`Missing API key for ${this.name} provider`);
    }

    const openai = createOpenAI({
      apiKey,
    });

    return openai(model);
  }
}
