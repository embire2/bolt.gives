export interface HiddenContinuationDelayOptions {
  attempt: number;
  isBusy: boolean;
}

export interface HiddenContinuationDispatchOptions {
  isLoading: boolean;
  fakeLoading: boolean;
  scheduledAt: number;
  now: number;
}

export function getHiddenContinuationDelay({ attempt, isBusy }: HiddenContinuationDelayOptions): number {
  if (attempt <= 1) {
    return isBusy ? 350 : 0;
  }

  return Math.min(2200, attempt * 550);
}

export function shouldDispatchHiddenContinuation({
  isLoading,
  fakeLoading,
  scheduledAt,
  now,
}: HiddenContinuationDispatchOptions): boolean {
  if (isLoading || fakeLoading) {
    return false;
  }

  return now >= scheduledAt;
}
