import { describe, expect, it } from 'vitest';
import { resolveLlmCallMaxTokens } from '../app/routes/api.llmcall';

describe('api.llmcall token limits', () => {
  it('uses a smaller positive request limit for bounded live probes', () => {
    expect(resolveLlmCallMaxTokens(32_768, 64)).toBe(64);
  });

  it('clamps requests to the selected model completion limit', () => {
    expect(resolveLlmCallMaxTokens(8_192, 50_000)).toBe(8_192);
    expect(resolveLlmCallMaxTokens(8_192, 64.9)).toBe(64);
  });

  it('keeps the model limit when the request is absent or invalid', () => {
    expect(resolveLlmCallMaxTokens(8_192, undefined)).toBe(8_192);
    expect(resolveLlmCallMaxTokens(8_192, 0)).toBe(8_192);
  });
});
