import { describe, expect, it } from 'vitest';
import { describeStreamError } from './stream-error';
import { classifyRecoverableStreamError } from '@bolt/agent/lib/runtime/recovery-errors';

describe('data stream error normalization', () => {
  it.each([
    new Error('Network error'),
    'Network error',
    { error: { message: 'Network error' } },
    { cause: 'Network error' },
  ])('retains the retryable cause instead of Unknown error', (error) => {
    const message = describeStreamError(error);
    expect(message).toBe('Network error');
    expect(classifyRecoverableStreamError(message).disconnectLike).toBe(true);
  });

  it('preserves explicit auth and funding failures instead of treating them as disconnects', () => {
    expect(describeStreamError('FREE_PROVIDER_CREDITS_EXHAUSTED')).toBe('FREE_PROVIDER_CREDITS_EXHAUSTED');
    expect(
      classifyRecoverableStreamError(describeStreamError({ message: 'Missing API key for FREE' })).disconnectLike,
    ).toBe(false);
  });

  it('redacts configured secrets, upstream keys and URL passwords', () => {
    const message = describeStreamError('failure secret-fixture sk-example123 postgres://user:password@db.example', {
      API_TOKEN: 'secret-fixture',
    });
    expect(message).not.toContain('secret-fixture');
    expect(message).not.toContain('sk-example123');
    expect(message).not.toContain('password');
  });

  it('bounds cyclic and missing error envelopes with an explicit recoverable stream failure', () => {
    const error: { cause?: unknown } = {};
    error.cause = error;
    expect(classifyRecoverableStreamError(describeStreamError(error)).disconnectLike).toBe(true);
    expect(classifyRecoverableStreamError(describeStreamError(null)).disconnectLike).toBe(true);
  });
});
