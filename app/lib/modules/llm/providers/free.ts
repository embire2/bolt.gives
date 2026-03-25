import type { LanguageModelV1 } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';

export const FREE_PROVIDER_NAME = 'FREE';
export const FREE_QWEN_MODEL = 'qwen/qwen3-coder:free';

const FREE_QWEN_MODEL_INFO: ModelInfo = {
  name: FREE_QWEN_MODEL,
  label: 'Qwen3 Coder 480B A35B (free)',
  provider: FREE_PROVIDER_NAME,
  maxTokenAllowed: 262000,
};

export default class FreeProvider extends BaseProvider {
  name = FREE_PROVIDER_NAME;
  allowsUserApiKey = false;

  config = {
    apiTokenKey: 'FREE_OPENROUTER_API_KEY',
  };

  staticModels: ModelInfo[] = [FREE_QWEN_MODEL_INFO];

  getModelInstance(options: {
    model: string;
    serverEnv: Env;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): LanguageModelV1 {
    const { serverEnv, apiKeys, providerSettings } = options;
    const { apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: providerSettings?.[this.name],
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: 'FREE_OPENROUTER_API_KEY',
    });

    if (!apiKey) {
      throw new Error(`Missing API key for ${this.name} provider`);
    }

    const openRouter = createOpenRouter({
      apiKey,
    });

    return openRouter.chat(FREE_QWEN_MODEL) as LanguageModelV1;
  }
}
