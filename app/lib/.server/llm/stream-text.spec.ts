import { describe, expect, it } from 'vitest';
import { isTransientHostedFreeStreamError } from './stream-text';

describe('isTransientHostedFreeStreamError', () => {
  it('treats OpenRouter internal reference errors as transient hosted FREE failures', () => {
    expect(isTransientHostedFreeStreamError(new Error('internal error; reference = cl3pnvrkpjcirohb9ub1fqf9'))).toBe(
      true,
    );
  });

  it('does not retry non-transient validation errors', () => {
    expect(isTransientHostedFreeStreamError(new Error('Missing API key for FREE provider'))).toBe(false);
  });
});
