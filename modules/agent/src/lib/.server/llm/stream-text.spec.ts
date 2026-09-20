import { describe, expect, it } from 'vitest';
import { isTransientHostedFreeStreamError, resolveBuildCompletionLimit } from './stream-text';

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

describe('resolveBuildCompletionLimit', () => {
  it('keeps hosted FREE build steps focused and bounded', () => {
    expect(
      resolveBuildCompletionLimit({
        safeMaxTokens: 8192,
        providerName: 'FREE',
        modelName: 'z-ai/glm-5.3-flash',
        chatMode: 'build',
      }),
    ).toBe(8192);
  });

  it('does not cap discussion responses or user-funded providers with the hosted limit', () => {
    expect(
      resolveBuildCompletionLimit({
        safeMaxTokens: 8192,
        providerName: 'FREE',
        modelName: 'claude-sonnet-5',
        chatMode: 'discuss',
      }),
    ).toBe(8192);
    expect(
      resolveBuildCompletionLimit({
        safeMaxTokens: 8192,
        providerName: 'Anthropic',
        modelName: 'claude-sonnet-5',
        chatMode: 'build',
      }),
    ).toBe(8192);
  });
});
