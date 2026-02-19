import type { UsageDataEvent } from '~/types/context';

interface UsageLike {
  completionTokens?: number;
  promptTokens?: number;
  totalTokens?: number;
}

interface CostEstimationOptions {
  providerName?: string;
  modelName?: string;
  usage?: UsageLike | null;
}

function normalizeTokenCount(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 0;
  }

  return value;
}

function resolveRatesPerMillion(providerName?: string, modelName?: string): { prompt: number; completion: number } {
  const normalizedProvider = (providerName || '').toLowerCase();
  const normalizedModel = (modelName || '').toLowerCase();

  if (normalizedProvider === 'openai') {
    if (normalizedModel.includes('gpt-5')) {
      return { prompt: 1.25, completion: 10 };
    }

    if (normalizedModel.includes('gpt-4o-mini')) {
      return { prompt: 0.15, completion: 0.6 };
    }

    if (normalizedModel.includes('gpt-4o')) {
      return { prompt: 5, completion: 15 };
    }

    return { prompt: 3, completion: 9 };
  }

  if (normalizedProvider === 'anthropic') {
    if (normalizedModel.includes('haiku')) {
      return { prompt: 0.25, completion: 1.25 };
    }

    return { prompt: 3, completion: 15 };
  }

  if (normalizedProvider === 'google') {
    return { prompt: 1, completion: 3 };
  }

  if (normalizedProvider === 'openrouter') {
    return { prompt: 2, completion: 8 };
  }

  return { prompt: 2, completion: 8 };
}

export function normalizeUsageEvent(usage: UsageLike | null | undefined): UsageDataEvent | null {
  if (!usage) {
    return null;
  }

  const promptTokens = normalizeTokenCount(usage.promptTokens);
  const completionTokens = normalizeTokenCount(usage.completionTokens);
  const providedTotal = normalizeTokenCount(usage.totalTokens);
  const totalTokens = providedTotal > 0 ? providedTotal : promptTokens + completionTokens;

  if (totalTokens === 0 && promptTokens === 0 && completionTokens === 0) {
    return null;
  }

  return {
    type: 'usage',
    promptTokens,
    completionTokens,
    totalTokens,
    timestamp: new Date().toISOString(),
  };
}

export function estimateCostUSD(options: CostEstimationOptions): number {
  const usage = normalizeUsageEvent(options.usage);

  if (!usage) {
    return 0;
  }

  const ratesPerMillion = resolveRatesPerMillion(options.providerName, options.modelName);
  const promptCost = (usage.promptTokens / 1_000_000) * ratesPerMillion.prompt;
  const completionCost = (usage.completionTokens / 1_000_000) * ratesPerMillion.completion;

  return promptCost + completionCost;
}

export function formatCostUSD(cost: number): string {
  if (!Number.isFinite(cost) || cost <= 0) {
    return '$0.000000';
  }

  if (cost < 0.000001) {
    return '<$0.000001';
  }

  if (cost < 0.01) {
    return `$${cost.toFixed(6)}`;
  }

  if (cost < 1) {
    return `$${cost.toFixed(4)}`;
  }

  return `$${cost.toFixed(2)}`;
}
