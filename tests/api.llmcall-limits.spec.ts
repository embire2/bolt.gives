import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isHostedFreeProviderFailure, isLlmCallApiKeyError, resolveLlmCallMaxTokens } from '~/routes/api.llmcall';

describe('api.llmcall token limits', () => {
  it('records streamed usage through the profile-aware FREE or paid-account meter', () => {
    const source = readFileSync(resolve(process.cwd(), 'modules/surfaces/app/routes/api.llmcall.ts'), 'utf8');

    expect(source).toContain('const quotaRecordingTask = result.usage');
    expect(source).toContain('scheduleBackgroundTask(context, quotaRecordingTask)');
    expect(source).toContain('const usageMeter = await createProfileFreeUsageMeter({');
    expect(source).toContain('usageMeter.record({');
    expect(source).toContain('runId: `llmcall:${crypto.randomUUID()}`');
  });

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

  it('does not disguise a FREE upstream outage containing API-key guidance as a credential failure', () => {
    const message = 'FREE_PROVIDER_UNAVAILABLE: claude-opus-4-8(Use an Anthropic API key instead, or ask your admin)';

    expect(isHostedFreeProviderFailure(message)).toBe(true);
    expect(isLlmCallApiKeyError(message)).toBe(false);
    expect(isLlmCallApiKeyError('Missing API key for OpenAI provider')).toBe(true);
  });
});
