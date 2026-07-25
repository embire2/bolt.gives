import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSampler } from './sampler';

describe('createSampler', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('cancels a trailing call when its owner unmounts', () => {
    vi.useFakeTimers();

    const callback = vi.fn();
    const sampled = createSampler(callback, 50);

    sampled('first');
    sampled('stale');

    sampled.cancel();
    vi.advanceTimersByTime(100);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('first');
  });
});
