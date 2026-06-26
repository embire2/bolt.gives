import { FREE_HOSTED_MODEL, FREE_PROVIDER_NAME } from '~/lib/modules/llm/free-provider-config';
import { estimateCostUSD } from '~/lib/runtime/cost-estimation';
import { normalizeUsage, type UsageLike } from '~/lib/runtime/usage';
import { parseCookies } from '~/lib/api/cookies';
import { normalizeCredential, normalizeHttpUrl } from '~/lib/runtime/credentials';
import { getHostedFreeRelaySecret, HOSTED_FREE_RELAY_SECRET_HEADER } from './hosted-free-relay';

const DEFAULT_RUNTIME_CONTROL_BASE_URL = 'http://127.0.0.1:4321/runtime';
const DEFAULT_FREE_DAILY_LIMIT_USD = 1;
const FREE_QUOTA_RESET_LABEL = '00:00 GMT+2';
const FREE_QUOTA_ERROR_CODE = 'FREE_PROVIDER_DAILY_LIMIT_EXCEEDED';

type RuntimeEnv = Record<string, string | undefined>;

interface FreeUsageQuotaDecision {
  allowed: boolean;
  usedUsd: number;
  remainingUsd: number;
  limitUsd: number;
  resetAt: string;
  resetTimezone: string;
  message?: string | null;
}

interface FreeUsageQuotaCheckResponse {
  ok?: boolean;
  quota?: FreeUsageQuotaDecision;
}

interface FreeUsageQuotaRecordResponse {
  ok?: boolean;
  quota?: FreeUsageQuotaDecision;
}

export class FreeUsageQuotaExceededError extends Error {
  code = FREE_QUOTA_ERROR_CODE;
  statusCode = 429;
  provider = FREE_PROVIDER_NAME;
  isRetryable = false;

  constructor(message = buildFreeUsageQuotaLimitMessage()) {
    super(`${FREE_QUOTA_ERROR_CODE}: ${message}`);
    this.name = 'FreeUsageQuotaExceededError';
  }
}

export function buildFreeUsageQuotaLimitMessage() {
  return `You have hit your FREE daily coding limit for today. You can use your own API key from any provider or wait for the limit to reset at ${FREE_QUOTA_RESET_LABEL}.`;
}

function getRuntimeControlBaseUrl(runtimeEnv: RuntimeEnv = {}) {
  return (
    normalizeHttpUrl(runtimeEnv.BOLT_RUNTIME_CONTROL_PUBLIC_URL) ||
    normalizeHttpUrl(runtimeEnv.BOLT_RUNTIME_CONTROL_URL) ||
    DEFAULT_RUNTIME_CONTROL_BASE_URL
  ).replace(/\/$/, '');
}

function getFreeUsageQuotaSecret(runtimeEnv: RuntimeEnv = {}) {
  return (
    normalizeCredential(runtimeEnv.BOLT_FREE_USAGE_QUOTA_SECRET) ||
    normalizeCredential(runtimeEnv.FREE_USAGE_QUOTA_SECRET) ||
    getHostedFreeRelaySecret(runtimeEnv as Record<string, string>)
  );
}

function firstHeaderValue(value: string | null) {
  return String(value || '')
    .split(',')[0]
    ?.trim();
}

function getFreeUsageQuotaSubjectBasis(request: Request) {
  const cookies = parseCookies(request.headers.get('Cookie'));
  const sessionCookie =
    cookies.bolt_tenant_session ||
    cookies.bolt_managed_instance ||
    cookies.bolt_free_subject ||
    cookies.csrf_token ||
    '';
  const forwardedHost = request.headers.get('X-Bolt-Forwarded-Host') || request.headers.get('Host') || '';
  const connectingIp =
    request.headers.get('CF-Connecting-IP') ||
    firstHeaderValue(request.headers.get('X-Forwarded-For')) ||
    request.headers.get('X-Real-IP') ||
    '';
  const userAgent = request.headers.get('User-Agent') || '';
  const acceptLanguage = request.headers.get('Accept-Language') || '';

  return JSON.stringify({
    sessionCookie,
    forwardedHost,
    connectingIp,
    userAgent,
    acceptLanguage,
  });
}

async function sha256Hex(input: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function buildFreeUsageQuotaSubjectHash(options: { request: Request; runtimeEnv?: RuntimeEnv }) {
  const secret =
    getFreeUsageQuotaSecret(options.runtimeEnv) ||
    normalizeCredential(options.runtimeEnv?.FREE_OPENROUTER_API_KEY) ||
    'bolt-free-usage-quota';
  return sha256Hex(`${secret}:${getFreeUsageQuotaSubjectBasis(options.request)}`);
}

function normalizeDailyLimit(runtimeEnv: RuntimeEnv = {}) {
  const configuredLimit = Number(runtimeEnv.BOLT_FREE_DAILY_USD_LIMIT || runtimeEnv.FREE_DAILY_USD_LIMIT);
  return Number.isFinite(configuredLimit) && configuredLimit > 0 ? configuredLimit : DEFAULT_FREE_DAILY_LIMIT_USD;
}

function buildQuotaRuntimeUrl(runtimeEnv: RuntimeEnv, pathname: string) {
  return `${getRuntimeControlBaseUrl(runtimeEnv)}${pathname}`;
}

async function fetchFreeUsageQuota<T>(options: {
  runtimeEnv: RuntimeEnv;
  pathname: string;
  body: Record<string, unknown>;
}) {
  const secret = getFreeUsageQuotaSecret(options.runtimeEnv);

  if (!secret) {
    throw new Error('FREE_PROVIDER_DAILY_LIMIT_UNAVAILABLE: Hosted FREE quota secret is not configured.');
  }

  const response = await fetch(buildQuotaRuntimeUrl(options.runtimeEnv, options.pathname), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [HOSTED_FREE_RELAY_SECRET_HEADER]: secret,
    },
    body: JSON.stringify(options.body),
  });
  const payload = (await response.json().catch(() => null)) as T | null;

  if (!response.ok) {
    const maybeMessage =
      payload && typeof payload === 'object' && 'message' in payload
        ? String((payload as { message?: unknown }).message || '')
        : '';

    if (response.status === 429 || maybeMessage.includes(FREE_QUOTA_ERROR_CODE)) {
      throw new FreeUsageQuotaExceededError(maybeMessage || buildFreeUsageQuotaLimitMessage());
    }

    throw new Error(maybeMessage || `FREE_PROVIDER_DAILY_LIMIT_UNAVAILABLE: quota service returned ${response.status}`);
  }

  return payload;
}

export async function assertFreeUsageQuotaAllowed(options: {
  request: Request;
  runtimeEnv?: RuntimeEnv;
  providerName?: string;
}) {
  if (options.providerName !== FREE_PROVIDER_NAME) {
    return null;
  }

  const runtimeEnv = options.runtimeEnv || {};
  const subjectHash = await buildFreeUsageQuotaSubjectHash({
    request: options.request,
    runtimeEnv,
  });
  const payload = await fetchFreeUsageQuota<FreeUsageQuotaCheckResponse>({
    runtimeEnv,
    pathname: '/internal/free-usage-quota/check',
    body: {
      subjectHash,
      limitUsd: normalizeDailyLimit(runtimeEnv),
    },
  });
  const quota = payload?.quota;

  if (quota && quota.allowed === false) {
    throw new FreeUsageQuotaExceededError(quota.message || buildFreeUsageQuotaLimitMessage());
  }

  return quota || null;
}

function estimateFreeUsageCostUsd(usage: UsageLike | null | undefined) {
  const normalizedUsage = normalizeUsage(usage);

  if (!normalizedUsage) {
    return 0;
  }

  return estimateCostUSD({
    providerName: FREE_PROVIDER_NAME,
    modelName: FREE_HOSTED_MODEL,
    usage: normalizedUsage,
  });
}

export async function recordFreeUsageQuotaForRequest(options: {
  request: Request;
  runtimeEnv?: RuntimeEnv;
  providerName?: string;
  modelName?: string;
  usage?: UsageLike | null;
  runId?: string;
}) {
  if (options.providerName !== FREE_PROVIDER_NAME) {
    return null;
  }

  const runtimeEnv = options.runtimeEnv || {};
  const costUsd = estimateFreeUsageCostUsd(options.usage);

  if (!Number.isFinite(costUsd) || costUsd <= 0) {
    return null;
  }

  const subjectHash = await buildFreeUsageQuotaSubjectHash({
    request: options.request,
    runtimeEnv,
  });
  const normalizedUsage = normalizeUsage(options.usage);
  const payload = await fetchFreeUsageQuota<FreeUsageQuotaRecordResponse>({
    runtimeEnv,
    pathname: '/internal/free-usage-quota/record',
    body: {
      subjectHash,
      costUsd,
      limitUsd: normalizeDailyLimit(runtimeEnv),
      providerName: options.providerName,
      modelName: options.modelName || FREE_HOSTED_MODEL,
      usage: normalizedUsage,
      runId: options.runId || null,
    },
  });

  return payload?.quota || null;
}

export function getFreeUsageQuotaErrorCode() {
  return FREE_QUOTA_ERROR_CODE;
}
