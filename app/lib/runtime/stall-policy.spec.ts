import { describe, expect, it } from 'vitest';
import { getRemainingHostedFreeDeadlineMs, hasExceededHostedFreeDeadline, resolveStallPolicy } from './stall-policy';

describe('resolveStallPolicy', () => {
  it('returns long-think thresholds for gpt-5/codex models', () => {
    const policy = resolveStallPolicy('gpt-5.2-codex');

    expect(policy.warningThresholdMs).toBeGreaterThan(45000);
    expect(policy.recoveryThresholdMs).toBeGreaterThan(policy.warningThresholdMs);
    expect(policy.starterContinuationThresholdMs).toBeGreaterThan(25000);
  });

  it('returns default thresholds for standard models', () => {
    const policy = resolveStallPolicy('gpt-4o');

    expect(policy.warningThresholdMs).toBe(45000);
    expect(policy.recoveryThresholdMs).toBe(60000);
    expect(policy.starterContinuationThresholdMs).toBe(25000);
  });

  it('keeps hosted FREE recovery bounded even when its model matches long-think names', () => {
    const policy = resolveStallPolicy('gpt-5.6', 'FREE');

    expect(policy.warningThresholdMs).toBe(45000);
    expect(policy.recoveryThresholdMs).toBe(120000);
    expect(policy.starterContinuationThresholdMs).toBe(25000);
  });

  it('enforces an absolute deadline only for hosted FREE runs', () => {
    expect(hasExceededHostedFreeDeadline({ providerName: 'FREE', elapsedMs: 30_000, maxDurationMs: 30_000 })).toBe(
      true,
    );
    expect(hasExceededHostedFreeDeadline({ providerName: 'OpenAI', elapsedMs: 300_000, maxDurationMs: 30_000 })).toBe(
      false,
    );
  });

  it('arms a one-shot deadline for only the remaining request lifetime', () => {
    expect(getRemainingHostedFreeDeadlineMs({ requestStartedAtMs: 10_000, nowMs: 25_000, maxDurationMs: 30_000 })).toBe(
      15_000,
    );
    expect(getRemainingHostedFreeDeadlineMs({ requestStartedAtMs: 10_000, nowMs: 45_000, maxDurationMs: 30_000 })).toBe(
      0,
    );
  });
});
