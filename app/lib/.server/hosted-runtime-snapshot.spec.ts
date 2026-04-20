import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitForHostedRuntimePreviewVerificationForRequest } from './hosted-runtime-snapshot';

describe('waitForHostedRuntimePreviewVerificationForRequest', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('emits poll updates until the hosted preview is ready', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessionId: 'session-1',
          preview: null,
          status: 'starting',
          healthy: false,
          updatedAt: new Date().toISOString(),
          recentLogs: [],
          alert: null,
          recovery: null,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessionId: 'session-1',
          preview: {
            port: 4100,
            baseUrl: 'https://example.com/runtime/preview/session-1/4100',
          },
          status: 'ready',
          healthy: true,
          updatedAt: new Date().toISOString(),
          recentLogs: [],
          alert: null,
          recovery: null,
        }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const onPoll = vi.fn();
    const result = await waitForHostedRuntimePreviewVerificationForRequest({
      requestUrl: 'https://alpha1.bolt.gives/api/chat',
      sessionId: 'session-1',
      timeoutMs: 5_000,
      pollIntervalMs: 0,
      onPoll,
    });

    expect(result.outcome).toBe('ready');
    expect(onPoll).toHaveBeenCalledTimes(2);
    expect(onPoll.mock.calls[0][0]?.status).toBe('starting');
    expect(onPoll.mock.calls[1][0]?.status).toBe('ready');
  });
});
