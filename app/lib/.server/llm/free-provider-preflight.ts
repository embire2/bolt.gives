import { FREE_HOSTED_MODEL, FREE_PROVIDER_NAME } from '~/lib/modules/llm/providers/free';
import { normalizeCredential } from '~/lib/runtime/credentials';

type FreeProviderPreflightResult = {
  ok: boolean;
  expiresAt: number;
  fingerprint: string;
  message?: string;
};

let cachedResult: FreeProviderPreflightResult | null = null;

const SUCCESS_TTL_MS = 60_000;
const RATE_LIMIT_TTL_MS = 30_000;
const REQUEST_TIMEOUT_MS = 10_000;

function fingerprintToken(token: string): string {
  return `${token.slice(0, 6)}:${token.length}`;
}

function getErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return 'Unknown upstream error';
  }

  const error = (payload as { error?: { message?: string } }).error;

  if (error?.message) {
    return error.message;
  }

  return 'Unknown upstream error';
}

export function resetFreeProviderPreflightCache() {
  cachedResult = null;
}

export async function ensureFreeProviderAvailability(options: {
  providerName: string;
  modelName: string;
  apiKey?: string;
}) {
  if (options.providerName !== FREE_PROVIDER_NAME || options.modelName !== FREE_HOSTED_MODEL) {
    return;
  }

  const apiKey = normalizeCredential(options.apiKey);

  if (!apiKey) {
    throw new Error(`Missing API key for ${FREE_PROVIDER_NAME} provider`);
  }

  const fingerprint = fingerprintToken(apiKey);
  const now = Date.now();

  if (cachedResult && cachedResult.fingerprint === fingerprint && cachedResult.expiresAt > now) {
    if (!cachedResult.ok) {
      throw new Error(cachedResult.message || 'FREE_PROVIDER_RATE_LIMITED');
    }

    return;
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: FREE_HOSTED_MODEL,
      stream: false,
      max_tokens: 1,
      messages: [
        {
          role: 'user',
          content: 'Reply with OK',
        },
      ],
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (response.ok) {
    cachedResult = {
      ok: true,
      expiresAt: now + SUCCESS_TTL_MS,
      fingerprint,
    };

    return;
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }

  const upstreamMessage = getErrorMessage(payload);
  const isRateLimited = response.status === 429 || /rate[-\s]*limit/i.test(upstreamMessage);
  const errorMessage = isRateLimited
    ? `FREE_PROVIDER_RATE_LIMITED: ${upstreamMessage}`
    : `FREE_PROVIDER_UNAVAILABLE: ${upstreamMessage}`;

  cachedResult = {
    ok: false,
    expiresAt: now + (isRateLimited ? RATE_LIMIT_TTL_MS : SUCCESS_TTL_MS),
    fingerprint,
    message: errorMessage,
  };

  throw new Error(errorMessage);
}
