import type { Message } from 'ai';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, MODEL_REGEX, PROVIDER_REGEX } from '~/utils/constants';
import { extractPropertiesFromMessage } from './utils';

export type ResolvedModelProvider = {
  model: string;
  provider: string;
};

type ChatMessage = Omit<Message, 'id'>;

const LOCAL_PROVIDER_NAMES = new Set(['Ollama', 'LMStudio', 'OpenAILike']);
const DEFAULT_PROVIDER_PRIORITY = ['OpenAI', 'Anthropic', 'OpenRouter', 'Google', 'Groq', 'Together'];

function isValidBedrockApiKey(rawKey: string): boolean {
  try {
    const parsed = JSON.parse(rawKey) as {
      region?: unknown;
      accessKeyId?: unknown;
      secretAccessKey?: unknown;
    };

    return (
      typeof parsed.region === 'string' &&
      parsed.region.trim().length > 0 &&
      typeof parsed.accessKeyId === 'string' &&
      parsed.accessKeyId.trim().length > 0 &&
      typeof parsed.secretAccessKey === 'string' &&
      parsed.secretAccessKey.trim().length > 0
    );
  } catch {
    return false;
  }
}

function hasUsableProviderCredential(providerName: string, apiKeys?: Record<string, string>): boolean {
  if (LOCAL_PROVIDER_NAMES.has(providerName)) {
    return true;
  }

  const rawKey = apiKeys?.[providerName];

  if (typeof rawKey !== 'string') {
    return false;
  }

  const trimmedKey = rawKey.trim();

  if (trimmedKey.length === 0) {
    return false;
  }

  if (providerName === 'AmazonBedrock') {
    return isValidBedrockApiKey(trimmedKey);
  }

  return true;
}

export function getMessageTextContent(message: ChatMessage): string {
  const rawContent = message.content as unknown;

  if (typeof rawContent === 'string') {
    return rawContent;
  }

  if (Array.isArray(rawContent)) {
    const textPart = rawContent.find((part) => {
      if (!part || typeof part !== 'object') {
        return false;
      }

      return (part as { type?: string }).type === 'text';
    }) as { text?: string } | undefined;

    return textPart?.text || '';
  }

  return '';
}

function injectModelProviderEnvelope(message: ChatMessage, selection: ResolvedModelProvider): ChatMessage {
  const prefix = `[Model: ${selection.model}]\n\n[Provider: ${selection.provider}]\n\n`;
  const rawContent = message.content as unknown;

  if (typeof rawContent === 'string') {
    return {
      ...message,
      content: `${prefix}${rawContent}`,
    };
  }

  if (Array.isArray(rawContent)) {
    let injected = false;
    const nextContent = rawContent.map((part) => {
      if (!injected && part && typeof part === 'object' && (part as { type?: string }).type === 'text') {
        injected = true;

        const textValue = (part as { text?: string }).text || '';

        return {
          ...(part as Record<string, unknown>),
          text: `${prefix}${textValue}`,
        };
      }

      return part;
    });

    if (!injected) {
      nextContent.unshift({ type: 'text', text: prefix } as any);
    }

    return {
      ...message,
      content: nextContent as any,
    };
  }

  return {
    ...message,
    content: prefix,
  };
}

export function resolvePreferredModelProvider(
  messages: ChatMessage[],
  selectedModelCookie: string | undefined,
  selectedProviderCookie: string | undefined,
): ResolvedModelProvider {
  let taggedModel: string | undefined;
  let taggedProvider: string | undefined;
  let fallbackMessageSelection: { model: string; provider: string } | undefined;

  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];

    if (message.role !== 'user') {
      continue;
    }

    const text = getMessageTextContent(message);
    const extracted = extractPropertiesFromMessage(message);

    if (!fallbackMessageSelection) {
      fallbackMessageSelection = {
        model: extracted.model,
        provider: extracted.provider,
      };
    }

    if (!taggedModel && MODEL_REGEX.test(text)) {
      taggedModel = extracted.model;
    }

    if (!taggedProvider && PROVIDER_REGEX.test(text)) {
      taggedProvider = extracted.provider;
    }

    if (taggedModel && taggedProvider) {
      break;
    }
  }

  return {
    model: taggedModel || selectedModelCookie || fallbackMessageSelection?.model || DEFAULT_MODEL,
    provider: taggedProvider || selectedProviderCookie || fallbackMessageSelection?.provider || DEFAULT_PROVIDER.name,
  };
}

export function sanitizeSelectionWithApiKeys(options: {
  selection: ResolvedModelProvider;
  apiKeys?: Record<string, string>;
  selectedProviderCookie?: string;
  providerPriority?: string[];
  includeLocalProviders?: boolean;
}): ResolvedModelProvider {
  const {
    selection,
    apiKeys,
    selectedProviderCookie,
    providerPriority = DEFAULT_PROVIDER_PRIORITY,
    includeLocalProviders = false,
  } = options;

  if (hasUsableProviderCredential(selection.provider, apiKeys)) {
    return selection;
  }

  const candidateProviders = [
    selectedProviderCookie,
    ...providerPriority,
    DEFAULT_PROVIDER.name,
    ...Object.keys(apiKeys || {}),
    ...(includeLocalProviders ? Array.from(LOCAL_PROVIDER_NAMES.values()) : []),
  ].filter((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0);

  const uniqueCandidates = Array.from(new Set(candidateProviders));
  const fallbackProvider = uniqueCandidates.find((candidate) => hasUsableProviderCredential(candidate, apiKeys));

  if (!fallbackProvider) {
    return selection;
  }

  return {
    ...selection,
    provider: fallbackProvider,
  };
}

export function ensureLatestUserMessageSelectionEnvelope(
  messages: ChatMessage[],
  selection: ResolvedModelProvider,
): void {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];

    if (message.role !== 'user') {
      continue;
    }

    const text = getMessageTextContent(message);
    const hasModelTag = MODEL_REGEX.test(text);
    const hasProviderTag = PROVIDER_REGEX.test(text);

    if (hasModelTag && hasProviderTag) {
      return;
    }

    messages[index] = injectModelProviderEnvelope(message, selection);

    return;
  }
}
