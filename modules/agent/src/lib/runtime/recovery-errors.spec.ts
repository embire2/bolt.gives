import { describe, expect, it } from 'vitest';
import {
  classifyRecoverableStreamError,
  isHostedFreeFundingError,
  shouldIgnoreDisconnectAfterCompletedRun,
} from './recovery-errors';

describe('classifyRecoverableStreamError', () => {
  it('flags websocket disconnects before response completion as recoverable', () => {
    expect(
      classifyRecoverableStreamError(
        'Stream disconnected before completion: websocket closed by server before response.completed',
      ),
    ).toEqual({
      timeoutLike: false,
      disconnectLike: true,
    });
  });

  it('flags stream timeouts as recoverable timeout errors', () => {
    expect(classifyRecoverableStreamError('BOLT_STREAM_TIMEOUT: no stream activity for 10000ms')).toEqual({
      timeoutLike: true,
      disconnectLike: false,
    });
  });

  it('flags generic hosted stream network failures as disconnects', () => {
    expect(classifyRecoverableStreamError('Custom error: Network error. Please try again.')).toEqual({
      timeoutLike: false,
      disconnectLike: true,
    });
  });

  it('does not ignore a disconnect after a completed command without a verified preview', () => {
    expect(
      shouldIgnoreDisconnectAfterCompletedRun({
        message: 'Stream disconnected before completion: websocket closed by server before response.completed',
        requestStartedAt: 1_000,
        lastRunCompletedAt: 2_000,
        lastPreviewReadyAt: null,
      }),
    ).toBe(false);
  });

  it('does not ignore a disconnect when completion evidence belongs to an older run', () => {
    expect(
      shouldIgnoreDisconnectAfterCompletedRun({
        message: 'Stream disconnected before completion: websocket closed by server before response.completed',
        requestStartedAt: 2_000,
        lastRunCompletedAt: 1_500,
        lastPreviewReadyAt: null,
      }),
    ).toBe(false);
  });

  it('does not let a new completed command reuse an older verified preview', () => {
    expect(
      shouldIgnoreDisconnectAfterCompletedRun({
        message: 'Network error',
        requestStartedAt: 2_000,
        lastRunCompletedAt: 3_000,
        lastPreviewReadyAt: 1_500,
      }),
    ).toBe(false);
  });

  it('ignores a timeout when the current request already produced a verified preview', () => {
    expect(
      shouldIgnoreDisconnectAfterCompletedRun({
        message: 'BOLT_STREAM_TIMEOUT: hosted FREE generation exceeded 150000ms',
        requestStartedAt: 1_000,
        lastRunCompletedAt: null,
        lastPreviewReadyAt: 2_000,
      }),
    ).toBe(true);
  });

  it('classifies hosted FREE funding failures as non-recoverable operator errors', () => {
    expect(isHostedFreeFundingError('Custom error: Payment Required')).toBe(true);
    expect(isHostedFreeFundingError('The operator-funded MagnetAPI wallet is out of credits.')).toBe(true);
    expect(isHostedFreeFundingError('Generation stream timed out')).toBe(false);
  });
});
