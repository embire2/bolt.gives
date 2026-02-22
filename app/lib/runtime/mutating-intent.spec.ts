import { describe, expect, it } from 'vitest';
import { requestLikelyNeedsMutatingActions } from './mutating-intent';

describe('requestLikelyNeedsMutatingActions', () => {
  it('returns true for scaffold/build prompts', () => {
    expect(
      requestLikelyNeedsMutatingActions('Create a Node.js React app with Vite, install dependencies, and run it'),
    ).toBe(true);
  });

  it('returns true for template-driven prompts picked by starter heuristics', () => {
    expect(requestLikelyNeedsMutatingActions('Build me a Next.js dashboard starter')).toBe(true);
  });

  it('returns false for read-only informational prompts', () => {
    expect(requestLikelyNeedsMutatingActions('Explain what a React hook is in one paragraph')).toBe(false);
  });
});
