import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

export type QueuedVisibleFollowUp = {
  content: string;
  queuedAt: number;
};

type QueuedFollowUpDispatchOptions = {
  queuedFollowUp: QueuedVisibleFollowUp | null;
  isBusy: boolean;
  setQueuedFollowUp: Dispatch<SetStateAction<QueuedVisibleFollowUp | null>>;
  dispatch: (content: string) => void | Promise<void>;
  delayMs?: number;
};

export function useQueuedFollowUpDispatch({
  queuedFollowUp,
  isBusy,
  setQueuedFollowUp,
  dispatch,
  delayMs = 250,
}: QueuedFollowUpDispatchOptions) {
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  useEffect(() => {
    if (!queuedFollowUp || isBusy) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setQueuedFollowUp(null);
      void dispatchRef.current(queuedFollowUp.content);
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [delayMs, isBusy, queuedFollowUp, setQueuedFollowUp]);
}

type SingleFlightQueuedDispatchOptions<T> = {
  queuedItem: T | null;
  isBusy: boolean;
  setQueuedItem: Dispatch<SetStateAction<T | null>>;
  scheduledAt: (item: T) => number;
  dispatch: (item: T) => void | Promise<unknown>;
  onSuccess?: (item: T) => void;
  onError?: (item: T, error: unknown) => void;
};

export function useSingleFlightQueuedDispatch<T>({
  queuedItem,
  isBusy,
  setQueuedItem,
  scheduledAt,
  dispatch,
  onSuccess,
  onError,
}: SingleFlightQueuedDispatchOptions<T>) {
  const [timerTick, setTimerTick] = useState(0);
  const scheduledAtRef = useRef(scheduledAt);
  const dispatchRef = useRef(dispatch);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  scheduledAtRef.current = scheduledAt;
  dispatchRef.current = dispatch;
  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!queuedItem || isBusy) {
      return undefined;
    }

    const delayMs = Math.max(0, scheduledAtRef.current(queuedItem) - Date.now());

    if (delayMs > 0) {
      const timer = window.setTimeout(() => {
        setTimerTick((current) => current + 1);
      }, delayMs);

      return () => {
        window.clearTimeout(timer);
      };
    }

    // Claim the item before dispatch. Loading-state rerenders must not redispatch the same continuation.
    setQueuedItem(null);

    let dispatchResult: void | Promise<unknown>;

    try {
      dispatchResult = dispatchRef.current(queuedItem);
    } catch (error) {
      onErrorRef.current?.(queuedItem, error);
      return undefined;
    }

    void Promise.resolve(dispatchResult).then(
      () => onSuccessRef.current?.(queuedItem),
      (error) => onErrorRef.current?.(queuedItem, error),
    );

    return undefined;
  }, [isBusy, queuedItem, setQueuedItem, timerTick]);
}
