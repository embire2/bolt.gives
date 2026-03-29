import type { UsageDataEvent } from '~/types/context';
import { normalizeUsage } from '~/lib/runtime/usage';

interface UsageLike {
  completionTokens?: number;
  promptTokens?: number;
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
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
  const normalizedProvider = (providerName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedModel = (modelName || '').toLowerCase();

  if (normalizedProvider === 'openai' || normalizedProvider === 'azureopenai' || normalizedProvider === 'github') {
    if (normalizedModel.includes('gpt-5.2-codex') || normalizedModel.includes('gpt-5.1-codex')) {
      return { prompt: 1.25, completion: 10 };
    }

    if (normalizedModel.includes('gpt-5-codex') || normalizedModel.includes('codex')) {
      return { prompt: 1.25, completion: 10 };
    }

    if (normalizedModel.includes('gpt-5-mini')) {
      return { prompt: 0.25, completion: 2 };
    }

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

  if (normalizedProvider === 'anthropic' || normalizedProvider === 'amazonbedrock') {
    if (normalizedModel.includes('haiku')) {
      return { prompt: 0.25, completion: 1.25 };
    }

    if (normalizedModel.includes('sonnet')) {
      return { prompt: 3, completion: 15 };
    }

    return { prompt: 3, completion: 15 };
  }

  if (normalizedProvider === 'google' || normalizedProvider === 'vertexai') {
    if (normalizedModel.includes('flash')) {
      return { prompt: 0.3, completion: 0.8 };
    }

    return { prompt: 1, completion: 3 };
  }

  if (normalizedProvider === 'openrouter' || normalizedProvider === 'together' || normalizedProvider === 'perplexity') {
    return { prompt: 2, completion: 8 };
  }

  return { prompt: 2, completion: 8 };
}

export function normalizeUsageEvent(usage: UsageLike | null | undefined): UsageDataEvent | null {
  const normalizedUsage = normalizeUsage(usage);

  if (!normalizedUsage) {
    return null;
  }

  return {
    type: 'usage',
    promptTokens: normalizeTokenCount(normalizedUsage.promptTokens),
    completionTokens: normalizeTokenCount(normalizedUsage.completionTokens),
    totalTokens: normalizeTokenCount(normalizedUsage.totalTokens),
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

  if (promptCost === 0 && completionCost === 0 && usage.totalTokens > 0) {
    const blendedRate = (ratesPerMillion.prompt + ratesPerMillion.completion) / 2;
    return (usage.totalTokens / 1_000_000) * blendedRate;
  }

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
