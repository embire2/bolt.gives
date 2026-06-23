import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import type { LanguageModelV1 } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

const MINIMAX_MODEL_LIMITS: Record<string, Pick<ModelInfo, 'maxTokenAllowed' | 'maxCompletionTokens'>> = {
  'MiniMax-M3': { maxTokenAllowed: 1000000, maxCompletionTokens: 128000 },
  'MiniMax-M2.7': { maxTokenAllowed: 204800, maxCompletionTokens: 128000 },
  'MiniMax-M2.7-highspeed': { maxTokenAllowed: 204800, maxCompletionTokens: 128000 },
};

function getMiniMaxLimits(modelId: string): Pick<ModelInfo, 'maxTokenAllowed' | 'maxCompletionTokens'> {
  return MINIMAX_MODEL_LIMITS[modelId] || { maxTokenAllowed: 204800, maxCompletionTokens: 128000 };
}

export default class MiniMaxProvider extends BaseProvider {
  name = 'MiniMax';
  getApiKeyLink = 'https://platform.minimax.io/';

  config = {
    apiTokenKey: 'MINIMAX_API_KEY',
  };

  staticModels: ModelInfo[] = [
    {
      name: 'MiniMax-M3',
      label: 'MiniMax M3',
      provider: 'MiniMax',
      ...getMiniMaxLimits('MiniMax-M3'),
    },
    {
      name: 'MiniMax-M2.7',
      label: 'MiniMax M2.7',
      provider: 'MiniMax',
      ...getMiniMaxLimits('MiniMax-M2.7'),
    },
    {
      name: 'MiniMax-M2.7-highspeed',
      label: 'MiniMax M2.7 Highspeed',
      provider: 'MiniMax',
      ...getMiniMaxLimits('MiniMax-M2.7-highspeed'),
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
      defaultApiTokenKey: 'MINIMAX_API_KEY',
    });

    if (!apiKey) {
      return [];
    }

    try {
      const response = await fetch('https://api.minimax.io/v1/models', {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        signal: this.createTimeoutSignal(5000),
      });

      if (!response.ok) {
        console.error(`MiniMax API error: ${response.status} ${response.statusText}`);
        return [];
      }

      const data = (await response.json()) as { data?: Array<{ id?: string; object?: string }> };
      const staticModelIds = new Set(this.staticModels.map((model) => model.name));
      const models = Array.isArray(data.data) ? data.data : [];

      return models
        .filter((model) => model.object === 'model' && model.id && !staticModelIds.has(model.id))
        .map((model) => ({
          name: model.id!,
          label: model.id!,
          provider: this.name,
          ...getMiniMaxLimits(model.id!),
        }));
    } catch (error) {
      console.error('Failed to fetch MiniMax models:', error);
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
      defaultApiTokenKey: 'MINIMAX_API_KEY',
    });

    if (!apiKey) {
      throw new Error(`Missing API key for ${this.name} provider`);
    }

    const minimax = createOpenAI({
      baseURL: 'https://api.minimax.io/v1',
      apiKey,
    });

    return minimax(model);
  }
}
