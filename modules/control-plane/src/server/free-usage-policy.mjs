const FREE_USAGE_DAILY_TOKEN_LIMIT = Number(process.env.BOLT_FREE_DAILY_TOKEN_LIMIT || '20');
const FREE_USAGE_DAILY_LIMIT_USD = Number(process.env.BOLT_FREE_DAILY_USD_LIMIT || '1');

export function getFreeUsageQuotaDayKey(now = new Date()) {
  return new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function getFreeUsageQuotaResetAt(now = new Date()) {
  const shifted = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const nextLocalMidnight = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  );

  return new Date(nextLocalMidnight - 2 * 60 * 60 * 1000).toISOString();
}

function normalizeFreeUsageLimitUsd(value = FREE_USAGE_DAILY_LIMIT_USD) {
  const limit = Number(value);
  return Number.isFinite(limit) && limit > 0 ? limit : 1;
}

function normalizeFreeUsageTokenLimit(value = FREE_USAGE_DAILY_TOKEN_LIMIT) {
  const limit = Number(value);
  return Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 20;
}

export function normalizeFreeUsageCostUsd(value) {
  const cost = Number(value);
  return Number.isFinite(cost) && cost > 0 ? cost : 0;
}

export function normalizeFreeUsageTokens(value) {
  const tokens = Number(value);
  return Number.isFinite(tokens) && tokens > 0 ? tokens : 0;
}

const FREE_AGENT_TOKEN_WINDOW_MS = 20 * 60 * 1000;

export function calculateFreeAgentTokenCharge({ activeDurationMs, providerTokens } = {}) {
  const rawProviderTokens = normalizeFreeUsageTokens(providerTokens);
  const durationMs = Number(activeDurationMs);

  if (Number.isFinite(durationMs) && durationMs >= 0) {
    return Math.min(
      rawProviderTokens,
      (Math.min(durationMs, FREE_AGENT_TOKEN_WINDOW_MS) * 20) / FREE_AGENT_TOKEN_WINDOW_MS,
    );
  }

  /*
   * Older clients do not report duration. Normalize their provider usage instead of
   * allowing one normal generation to consume the full daily Agent allowance.
   */
  return Math.min(rawProviderTokens, rawProviderTokens * 0.0003);
}

export function normalizeFreeUsageQuotaLedger(input) {
  /** @type {Record<string, Record<string, any>>} */
  const days = {};

  if (!input || typeof input !== 'object' || !input.days || typeof input.days !== 'object') {
    return { version: 3, days };
  }

  for (const [dayKey, rawSubjects] of Object.entries(input.days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey) || !rawSubjects || typeof rawSubjects !== 'object') {
      continue;
    }

    const subjects = {};

    for (const [subjectHash, rawEntry] of Object.entries(rawSubjects)) {
      if (!/^[a-f0-9]{64}$/i.test(subjectHash) || !rawEntry || typeof rawEntry !== 'object') {
        continue;
      }

      subjects[subjectHash] = {
        costUsd: normalizeFreeUsageCostUsd(rawEntry.costUsd),
        requests: Math.max(0, Math.floor(Number(rawEntry.requests) || 0)),
        promptTokens: normalizeFreeUsageTokens(rawEntry.promptTokens),
        completionTokens: normalizeFreeUsageTokens(rawEntry.completionTokens),
        totalTokens: normalizeFreeUsageTokens(rawEntry.totalTokens),
        agentTokens:
          rawEntry.agentTokens === undefined
            ? normalizeFreeUsageTokens(rawEntry.totalTokens) * 0.0003
            : normalizeFreeUsageTokens(rawEntry.agentTokens) * (Number(input.version) >= 3 ? 1 : 0.3),
        runIds: Array.isArray(rawEntry.runIds)
          ? rawEntry.runIds.filter((id) => typeof id === 'string').slice(-512)
          : [],
        updatedAt: typeof rawEntry.updatedAt === 'string' ? rawEntry.updatedAt : null,
      };
    }

    days[dayKey] = subjects;
  }

  return { version: 3, days };
}

export function buildFreeUsageQuotaDecision(entry = {}, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const tokenLimit = normalizeFreeUsageTokenLimit(options.tokenLimit);
  const usedTokens = normalizeFreeUsageTokens(entry?.agentTokens);
  const remainingTokens = Math.max(0, tokenLimit - usedTokens);
  const limitUsd = normalizeFreeUsageLimitUsd(options.limitUsd);
  const usedUsd = normalizeFreeUsageCostUsd(entry?.costUsd);
  const remainingUsd = Math.max(0, limitUsd - usedUsd);
  const allowed = usedTokens < tokenLimit;
  const message = allowed
    ? null
    : `The hosted FREE service has been paused because you have used all ${tokenLimit} API credits for today. Upgrade to Custom Domain for the $5/month launch price, use your own API key, or wait for your balance to reset at 00:00 GMT+2.`;

  return {
    allowed,
    usedTokens,
    remainingTokens,
    tokenLimit,
    usedUsd,
    remainingUsd,
    limitUsd,
    resetAt: getFreeUsageQuotaResetAt(now),
    resetTimezone: 'GMT+2',
    message,
  };
}
