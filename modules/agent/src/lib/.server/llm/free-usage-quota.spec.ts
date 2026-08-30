import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertFreeUsageQuotaAllowed,
  buildFreeUsageQuotaLimitMessage,
  buildFreeUsageQuotaSubjectHash,
  getFreeUsageQuotaForRequest,
  recordFreeUsageQuotaForRequest,
} from './free-usage-quota';

describe('hosted FREE usage quota client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds a stable hashed subject from forwarded user identity', async () => {
    const request = new Request('https://bolt.gives/api/chat', {
      headers: {
        Cookie: 'bolt_managed_instance=session-secret',
        'CF-Connecting-IP': '203.0.113.10',
        'User-Agent': 'Quota Test Browser',
      },
    });

    const firstHash = await buildFreeUsageQuotaSubjectHash({
      request,
      runtimeEnv: { BOLT_HOSTED_FREE_RELAY_SECRET: 'relay-secret' },
    });
    const secondHash = await buildFreeUsageQuotaSubjectHash({
      request,
      runtimeEnv: { BOLT_HOSTED_FREE_RELAY_SECRET: 'relay-secret' },
    });

    expect(firstHash).toBe(secondHash);
    expect(firstHash).toMatch(/^[a-f0-9]{64}$/);
    expect(firstHash).not.toContain('session-secret');
    expect(firstHash).not.toContain('203.0.113.10');
  });

  it('throws the daily-limit error when the quota service rejects the FREE request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: false,
            quota: {
              allowed: false,
              usedUsd: 1,
              remainingUsd: 0,
              limitUsd: 1,
              resetAt: '2026-06-26T22:00:00.000Z',
              resetTimezone: 'GMT+2',
              message: buildFreeUsageQuotaLimitMessage(),
            },
          }),
          {
            status: 429,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      ),
    );

    await expect(
      assertFreeUsageQuotaAllowed({
        request: new Request('https://bolt.gives/api/chat'),
        runtimeEnv: { BOLT_HOSTED_FREE_RELAY_SECRET: 'relay-secret' },
        providerName: 'FREE',
      }),
    ).rejects.toThrow('FREE_PROVIDER_DAILY_LIMIT_EXCEEDED');
    expect(buildFreeUsageQuotaLimitMessage()).toContain('100 Agent tokens');
    expect(buildFreeUsageQuotaLimitMessage()).toContain('$5/month launch price');
  });

  it('returns an exhausted balance so the paused-service modal can render', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: false,
            quota: {
              allowed: false,
              usedTokens: 11846,
              remainingTokens: 0,
              tokenLimit: 100,
              usedUsd: 0.01,
              remainingUsd: 0.99,
              limitUsd: 1,
              resetAt: '2026-06-26T22:00:00.000Z',
              resetTimezone: 'GMT+2',
              message: buildFreeUsageQuotaLimitMessage(),
            },
          }),
          {
            status: 429,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      ),
    );

    await expect(
      getFreeUsageQuotaForRequest({
        request: new Request('https://bolt.gives/api/usage-balance'),
        runtimeEnv: { BOLT_HOSTED_FREE_RELAY_SECRET: 'relay-secret' },
      }),
    ).resolves.toMatchObject({
      allowed: false,
      usedTokens: 11846,
      remainingTokens: 0,
      tokenLimit: 100,
    });
  });

  it('uses the canonical quota service from Cloudflare Pages when no public runtime URL is bound', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        ok: true,
        quota: {
          allowed: true,
          usedTokens: 0,
          remainingTokens: 100,
          tokenLimit: 100,
          usedUsd: 0,
          remainingUsd: 1,
          limitUsd: 1,
          resetAt: '2026-06-26T22:00:00.000Z',
          resetTimezone: 'GMT+2',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await getFreeUsageQuotaForRequest({
      request: new Request('https://client-project.pages.dev/api/usage-balance'),
      runtimeEnv: { BOLT_HOSTED_FREE_RELAY_SECRET: 'relay-secret' },
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://bolt.gives/runtime/internal/free-usage-quota/check');
  });

  it('records estimated selected-model usage cost against the runtime quota ledger', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          quota: {
            allowed: true,
            usedUsd: 0.01,
            remainingUsd: 0.99,
            limitUsd: 1,
            resetAt: '2026-06-26T22:00:00.000Z',
            resetTimezone: 'GMT+2',
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await recordFreeUsageQuotaForRequest({
      request: new Request('https://bolt.gives/api/chat'),
      runtimeEnv: { BOLT_HOSTED_FREE_RELAY_SECRET: 'relay-secret' },
      providerName: 'FREE',
      modelName: 'claude-fable-5',
      usage: {
        promptTokens: 1000,
        completionTokens: 1000,
        totalTokens: 2000,
      },
      runId: 'run-1',
    });

    const requestBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:4321/runtime/internal/free-usage-quota/record');
    expect(requestBody.costUsd).toBeCloseTo(0.01, 8);
    expect(requestBody.limitUsd).toBe(1);
    expect(requestBody.tokenLimit).toBe(100);
    expect(requestBody.providerName).toBe('FREE');
    expect(requestBody.modelName).toBe('claude-fable-5');
  });
});
