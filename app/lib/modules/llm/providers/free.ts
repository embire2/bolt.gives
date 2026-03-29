import type { LanguageModelV1 } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { BaseProvider } from '~/lib/modules/llm/base-provider';
import { normalizeCredential } from '~/lib/runtime/credentials';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';

export const FREE_PROVIDER_NAME = 'FREE';
export const FREE_HOSTED_MODEL = 'deepseek/deepseek-v3.2';
export const FREE_FALLBACK_MODEL = 'qwen/qwen3-coder';

type HostedFreeModelResolution = {
  fingerprint: string;
  resolvedModelName: string;
  expiresAt: number;
};

let hostedFreeModelResolution: HostedFreeModelResolution | null = null;

const FREE_HOSTED_MODEL_INFO: ModelInfo = {
  name: FREE_HOSTED_MODEL,
  label: 'DeepSeek V3.2',
  provider: FREE_PROVIDER_NAME,
  maxTokenAllowed: 64000,
  maxCompletionTokens: 8192,
};

export function fingerprintFreeProviderApiKey(apiKey: string): string {
  return `${apiKey.slice(0, 6)}:${apiKey.length}`;
}

export function rememberHostedFreeModelResolution(options: {
  apiKey: string;
  resolvedModelName: string;
  ttlMs: number;
}) {
  hostedFreeModelResolution = {
    fingerprint: fingerprintFreeProviderApiKey(options.apiKey),
    resolvedModelName: options.resolvedModelName,
    expiresAt: Date.now() + options.ttlMs,
  };
}

export function clearHostedFreeModelResolution() {
  hostedFreeModelResolution = null;
}

export function resolveHostedFreeModelName(options: { apiKey?: string; requestedModelName?: string }): string {
  const apiKey = normalizeCredential(options.apiKey);
  const requestedModelName = options.requestedModelName;

  if (!apiKey) {
    return FREE_HOSTED_MODEL;
  }

  if (requestedModelName && ![FREE_HOSTED_MODEL, FREE_FALLBACK_MODEL].includes(requestedModelName)) {
    return FREE_HOSTED_MODEL;
  }

  if (!hostedFreeModelResolution) {
    return FREE_HOSTED_MODEL;
  }

  if (hostedFreeModelResolution.expiresAt <= Date.now()) {
    hostedFreeModelResolution = null;
    return FREE_HOSTED_MODEL;
  }

  if (hostedFreeModelResolution.fingerprint !== fingerprintFreeProviderApiKey(apiKey)) {
    return FREE_HOSTED_MODEL;
  }

  return hostedFreeModelResolution.resolvedModelName;
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

    const resolvedModelName = resolveHostedFreeModelName({
      apiKey,
      requestedModelName: options.model,
    });

    return openRouter.chat(resolvedModelName) as LanguageModelV1;
  }
}
