import { describe, expect, it } from 'vitest';

import {
  shouldAttemptHostedPreviewVerification,
  shouldContinuePendingHostedPreviewVerification,
} from '../../app/routes/api.chat';

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
