/*
 * Reliability primitives: timeouts, retries, circuit-breakers, bounded fetch.
 *
 * These are the five tools every production-grade service needs when calling
 * an upstream you don't own. Keeping them centralized means:
 *
 *   - One place to tweak defaults (e.g. shorten timeouts for a flaky provider).
 *   - Every caller gets the same AbortSignal plumbing, so client disconnects
 *     actually cancel upstream work instead of leaking.
 *   - Consistent error classification (timeout vs. upstream 5xx vs. network).
 *
 * None of these keep state in the module scope (circuit-breakers are
 * instance-scoped) so we're safe on Cloudflare Workers where module globals
 * leak across requests within an isolate.
 */

export class TimeoutError extends Error {
  readonly code = 'E_TIMEOUT';

  constructor(label: string, timeoutMs: number) {
    super(`${label} timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}

export class CircuitOpenError extends Error {
  readonly code = 'E_CIRCUIT_OPEN';

  constructor(label: string, cooldownMs: number) {
    super(`Circuit for ${label} is open; retry in ${cooldownMs}ms`);
    this.name = 'CircuitOpenError';
  }
}

/**
 * Bounded Promise race with cleanup. Cancels the timer whether the inner
 *  promise resolves or rejects. If an `AbortController` is passed, it is
 *  aborted on timeout so downstream fetches stop doing work.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
  controller?: AbortController,
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      controller?.abort();
      reject(new TimeoutError(label, timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}

/* ----------------------------------------------------------------------- */
/* Retry with exponential backoff + jitter                                  */
/* ----------------------------------------------------------------------- */

export interface RetryOptions {
  /** Max attempts including the initial try. Default 3. */
  attempts?: number;

  /** Base delay before the 2nd attempt, in ms. Default 250. */
  baseDelayMs?: number;

  /** Cap on the delay between attempts. Default 4000. */
  maxDelayMs?: number;

  /** Predicate: should this error be retried? Default: retry network + 5xx. */
  shouldRetry?: (error: unknown, attempt: number) => boolean;

  /** Observability hook fired before each retry. */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;

  /** Abort signal to cut the retry loop short. */
  signal?: AbortSignal;
}

const defaultShouldRetry = (error: unknown): boolean => {
  if (error instanceof TimeoutError) {
    return true;
  }

  if (error instanceof Error) {
    // node-fetch / undici network errors
    if (/ECONN|ETIMEDOUT|ENETUNREACH|EAI_AGAIN|socket hang up/i.test(error.message)) {
      return true;
    }

    const status = (error as { status?: unknown }).status;

    if (typeof status === 'number' && status >= 500 && status < 600) {
      return true;
    }

    if (typeof status === 'number' && status === 429) {
      return true;
    }
  }

  return false;
};

export async function withRetry<T>(run: (attempt: number) => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const baseDelayMs = Math.max(10, options.baseDelayMs ?? 250);
  const maxDelayMs = Math.max(baseDelayMs, options.maxDelayMs ?? 4_000);
  const shouldRetry = options.shouldRetry ?? defaultShouldRetry;

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (options.signal?.aborted) {
      throw options.signal.reason ?? new Error('Aborted');
    }

    try {
      return await run(attempt);
    } catch (error) {
      lastError = error;

      if (attempt === attempts || !shouldRetry(error, attempt)) {
        throw error;
      }

      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const jitter = Math.random() * (backoff / 4);
      const delay = backoff + jitter;

      options.onRetry?.(error, attempt, delay);

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, delay);

        if (options.signal) {
          const abortHandler = () => {
            clearTimeout(timer);
            reject(options.signal?.reason ?? new Error('Aborted'));
          };

          if (options.signal.aborted) {
            clearTimeout(timer);
            reject(options.signal.reason ?? new Error('Aborted'));

            return;
          }

          options.signal.addEventListener('abort', abortHandler, { once: true });
        }
      });
    }
  }

  throw lastError;
}

/* ----------------------------------------------------------------------- */
/* Circuit breaker                                                          */
/* ----------------------------------------------------------------------- */

export interface CircuitBreakerOptions {
  label: string;

  /** Consecutive failures before we open the circuit. Default 5. */
  failureThreshold?: number;

  /** How long to stay open before allowing a single probe. Default 30s. */
  cooldownMs?: number;

  /** Optional clock for tests. */
  now?: () => number;
}

type BreakerState = 'closed' | 'open' | 'half-open';

export class CircuitBreaker {
  #state: BreakerState = 'closed';
  #failures = 0;
  #openedAt = 0;
  readonly #label: string;
  readonly #failureThreshold: number;
  readonly #cooldownMs: number;
  readonly #now: () => number;

  constructor(options: CircuitBreakerOptions) {
    this.#label = options.label;
    this.#failureThreshold = Math.max(1, options.failureThreshold ?? 5);
    this.#cooldownMs = Math.max(1_000, options.cooldownMs ?? 30_000);
    this.#now = options.now ?? Date.now;
  }

  get state(): BreakerState {
    return this.#state;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.#state === 'open') {
      const elapsed = this.#now() - this.#openedAt;

      if (elapsed < this.#cooldownMs) {
        throw new CircuitOpenError(this.#label, this.#cooldownMs - elapsed);
      }

      this.#state = 'half-open';
    }

    try {
      const result = await fn();

      if (this.#state === 'half-open') {
        this.#state = 'closed';
      }

      this.#failures = 0;

      return result;
    } catch (error) {
      this.#failures += 1;

      if (this.#state === 'half-open' || this.#failures >= this.#failureThreshold) {
        this.#state = 'open';
        this.#openedAt = this.#now();
      }

      throw error;
    }
  }

  /** Force-reset the breaker (useful after a config change). */
  reset() {
    this.#state = 'closed';
    this.#failures = 0;
    this.#openedAt = 0;
  }
}

/* ----------------------------------------------------------------------- */
/* Bounded fetch                                                            */
/* ----------------------------------------------------------------------- */

export interface BoundedFetchOptions extends Omit<RequestInit, 'signal'> {
  /** Per-request timeout. Default 15s. */
  timeoutMs?: number;

  /** Caller's abort signal. We link it to our internal controller. */
  signal?: AbortSignal;

  /** Label used in error messages / logs. Default: URL's host. */
  label?: string;

  /** Number of attempts. Default 1 (no retry). */
  attempts?: number;

  /** Base retry delay. */
  baseDelayMs?: number;
}

/**
 * Fetch wrapper that always times out, always links caller AbortSignal,
 *  and optionally retries on transient failures. Returns the raw Response
 *  (throws on network/timeout/abort, not on HTTP status).
 */
export async function boundedFetch(input: RequestInfo | URL, options: BoundedFetchOptions = {}): Promise<Response> {
  const { timeoutMs = 15_000, signal: callerSignal, label, attempts, baseDelayMs, ...init } = options;

  const run = async () => {
    const controller = new AbortController();

    // Propagate abort from the caller's signal into ours.
    if (callerSignal) {
      if (callerSignal.aborted) {
        throw callerSignal.reason ?? new Error('Aborted');
      }

      callerSignal.addEventListener('abort', () => controller.abort(callerSignal.reason), { once: true });
    }

    const resolvedLabel = label ?? (typeof input === 'string' ? safeHost(input) : safeHost(String(input)));

    return withTimeout(
      fetch(input as any, { ...init, signal: controller.signal }),
      timeoutMs,
      `fetch:${resolvedLabel}`,
      controller,
    );
  };

  if ((attempts ?? 1) <= 1) {
    return run();
  }

  return withRetry(run, {
    attempts,
    baseDelayMs,
    signal: callerSignal,
    shouldRetry: (error) => {
      if (error instanceof TimeoutError) {
        return true;
      }

      if (error instanceof Error && /ECONN|ETIMEDOUT|ENETUNREACH|fetch failed/i.test(error.message)) {
        return true;
      }

      return false;
    },
  });
}

function safeHost(urlish: string): string {
  try {
    return new URL(urlish).host || urlish;
  } catch {
    return urlish;
  }
}
