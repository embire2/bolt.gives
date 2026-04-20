import { describe, expect, it } from 'vitest';
import { classifyRecoverableStreamError } from './recovery-errors';

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
});
