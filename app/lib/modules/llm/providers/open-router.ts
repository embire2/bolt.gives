import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import type { LanguageModelV1 } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

interface OpenRouterModel {
  name: string;
  id: string;
  context_length: number;
  pricing: {
    prompt: number | string;
    completion: number | string;
  };
}

interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}

export default class OpenRouterProvider extends BaseProvider {
  name = 'OpenRouter';
  getApiKeyLink = 'https://openrouter.ai/settings/keys';

  config = {
    apiTokenKey: 'OPEN_ROUTER_API_KEY',
  };

  staticModels: ModelInfo[] = [
    /*
     * Essential fallback models - only the most stable/reliable ones
     * Claude 3.5 Sonnet via OpenRouter: 200k context
     */
    {
      name: 'anthropic/claude-3.5-sonnet',
      label: 'Claude 3.5 Sonnet',
      provider: 'OpenRouter',
      maxTokenAllowed: 200000,
    },

    // GPT-4o via OpenRouter: 128k context
    {
      name: 'openai/gpt-4o',
      label: 'GPT-4o',
      provider: 'OpenRouter',
      maxTokenAllowed: 128000,
    },
  ];

  async getDynamicModels(
    apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv: Record<string, string> = {},
  ): Promise<ModelInfo[]> {
    try {
      const { apiKey } = this.getProviderBaseUrlAndKey({
        apiKeys,
        providerSettings: settings,
        serverEnv,
        defaultBaseUrlKey: '',
        defaultApiTokenKey: 'OPEN_ROUTER_API_KEY',
      });

      // OpenRouter dynamic listing is key-scoped; skip network calls when key is absent.
      if (!apiKey) {
        return [];
      }

      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://bolt.gives',
          'X-Title': 'bolt.gives',
        },
        signal: this.createTimeoutSignal(10000),
      });

      if (!response.ok) {
        throw new Error(`OpenRouter model list request failed (${response.status})`);
      }

      const data = (await response.json()) as OpenRouterModelsResponse;
      const models = Array.isArray(data?.data) ? data.data : [];

      return models
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((m) => {
          const promptPrice = Number(m.pricing?.prompt ?? 0);
          const completionPrice = Number(m.pricing?.completion ?? 0);

          // Get accurate context window from OpenRouter API (fallback to 32k if missing)
          const contextWindow = Number(m.context_length || 32000);

          // Cap at reasonable limits to prevent issues (OpenRouter has some very large models)
          const maxAllowed = 1000000; // 1M tokens max for safety
          const finalContext = Math.min(contextWindow, maxAllowed);

          return {
            name: m.id,
            label: `${m.name} - in:$${(promptPrice * 1_000_000).toFixed(2)} out:$${(completionPrice * 1_000_000).toFixed(2)} - context ${finalContext >= 1000000 ? Math.floor(finalContext / 1000000) + 'M' : Math.floor(finalContext / 1000) + 'k'}`,
            provider: this.name,
            maxTokenAllowed: finalContext,
          };
        });
    } catch (error) {
      console.error('Error getting OpenRouter models:', error);
      return [];
    }
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
      defaultApiTokenKey: 'OPEN_ROUTER_API_KEY',
    });

    if (!apiKey) {
      throw new Error(`Missing API key for ${this.name} provider`);
    }

    const openRouter = createOpenRouter({
      apiKey,
    });
    const instance = openRouter.chat(model) as LanguageModelV1;

    return instance;
  }
}
