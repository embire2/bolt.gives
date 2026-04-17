import { describe, expect, it } from 'vitest';
import { getHiddenContinuationDelay, shouldDispatchHiddenContinuation } from './continuation-dispatch';

describe('continuation dispatch helpers', () => {
  it('delays the first hidden continuation while a stream is still active', () => {
    expect(getHiddenContinuationDelay({ attempt: 1, isBusy: true })).toBe(350);
    expect(getHiddenContinuationDelay({ attempt: 1, isBusy: false })).toBe(0);
  });

  it('caps later retry delays for hidden continuations', () => {
    expect(getHiddenContinuationDelay({ attempt: 2, isBusy: false })).toBe(1100);
    expect(getHiddenContinuationDelay({ attempt: 10, isBusy: false })).toBe(2200);
  });

  it('only dispatches once chat loading has fully settled', () => {
    expect(
      shouldDispatchHiddenContinuation({
        isLoading: true,
        fakeLoading: false,
        scheduledAt: 100,
        now: 1000,
      }),
    ).toBe(false);
    expect(
      shouldDispatchHiddenContinuation({
        isLoading: false,
        fakeLoading: true,
        scheduledAt: 100,
        now: 1000,
      }),
    ).toBe(false);
    expect(
      shouldDispatchHiddenContinuation({
        isLoading: false,
        fakeLoading: false,
        scheduledAt: 1000,
        now: 500,
      }),
    ).toBe(false);
    expect(
      shouldDispatchHiddenContinuation({
        isLoading: false,
        fakeLoading: false,
        scheduledAt: 500,
        now: 1000,
      }),
    ).toBe(true);
  });
});
