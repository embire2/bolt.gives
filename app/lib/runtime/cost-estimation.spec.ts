import { describe, expect, it } from 'vitest';
import { estimateCostUSD, formatCostUSD, normalizeUsageEvent } from './cost-estimation';

describe('cost-estimation', () => {
  it('normalizes usage when totalTokens is missing', () => {
    const usage = normalizeUsageEvent({
      promptTokens: 1000,
      completionTokens: 500,
    });

    expect(usage?.totalTokens).toBe(1500);
    expect(usage?.promptTokens).toBe(1000);
    expect(usage?.completionTokens).toBe(500);
  });

  it('normalizes usage aliases from providers that return input/output tokens', () => {
    const usage = normalizeUsageEvent({
      inputTokens: 1500,
      outputTokens: 250,
    });

    expect(usage?.promptTokens).toBe(1500);
    expect(usage?.completionTokens).toBe(250);
    expect(usage?.totalTokens).toBe(1750);
  });

  it('returns a non-zero estimate for valid token usage', () => {
    const cost = estimateCostUSD({
      providerName: 'OpenAI',
      modelName: 'gpt-4o',
      usage: {
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
      },
    });

    expect(cost).toBeGreaterThan(0);
  });

  it('formats very small non-zero values without collapsing to 0.0000', () => {
    const formatted = formatCostUSD(0.000005);
    expect(formatted).toBe('$0.000005');
  });
});
