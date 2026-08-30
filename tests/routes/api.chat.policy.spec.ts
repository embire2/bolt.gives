import { describe, expect, it } from 'vitest';

import {
  shouldAttemptHostedPreviewVerification,
  shouldContinuePendingHostedPreviewVerification,
} from '~/routes/api.chat';
import {
  resolveDefaultStreamTimeoutMs,
  resolveStreamMaxDurationMs,
  shouldTrackCommentaryRunActivity,
  shouldTrackModelStreamChunkActivity,
} from '@bolt/agent/lib/runtime/api-chat-stream-policy';

describe('api.chat hosted preview continuation policy', () => {
  it('does not attempt hosted preview verification without a hosted runtime session', () => {
    expect(
      shouldAttemptHostedPreviewVerification({
        chatMode: 'build',
        previewCheckpointObserved: false,
        hasExecutionFailures: false,
        hostedRuntimeSessionId: undefined,
      }),
    ).toBe(false);
  });

  it('continues pending preview verification only for hosted runtime sessions with attempts remaining', () => {
    expect(
      shouldContinuePendingHostedPreviewVerification({
        chatMode: 'build',
        previewCheckpointObserved: false,
        hasExecutionFailures: false,
        hostedRuntimeSessionId: 'session-123',
        attempts: 0,
        maxAttempts: 2,
      }),
    ).toBe(true);
  });

  it('does not continue pending preview verification for local runs or after attempts are exhausted', () => {
    expect(
      shouldContinuePendingHostedPreviewVerification({
        chatMode: 'build',
        previewCheckpointObserved: false,
        hasExecutionFailures: false,
        hostedRuntimeSessionId: undefined,
        attempts: 0,
        maxAttempts: 2,
      }),
    ).toBe(false);

    expect(
      shouldContinuePendingHostedPreviewVerification({
        chatMode: 'build',
        previewCheckpointObserved: false,
        hasExecutionFailures: false,
        hostedRuntimeSessionId: 'session-123',
        attempts: 2,
        maxAttempts: 2,
      }),
    ).toBe(false);
  });
});

describe('api.chat stream recovery policy', () => {
  it('uses a shorter inactivity timeout for the hosted FREE provider', () => {
    expect(resolveDefaultStreamTimeoutMs('FREE', 'gpt-5.6')).toBe(120_000);
    expect(resolveDefaultStreamTimeoutMs('OpenAI', 'gpt-5.6')).toBe(300_000);
    expect(resolveDefaultStreamTimeoutMs('OpenAI', 'gpt-4.1')).toBe(180_000);
  });

  it('sets a wall-clock deadline only for hosted FREE streams', () => {
    expect(resolveStreamMaxDurationMs('FREE')).toBe(150_000);
    expect(resolveStreamMaxDurationMs('FREE', '30000')).toBe(30_000);
    expect(resolveStreamMaxDurationMs('FREE', 'invalid')).toBe(150_000);
    expect(resolveStreamMaxDurationMs('OpenAI')).toBeUndefined();
  });

  it('does not treat commentary heartbeats as provider stream activity', () => {
    expect(shouldTrackCommentaryRunActivity()).toBe(true);
    expect(shouldTrackCommentaryRunActivity({ trackRunActivity: false })).toBe(false);
  });

  it('requires visible or actionable model output to reset stream recovery', () => {
    expect(shouldTrackModelStreamChunkActivity({ type: 'reasoning' })).toBe(false);
    expect(shouldTrackModelStreamChunkActivity({ type: 'text-delta' })).toBe(true);
    expect(shouldTrackModelStreamChunkActivity({ type: 'tool-call-delta' })).toBe(true);
    expect(shouldTrackModelStreamChunkActivity()).toBe(false);
  });
});
