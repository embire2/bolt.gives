import {
  FREE_HOSTED_MODEL,
  FREE_PROVIDER_NAME,
  clearHostedFreeModelResolution,
} from '~/lib/modules/llm/providers/free';
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
  clearHostedFreeModelResolution();
}

async function probeHostedModel(options: { apiKey: string; modelName: string }) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.modelName,
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

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }

  return {
    ok: response.ok,
    status: response.status,
    message: getErrorMessage(payload),
  };
}

function isRateLimited(status: number, message: string): boolean {
  return status === 429 || /rate[-\s]*limit/i.test(message);
}

export async function ensureFreeProviderAvailability(options: {
  providerName: string;
  modelName: string;
  apiKey?: string;
}) {
  if (options.providerName !== FREE_PROVIDER_NAME || options.modelName !== FREE_HOSTED_MODEL) {
    return {
      resolvedModelName: options.modelName,
      usedFallback: false,
    };
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

    return {
      resolvedModelName: FREE_HOSTED_MODEL,
      usedFallback: false,
    };
  }

  const hostedProbe = await probeHostedModel({
    apiKey,
    modelName: FREE_HOSTED_MODEL,
  });

  if (hostedProbe.ok) {
    cachedResult = {
      ok: true,
      expiresAt: now + SUCCESS_TTL_MS,
      fingerprint,
    };

    return {
      resolvedModelName: FREE_HOSTED_MODEL,
      usedFallback: false,
    };
  }

  clearHostedFreeModelResolution();

  const upstreamRateLimited = isRateLimited(hostedProbe.status, hostedProbe.message);
  const errorMessage = upstreamRateLimited
    ? `FREE_PROVIDER_RATE_LIMITED: ${FREE_HOSTED_MODEL}(${hostedProbe.message})`
    : `FREE_PROVIDER_UNAVAILABLE: ${FREE_HOSTED_MODEL}(${hostedProbe.message})`;

  cachedResult = {
    ok: false,
    expiresAt: now + (upstreamRateLimited ? RATE_LIMIT_TTL_MS : SUCCESS_TTL_MS),
    fingerprint,
    message: errorMessage,
  };

  throw new Error(errorMessage);
}
