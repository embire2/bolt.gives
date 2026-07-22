import type { LanguageModelV1 } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import {
  FREE_HOSTED_API_BASE_URL,
  FREE_HOSTED_API_TOKEN_KEY,
  FREE_HOSTED_MODEL_MAX_COMPLETION_TOKENS,
  FREE_HOSTED_MODEL_MAX_TOKENS,
  FREE_HOSTED_MODELS,
  FREE_PROVIDER_NAME,
  resolveHostedFreeModel,
} from '~/lib/modules/llm/free-provider-config';
import type { IProviderSetting } from '~/types/model';

type JsonRecord = Record<string, unknown>;

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeHostedFreeResponse(payload: unknown): unknown {
  if (!isJsonRecord(payload) || !Array.isArray(payload.output)) {
    return payload;
  }

  return {
    ...payload,
    incomplete_details: payload.incomplete_details ?? null,
    output: payload.output.map((item) => {
      if (!isJsonRecord(item) || item.type !== 'message' || !Array.isArray(item.content)) {
        return item;
      }

      return {
        ...item,
        content: item.content.map((part) =>
          isJsonRecord(part) && part.type === 'output_text' && !Array.isArray(part.annotations)
            ? { ...part, annotations: [] }
            : part,
        ),
      };
    }),
  };
}

function extractResponseInputText(item: JsonRecord): string {
  if (typeof item.content === 'string') {
    return item.content;
  }

  if (Array.isArray(item.content)) {
    return item.content
      .map((part) => {
        if (!isJsonRecord(part)) {
          return '';
        }

        if (typeof part.text === 'string') {
          return part.text;
        }

        if (typeof part.image_url === 'string') {
          return '[image attached]';
        }

        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  return '';
}

export function normalizeHostedFreeRequest(payload: unknown): unknown {
  if (!isJsonRecord(payload) || !Array.isArray(payload.input)) {
    return payload;
  }

  const instructions: string[] = typeof payload.instructions === 'string' ? [payload.instructions] : [];
  const conversation: string[] = [];

  for (const item of payload.input) {
    if (!isJsonRecord(item)) {
      continue;
    }

    if (item.role === 'system' || item.role === 'developer') {
      const text = extractResponseInputText(item);

      if (text) {
        instructions.push(text);
      }

      continue;
    }

    if (item.role === 'user' || item.role === 'assistant') {
      const text = extractResponseInputText(item);

      if (text) {
        conversation.push(`${String(item.role).toUpperCase()}:\n${text}`);
      }

      continue;
    }

    if (item.type === 'function_call') {
      conversation.push(
        `ASSISTANT TOOL CALL:\n${String(item.name || 'tool')}(${String(item.arguments || '{}')}) [call_id=${String(item.call_id || '')}]`,
      );
    } else if (item.type === 'function_call_output') {
      conversation.push(`TOOL RESULT [call_id=${String(item.call_id || '')}]:\n${String(item.output || '')}`);
    }
  }

  return {
    ...payload,
    instructions: instructions.filter(Boolean).join('\n\n'),
    input: conversation.join('\n\n'),
  };
}

const hostedFreeFetch: typeof fetch = async (input, init) => {
  let requestInit = init;

  if (typeof init?.body === 'string') {
    try {
      requestInit = { ...init, body: JSON.stringify(normalizeHostedFreeRequest(JSON.parse(init.body))) };
    } catch {
      // Leave non-JSON request bodies untouched.
    }
  }

  const response = await fetch(input, requestInit);

  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
    return response;
  }

  let payload: unknown;

  try {
    payload = await response.clone().json();
  } catch {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.delete('content-encoding');
  headers.delete('content-length');
  headers.delete('transfer-encoding');

  return new Response(JSON.stringify(normalizeHostedFreeResponse(payload)), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const hostedFreeClaudeFetch: typeof fetch = async (input, init) => {
  const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
  const apiKey = headers.get('x-api-key');

  if (apiKey && !headers.has('authorization')) {
    headers.set('authorization', `Bearer ${apiKey}`);
  }

  headers.delete('x-api-key');

  return fetch(input, { ...init, headers });
};

export function isHostedFreeClaudeModel(model: string): boolean {
  return model.startsWith('claude-');
}

export function clearHostedFreeModelResolution() {
  // Legacy helper retained for API compatibility with existing tests/callers.
}

export default class FreeProvider extends BaseProvider {
  name = FREE_PROVIDER_NAME;
  allowsUserApiKey = false;

  config = {
    apiTokenKey: FREE_HOSTED_API_TOKEN_KEY,
  };

  staticModels: ModelInfo[] = FREE_HOSTED_MODELS.map((model) => ({
    ...model,
    provider: FREE_PROVIDER_NAME,
    maxTokenAllowed: FREE_HOSTED_MODEL_MAX_TOKENS,
    maxCompletionTokens: FREE_HOSTED_MODEL_MAX_COMPLETION_TOKENS,
  }));

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
      defaultApiTokenKey: FREE_HOSTED_API_TOKEN_KEY,
    });

    if (!apiKey) {
      throw new Error(`Missing API key for ${this.name} provider`);
    }

    const resolvedModel = resolveHostedFreeModel(options.model);

    if (isHostedFreeClaudeModel(resolvedModel)) {
      const magnetApi = createAnthropic({
        apiKey,
        baseURL: FREE_HOSTED_API_BASE_URL,
        fetch: hostedFreeClaudeFetch,
      });

      return magnetApi(resolvedModel) as LanguageModelV1;
    }

    const magnetApi = createOpenAI({
      apiKey,
      baseURL: FREE_HOSTED_API_BASE_URL,
      compatibility: 'strict',
      fetch: hostedFreeFetch,
    });

    return magnetApi.responses(resolvedModel) as LanguageModelV1;
  }
}
