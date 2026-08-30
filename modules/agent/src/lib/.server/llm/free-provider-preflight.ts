import { clearHostedFreeModelResolution, isHostedFreeClaudeModel } from '@bolt/agent/lib/modules/llm/providers/free';
import {
  FREE_HOSTED_API_BASE_URL,
  FREE_PROVIDER_NAME,
  resolveHostedFreeModel,
} from '@bolt/agent/lib/modules/llm/free-provider-config';
import { normalizeCredential } from '@bolt/core/lib/runtime/credentials';
import { createScopedLogger } from '@bolt/core/utils/logger';

type FreeProviderPreflightResult = {
  ok: boolean;
  expiresAt: number;
  fingerprint: string;
  modelName: string;
  message?: string;
};

let cachedResult: FreeProviderPreflightResult | null = null;
const logger = createScopedLogger('free-provider-preflight');

const SUCCESS_TTL_MS = 60_000;
const RATE_LIMIT_TTL_MS = 30_000;
const TRANSIENT_FAILURE_TTL_MS = 5_000;
const REQUEST_TIMEOUT_MS = 30_000;

function fingerprintToken(token: string): string {
  return `${token.slice(0, 6)}:${token.length}`;
}

function getErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return 'Unknown upstream error';
  }

  const candidate = payload as {
    error?: string | { message?: unknown };
    message?: unknown;
    detail?: unknown;
  };
  const error = candidate.error;

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  if (error && typeof error === 'object' && typeof error.message === 'string' && error.message.trim()) {
    return error.message;
  }

  for (const message of [candidate.message, candidate.detail]) {
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  return 'Unknown upstream error';
}

export function resetFreeProviderPreflightCache() {
  cachedResult = null;
  clearHostedFreeModelResolution();
}

async function probeHostedModel(options: { apiKey: string; modelName: string }) {
  const usesClaudeMessages = isHostedFreeClaudeModel(options.modelName);
  const response = await fetch(`${FREE_HOSTED_API_BASE_URL}/${usesClaudeMessages ? 'messages' : 'responses'}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
      ...(usesClaudeMessages ? { 'anthropic-version': '2023-06-01' } : {}),
    },
    body: JSON.stringify(
      usesClaudeMessages
        ? {
            model: options.modelName,
            max_tokens: 16,
            messages: [{ role: 'user', content: 'Reply with OK' }],
          }
        : {
            model: options.modelName,
            input: 'Reply with OK',
            max_output_tokens: 16,
          },
    ),
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

export function isHostedFreeCreditsExhausted(status: number | undefined, message: string): boolean {
  return (
    status === 402 ||
    /payment required|insufficient credits|credits? exhausted|out of (?:operator )?credits|wallet balance/i.test(
      message,
    )
  );
}

export async function ensureFreeProviderAvailability(options: {
  providerName: string;
  modelName: string;
  apiKey?: string;
}) {
  if (options.providerName !== FREE_PROVIDER_NAME) {
    return {
      resolvedModelName: options.modelName,
      usedFallback: false,
    };
  }

  const resolvedModelName = resolveHostedFreeModel(options.modelName);
  const usedFallback = resolvedModelName !== options.modelName;

  const apiKey = normalizeCredential(options.apiKey);

  if (!apiKey) {
    throw new Error(`Missing API key for ${FREE_PROVIDER_NAME} provider`);
  }

  const fingerprint = fingerprintToken(apiKey);
  const now = Date.now();

  if (
    cachedResult &&
    cachedResult.fingerprint === fingerprint &&
    cachedResult.modelName === resolvedModelName &&
    cachedResult.expiresAt > now
  ) {
    if (!cachedResult.ok) {
      throw new Error(cachedResult.message || 'FREE_PROVIDER_RATE_LIMITED');
    }

    return {
      resolvedModelName,
      usedFallback,
    };
  }

  const hostedProbe = await probeHostedModel({
    apiKey,
    modelName: resolvedModelName,
  });

  if (hostedProbe.ok) {
    logger.info(
      `FREE preflight available ${JSON.stringify({
        providerName: options.providerName,
        modelName: resolvedModelName,
        status: hostedProbe.status,
      })}`,
    );
    cachedResult = {
      ok: true,
      expiresAt: now + SUCCESS_TTL_MS,
      fingerprint,
      modelName: resolvedModelName,
    };

    return {
      resolvedModelName,
      usedFallback,
    };
  }

  clearHostedFreeModelResolution();

  const creditsExhausted = isHostedFreeCreditsExhausted(hostedProbe.status, hostedProbe.message);
  const upstreamRateLimited = isRateLimited(hostedProbe.status, hostedProbe.message);
  const errorMessage = creditsExhausted
    ? `FREE_PROVIDER_CREDITS_EXHAUSTED: ${resolvedModelName}(${hostedProbe.message})`
    : upstreamRateLimited
      ? `FREE_PROVIDER_RATE_LIMITED: ${resolvedModelName}(${hostedProbe.message})`
      : `FREE_PROVIDER_UNAVAILABLE: ${resolvedModelName}(${hostedProbe.message})`;

  logger.warn(
    `FREE preflight failed ${JSON.stringify({
      providerName: options.providerName,
      modelName: resolvedModelName,
      status: hostedProbe.status,
      errorMessage,
    })}`,
  );

  cachedResult = {
    ok: false,
    expiresAt:
      now + (creditsExhausted ? SUCCESS_TTL_MS : upstreamRateLimited ? RATE_LIMIT_TTL_MS : TRANSIENT_FAILURE_TTL_MS),
    fingerprint,
    modelName: resolvedModelName,
    message: errorMessage,
  };

  throw new Error(errorMessage);
}
