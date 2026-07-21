import { describe, expect, it } from 'vitest';
import { resolveStallPolicy } from './stall-policy';

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
});
