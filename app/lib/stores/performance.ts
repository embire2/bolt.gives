import { atom } from 'nanostores';

export interface TokenUsageSnapshot {
  completionTokens: number;
  promptTokens: number;
  totalTokens: number;
  lastUpdatedAt?: string;
}

export const tokenUsageStore = atom<TokenUsageSnapshot>({
  completionTokens: 0,
  promptTokens: 0,
  totalTokens: 0,
});

export function recordTokenUsage(usage: { completionTokens?: number; promptTokens?: number; totalTokens?: number }) {
  const current = tokenUsageStore.get();

  tokenUsageStore.set({
    completionTokens: current.completionTokens + (usage.completionTokens || 0),
    promptTokens: current.promptTokens + (usage.promptTokens || 0),
    totalTokens: current.totalTokens + (usage.totalTokens || 0),
    lastUpdatedAt: new Date().toISOString(),
  });
}
