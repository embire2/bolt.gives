import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV1 } from 'ai';
import { BaseProvider } from '@bolt/agent/lib/modules/llm/base-provider';
import {
  getMagnetApiModelLabel,
  MAGNET_API_BASE_URL,
  MAGNET_API_MODEL_MAX_COMPLETION_TOKENS,
  MAGNET_API_MODEL_MAX_TOKENS,
  MAGNET_API_MODELS,
  MAGNET_API_PROVIDER_NAME,
  MAGNET_API_USER_TOKEN_KEY,
} from '@bolt/agent/lib/modules/llm/magnet-api-provider-config';
import type { ModelInfo } from '@bolt/agent/lib/modules/llm/types';
import type { IProviderSetting } from '@bolt/agent/types/model';
import { hostedFreeClaudeFetch, hostedFreeFetch, isHostedFreeClaudeModel } from './free';

interface MagnetApiModel {
  id?: unknown;
  display_name?: unknown;
  context_window?: unknown;
  max_output_tokens?: unknown;
}

interface MagnetApiModelsResponse {
  data?: MagnetApiModel[];
}

function toPositiveNumber(value: unknown, fallback: number, ceiling: number): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, ceiling) : fallback;
}

export default class MagnetApiProvider extends BaseProvider {
  name = MAGNET_API_PROVIDER_NAME;
  getApiKeyLink = 'https://magnetapi.org/dashboard';
  labelForGetApiKey = 'Get MagnetAPI key';
  icon = 'i-ph:magnet-straight-fill';

  config = {
    baseUrl: MAGNET_API_BASE_URL,
    apiTokenKey: MAGNET_API_USER_TOKEN_KEY,
  };

  staticModels: ModelInfo[] = MAGNET_API_MODELS.map((model) => ({
    ...model,
    provider: MAGNET_API_PROVIDER_NAME,
    maxTokenAllowed: MAGNET_API_MODEL_MAX_TOKENS,
    maxCompletionTokens: MAGNET_API_MODEL_MAX_COMPLETION_TOKENS,
  }));

  async getDynamicModels(
    apiKeys?: Record<string, string>,
    _settings?: IProviderSetting,
    serverEnv: Record<string, string> = {},
  ): Promise<ModelInfo[]> {
    const { baseUrl, apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: undefined,
      serverEnv,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: MAGNET_API_USER_TOKEN_KEY,
    });

    if (!baseUrl || !apiKey) {
      return [];
    }

    const response = await fetch(`${baseUrl}/models`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: this.createTimeoutSignal(10_000),
    });

    if (!response.ok) {
      throw new Error(`MagnetAPI model list request failed (${response.status})`);
    }

    const payload = (await response.json()) as MagnetApiModelsResponse;
    const seen = new Set<string>();

    return (Array.isArray(payload.data) ? payload.data : []).flatMap((entry) => {
      const id = typeof entry.id === 'string' ? entry.id.trim() : '';

      if (!id || seen.has(id)) {
        return [];
      }

      seen.add(id);

      return [
        {
          name: id,
          label: getMagnetApiModelLabel(
            id,
            typeof entry.display_name === 'string' ? entry.display_name.trim() : undefined,
          ),
          provider: MAGNET_API_PROVIDER_NAME,
          maxTokenAllowed: toPositiveNumber(entry.context_window, MAGNET_API_MODEL_MAX_TOKENS, 1_000_000),
          maxCompletionTokens: toPositiveNumber(
            entry.max_output_tokens,
            MAGNET_API_MODEL_MAX_COMPLETION_TOKENS,
            128_000,
          ),
        },
      ];
    });
  }

  getModelInstance(options: {
    model: string;
    serverEnv: Env;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): LanguageModelV1 {
    const envRecord = this.convertEnvToRecord(options.serverEnv);
    const { baseUrl, apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys: options.apiKeys,
      providerSettings: undefined,
      serverEnv: envRecord,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: MAGNET_API_USER_TOKEN_KEY,
    });

    if (!baseUrl || !apiKey) {
      throw new Error('Missing API key for MagnetAPI provider. Sign in to MagnetAPI, buy a plan, and paste your key.');
    }

    if (isHostedFreeClaudeModel(options.model)) {
      const magnetApi = createAnthropic({
        apiKey,
        baseURL: baseUrl,
        fetch: hostedFreeClaudeFetch,
      });

      return magnetApi(options.model) as LanguageModelV1;
    }

    const magnetApi = createOpenAI({
      apiKey,
      baseURL: baseUrl,
      compatibility: 'strict',
      fetch: hostedFreeFetch,
    });

    return magnetApi.responses(options.model) as LanguageModelV1;
  }
}
