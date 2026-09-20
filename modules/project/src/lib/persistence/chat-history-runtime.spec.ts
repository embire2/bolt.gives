import { describe, expect, it, vi } from 'vitest';
import type { HostedRuntimePreviewStatus } from '@bolt/runtime/lib/runtime/hosted-runtime-client';
import { rebindHealthyHostedRuntimePreview } from './chat-history-runtime';

function createStatus(overrides: Partial<HostedRuntimePreviewStatus> = {}): HostedRuntimePreviewStatus {
  return {
    sessionId: 'saved-session',
    preview: {
      port: 6100,
      baseUrl: 'https://alpha1.bolt.gives/runtime/preview/saved-session/6100',
      revision: 7,
    },
    status: 'ready',
    healthy: true,
    updatedAt: '2026-07-25T16:00:00.000Z',
    recentLogs: [],
    alert: null,
    recovery: {
      state: 'idle',
      token: 1,
      message: null,
      updatedAt: '2026-07-25T16:00:00.000Z',
    },
    ...overrides,
  };
}

describe('rebindHealthyHostedRuntimePreview', () => {
  it('waits for an existing runtime start rather than replaying setup on history restore', async () => {
    const ready = createStatus();
    const fetchStatus = vi
      .fn()
      .mockResolvedValueOnce(createStatus({ status: 'starting', healthy: false, preview: null }))
      .mockResolvedValueOnce(createStatus({ status: 'starting', healthy: false }))
      .mockResolvedValue(ready);
    const applyPreview = vi.fn();
    const wait = vi.fn().mockResolvedValue(undefined);
    await expect(
      rebindHealthyHostedRuntimePreview({ sessionId: 'saved-session', fetchStatus, applyPreview, wait }),
    ).resolves.toBe(true);
    expect(wait).toHaveBeenCalledTimes(2);
    expect(applyPreview).toHaveBeenCalledOnce();
    expect(applyPreview).toHaveBeenCalledWith(ready.preview);
  });

  it('bounds startup waiting and never reports an unready runtime as healthy', async () => {
    const fetchStatus = vi.fn().mockResolvedValue(createStatus({ status: 'starting', healthy: false }));
    const applyPreview = vi.fn();
    const wait = vi.fn().mockResolvedValue(undefined);
    await expect(
      rebindHealthyHostedRuntimePreview({ sessionId: 'saved-session', fetchStatus, applyPreview, wait }),
    ).resolves.toBe(false);
    expect(fetchStatus).toHaveBeenCalledTimes(16);
    expect(applyPreview).not.toHaveBeenCalled();
  });

  it('stops startup polling when the user navigates away', async () => {
    let active = true;
    const fetchStatus = vi.fn().mockResolvedValue(createStatus({ status: 'starting', healthy: false }));
    const applyPreview = vi.fn();
    await expect(
      rebindHealthyHostedRuntimePreview({
        sessionId: 'saved-session',
        fetchStatus,
        applyPreview,
        shouldContinue: () => active,
        wait: async () => {
          active = false;
        },
      }),
    ).resolves.toBe(false);
    expect(fetchStatus).toHaveBeenCalledOnce();
    expect(applyPreview).not.toHaveBeenCalled();
  });

  it('reuses a healthy saved preview without requesting runtime recovery', async () => {
    const previewStatus = createStatus();
    const fetchStatus = vi.fn().mockResolvedValue(previewStatus);
    const applyPreview = vi.fn();

    await expect(
      rebindHealthyHostedRuntimePreview({
        sessionId: 'saved-session',
        fetchStatus,
        applyPreview,
      }),
    ).resolves.toBe(true);

    expect(fetchStatus).toHaveBeenCalledWith('saved-session');
    expect(applyPreview).toHaveBeenCalledWith(previewStatus.preview);
  });

  it('leaves unhealthy saved runtimes available for the recovery fallback', async () => {
    const applyPreview = vi.fn();

    await expect(
      rebindHealthyHostedRuntimePreview({
        sessionId: 'saved-session',
        fetchStatus: vi.fn().mockResolvedValue(
          createStatus({
            status: 'repairing',
            healthy: false,
          }),
        ),
        applyPreview,
      }),
    ).resolves.toBe(false);

    expect(applyPreview).not.toHaveBeenCalled();
  });
});
