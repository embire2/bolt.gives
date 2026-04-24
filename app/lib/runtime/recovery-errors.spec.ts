import { describe, expect, it } from 'vitest';
import { classifyRecoverableStreamError, shouldIgnoreDisconnectAfterCompletedRun } from './recovery-errors';

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

  it('ignores a disconnect if the run already completed after the request started', () => {
    expect(
      shouldIgnoreDisconnectAfterCompletedRun({
        message: 'Stream disconnected before completion: websocket closed by server before response.completed',
        requestStartedAt: 1_000,
        lastRunCompletedAt: 2_000,
        lastPreviewReadyAt: null,
      }),
    ).toBe(true);
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
});
