import { describe, expect, it } from 'vitest';
import {
  getCurrentRequestAssistantContent,
  getRemainingHostedFreeDeadlineMs,
  hasExceededHostedFreeDeadline,
  resolveStallPolicy,
  shouldRecoverHostedFreeCompletion,
} from './stall-policy';

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

  it('recovers a hosted FREE build that completes without actions or a new preview', () => {
    expect(
      shouldRecoverHostedFreeCompletion({
        providerName: 'FREE',
        chatMode: 'build',
        assistantContent: '',
        requestStartedAtMs: 20_000,
        lastPreviewReadyAtMs: 10_000,
      }),
    ).toBe(true);
    expect(
      shouldRecoverHostedFreeCompletion({
        providerName: 'FREE',
        chatMode: 'build',
        assistantContent: '<boltArtifact id="app">updated</boltArtifact>',
        requestStartedAtMs: 20_000,
        lastPreviewReadyAtMs: 10_000,
      }),
    ).toBe(false);
    expect(
      shouldRecoverHostedFreeCompletion({
        providerName: 'FREE',
        chatMode: 'build',
        assistantContent: '',
        requestStartedAtMs: 20_000,
        lastPreviewReadyAtMs: 25_000,
      }),
    ).toBe(false);
  });

  it('does not attribute the previous assistant artifact to an empty follow-up', () => {
    const previousContent = '<boltArtifact id="app">created</boltArtifact>';
    const baselineSignature = `assistant-1:${previousContent.length}`;

    expect(
      getCurrentRequestAssistantContent({
        baselineSignature,
        assistantMessageId: 'assistant-1',
        assistantContent: previousContent,
      }),
    ).toBe('');
    expect(
      getCurrentRequestAssistantContent({
        baselineSignature,
        assistantMessageId: 'assistant-2',
        assistantContent: '<boltAction type="file">updated</boltAction>',
      }),
    ).toContain('<boltAction');
  });
});
