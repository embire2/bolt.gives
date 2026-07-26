import { describe, expect, it } from 'vitest';
import { addUsageTotals, normalizeUsage } from './usage';

describe('normalizeUsage', () => {
  it('normalizes canonical prompt/completion token keys', () => {
    const usage = normalizeUsage({
      promptTokens: 120,
      completionTokens: 30,
    });

    expect(usage).toEqual({
      promptTokens: 120,
      completionTokens: 30,
      totalTokens: 150,
    });
  });

  it('normalizes input/output token aliases', () => {
    const usage = normalizeUsage({
      inputTokens: 210,
      outputTokens: 45,
    });

    expect(usage).toEqual({
      promptTokens: 210,
      completionTokens: 45,
      totalTokens: 255,
    });
  });

  it('uses provided total tokens when greater than inferred sum', () => {
    const usage = normalizeUsage({
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 200,
    });

    expect(usage).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 200,
    });
  });

  it('returns null for empty usage', () => {
    expect(normalizeUsage({})).toBeNull();
  });
});

describe('addUsageTotals', () => {
  it('accumulates normalized usage', () => {
    const totals = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };

    addUsageTotals(totals, { inputTokens: 20, outputTokens: 5 });
    addUsageTotals(totals, { promptTokens: 7, completionTokens: 3, totalTokens: 10 });

    expect(totals).toEqual({
      promptTokens: 27,
      completionTokens: 8,
      totalTokens: 35,
    });
  });
});
