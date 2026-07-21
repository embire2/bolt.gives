// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  useQueuedFollowUpDispatch,
  useSingleFlightQueuedDispatch,
  type QueuedVisibleFollowUp,
} from './useQueuedFollowUpDispatch';

afterEach(() => {
  vi.useRealTimers();
});

describe('useQueuedFollowUpDispatch', () => {
  it('dispatches once even when unrelated renders recreate the dispatch callback faster than the delay', () => {
    vi.useFakeTimers();

    const dispatched: Array<{ content: string; renderVersion: number }> = [];
    const hook = renderHook(
      ({ renderVersion }) => {
        const [queuedFollowUp, setQueuedFollowUp] = useState<QueuedVisibleFollowUp | null>({
          content: 'Add the exact visible text CAL_FUP_123',
          queuedAt: 1,
        });

        useQueuedFollowUpDispatch({
          queuedFollowUp,
          isBusy: false,
          setQueuedFollowUp,
          dispatch: (content) => {
            dispatched.push({ content, renderVersion });
          },
        });
      },
      { initialProps: { renderVersion: 0 } },
    );

    act(() => {
      vi.advanceTimersByTime(100);
    });
    hook.rerender({ renderVersion: 1 });

    act(() => {
      vi.advanceTimersByTime(100);
    });
    hook.rerender({ renderVersion: 2 });

    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(dispatched).toEqual([
      {
        content: 'Add the exact visible text CAL_FUP_123',
        renderVersion: 2,
      },
    ]);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(dispatched).toHaveLength(1);
  });

  it('claims a hidden continuation before loading-state rerenders can dispatch it again', () => {
    let resolveDispatch: () => void = () => undefined;
    const dispatchPromise = new Promise<void>((resolve) => {
      resolveDispatch = () => resolve();
    });
    const dispatch = vi.fn((_item: { id: string; scheduledAt: number; renderVersion: number }) => dispatchPromise);
    const hook = renderHook(
      ({ renderVersion }) => {
        const [queuedItem, setQueuedItem] = useState<{ id: string; scheduledAt: number } | null>({
          id: 'hidden-continuation',
          scheduledAt: 0,
        });
        const [isBusy, setIsBusy] = useState(false);

        useSingleFlightQueuedDispatch({
          queuedItem,
          isBusy,
          setQueuedItem,
          scheduledAt: (item) => item.scheduledAt,
          dispatch: (item) => {
            setIsBusy(true);
            return dispatch({ ...item, renderVersion });
          },
        });

        return { isBusy, queuedItem };
      },
      { initialProps: { renderVersion: 0 } },
    );

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(hook.result.current.queuedItem).toBeNull();
    expect(hook.result.current.isBusy).toBe(true);

    hook.rerender({ renderVersion: 1 });
    hook.rerender({ renderVersion: 2 });
    expect(dispatch).toHaveBeenCalledTimes(1);

    act(() => {
      resolveDispatch();
    });
  });
});
