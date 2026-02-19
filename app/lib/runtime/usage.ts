export interface UsageLike {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
}

export interface NormalizedUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

function toNonNegativeNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);

    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return 0;
}

function getFirstNumber(source: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const value = toNonNegativeNumber(source[key]);

    if (value > 0) {
      return value;
    }
  }

  return 0;
}

export function normalizeUsage(usage: UsageLike | null | undefined): NormalizedUsage | null {
  if (!usage || typeof usage !== 'object') {
    return null;
  }

  const usageRecord = usage as unknown as Record<string, unknown>;
  const promptTokens = getFirstNumber(usageRecord, ['promptTokens', 'inputTokens', 'prompt_tokens', 'input_tokens']);
  const completionTokens = getFirstNumber(usageRecord, [
    'completionTokens',
    'outputTokens',
    'completion_tokens',
    'output_tokens',
  ]);
  const providedTotal = getFirstNumber(usageRecord, ['totalTokens', 'total_tokens']);
  const inferredTotal = promptTokens + completionTokens;
  const totalTokens = Math.max(providedTotal, inferredTotal);

  if (promptTokens === 0 && completionTokens === 0 && totalTokens === 0) {
    return null;
  }

  return {
    promptTokens,
    completionTokens,
    totalTokens,
  };
}

export function addUsageTotals(target: NormalizedUsage, usage: UsageLike | null | undefined): NormalizedUsage {
  const normalized = normalizeUsage(usage);

  if (!normalized) {
    return target;
  }

  target.promptTokens += normalized.promptTokens;
  target.completionTokens += normalized.completionTokens;
  target.totalTokens += normalized.totalTokens;

  return target;
}
