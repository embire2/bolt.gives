import { afterEach, describe, expect, it, vi } from 'vitest';
import { StreamRecoveryManager } from './stream-recovery';

describe('StreamRecoveryManager', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('enforces a wall-clock deadline even while stream activity continues', () => {
    vi.useFakeTimers();

    const onTimeout = vi.fn();
    const manager = new StreamRecoveryManager({
      timeout: 60_000,
      maxDuration: 150_000,
      maxRetries: 1,
      onTimeout,
    });

    manager.startMonitoring();

    for (let elapsed = 0; elapsed < 150_000; elapsed += 30_000) {
      vi.advanceTimersByTime(30_000);
      manager.updateActivity();
    }

    expect(onTimeout).toHaveBeenCalledTimes(1);
    manager.stop();
  });

  it('honors a zero-retry policy', () => {
    vi.useFakeTimers();

    const onTimeout = vi.fn();
    const manager = new StreamRecoveryManager({ timeout: 30_000, maxRetries: 0, onTimeout });

    manager.startMonitoring();
    vi.advanceTimersByTime(30_000);

    expect(onTimeout).not.toHaveBeenCalled();
    expect(manager.getStatus().isActive).toBe(false);
  });
});
