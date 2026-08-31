const LONG_THINK_MODEL_RE = /\b(gpt-5|codex|o1|o3)\b/i;
const HOSTED_FREE_STREAM_TIMEOUT_MS = 120000;
const HOSTED_FREE_STREAM_MAX_DURATION_MS = 300000;
const LONG_THINK_STREAM_TIMEOUT_MS = 300000;
const DEFAULT_STREAM_TIMEOUT_MS = 180000;

export function isLongThinkModel(model?: string) {
  return LONG_THINK_MODEL_RE.test(model || '');
}

export function resolveDefaultStreamTimeoutMs(provider?: string, model?: string) {
  if (provider?.trim().toUpperCase() === 'FREE') {
    return HOSTED_FREE_STREAM_TIMEOUT_MS;
  }

  return isLongThinkModel(model) ? LONG_THINK_STREAM_TIMEOUT_MS : DEFAULT_STREAM_TIMEOUT_MS;
}

export function shouldTrackCommentaryRunActivity(options?: { trackRunActivity?: boolean }) {
  return options?.trackRunActivity !== false;
}

export function shouldTrackModelStreamChunkActivity(chunk?: { type?: string }) {
  return Boolean(chunk?.type && chunk.type !== 'reasoning');
}

export function resolveStreamMaxDurationMs(provider?: string, configuredMaxDuration?: unknown) {
  if (provider?.trim().toUpperCase() !== 'FREE') {
    return undefined;
  }

  const parsedMaxDuration = Number(configuredMaxDuration);

  return Number.isFinite(parsedMaxDuration) && parsedMaxDuration >= 10_000
    ? parsedMaxDuration
    : HOSTED_FREE_STREAM_MAX_DURATION_MS;
}
