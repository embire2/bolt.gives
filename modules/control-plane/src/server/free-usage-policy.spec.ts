import { describe, expect, it } from 'vitest';
import {
  buildFreeUsageQuotaDecision,
  calculateFreeAgentTokenCharge,
  normalizeFreeUsageQuotaLedger,
} from './free-usage-policy.mjs';

describe('20-credit FREE policy', () => {
  it('charges actual fractional generation minutes, not provider token volume', () => {
    expect(calculateFreeAgentTokenCharge({ activeDurationMs: 30_000, providerTokens: 50_000 })).toBe(0.5);
    expect(calculateFreeAgentTokenCharge({ activeDurationMs: 0, providerTokens: 50_000 })).toBe(0);
    expect(calculateFreeAgentTokenCharge({ activeDurationMs: 60_000, providerTokens: 0 })).toBe(0);
    expect(calculateFreeAgentTokenCharge({ activeDurationMs: 1_200_000, providerTokens: 50_000 })).toBe(20);
  });
  it('converts prior time-calibrated usage once without resetting the used time', () => {
    const subject = 'a'.repeat(64);
    const old = { version: 2, days: { '2026-09-20': { [subject]: { agentTokens: 50 } } } };
    const converted = normalizeFreeUsageQuotaLedger(old);
    expect(converted.version).toBe(3);
    expect(converted.days['2026-09-20'][subject].agentTokens).toBe(15);
    expect(normalizeFreeUsageQuotaLedger(converted)).toEqual(converted);
    expect(buildFreeUsageQuotaDecision(converted.days['2026-09-20'][subject], { tokenLimit: 20 }).remainingTokens).toBe(
      5,
    );
  });
  it('blocks exactly at 20 and never reports a negative balance', () => {
    expect(buildFreeUsageQuotaDecision({ agentTokens: 19.99 }, { tokenLimit: 20 }).allowed).toBe(true);
    expect(buildFreeUsageQuotaDecision({ agentTokens: 20 }, { tokenLimit: 20 }).allowed).toBe(false);
    expect(buildFreeUsageQuotaDecision({ agentTokens: 25 }, { tokenLimit: 20 }).remainingTokens).toBe(0);
  });
});
