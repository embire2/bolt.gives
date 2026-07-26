import { beforeEach, describe, expect, it } from 'vitest';
import { recordTokenUsage, tokenUsageStore } from './performance';

describe('performance store', () => {
  beforeEach(() => {
    tokenUsageStore.set({
      completionTokens: 0,
      promptTokens: 0,
      totalTokens: 0,
    });
  });

  it('accumulates token usage across multiple responses', () => {
    recordTokenUsage({
      completionTokens: 40,
      promptTokens: 60,
      totalTokens: 100,
    });
    recordTokenUsage({
      completionTokens: 10,
      promptTokens: 20,
      totalTokens: 30,
    });

    const snapshot = tokenUsageStore.get();
    expect(snapshot.completionTokens).toBe(50);
    expect(snapshot.promptTokens).toBe(80);
    expect(snapshot.totalTokens).toBe(130);
    expect(typeof snapshot.lastUpdatedAt).toBe('string');
  });
});
