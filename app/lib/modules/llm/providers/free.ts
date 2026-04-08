import type { LanguageModelV1 } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import {
  FREE_HOSTED_MODEL,
  FREE_HOSTED_MODEL_LABEL,
  FREE_HOSTED_MODEL_MAX_COMPLETION_TOKENS,
  FREE_HOSTED_MODEL_MAX_TOKENS,
  FREE_PROVIDER_NAME,
} from '~/lib/modules/llm/free-provider-config';
import type { IProviderSetting } from '~/types/model';

const FREE_HOSTED_MODEL_INFO: ModelInfo = {
  name: FREE_HOSTED_MODEL,
  label: FREE_HOSTED_MODEL_LABEL,
  provider: FREE_PROVIDER_NAME,
  maxTokenAllowed: FREE_HOSTED_MODEL_MAX_TOKENS,
  maxCompletionTokens: FREE_HOSTED_MODEL_MAX_COMPLETION_TOKENS,
};

export function clearHostedFreeModelResolution() {
  // Legacy helper retained for API compatibility with existing tests/callers.
}

export default class FreeProvider extends BaseProvider {
  name = FREE_PROVIDER_NAME;
  allowsUserApiKey = false;

  config = {
    apiTokenKey: 'FREE_OPENROUTER_API_KEY',
  };

  staticModels: ModelInfo[] = [FREE_HOSTED_MODEL_INFO];

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

    return openRouter.chat(FREE_HOSTED_MODEL) as LanguageModelV1;
  }
}
