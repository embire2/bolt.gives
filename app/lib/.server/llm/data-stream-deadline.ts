export interface DataStreamDeadlineOptions {
  maxDuration: number;
  errorMessage: string;
  onDeadline?: () => void;
}

export function enforceDataStreamDeadline(
  stream: ReadableStream<Uint8Array>,
  options: DataStreamDeadlineOptions,
): ReadableStream<Uint8Array> {
  const maxDuration = Number(options.maxDuration);

  if (!Number.isFinite(maxDuration) || maxDuration <= 0) {
    return stream;
  }

  const encoder = new TextEncoder();
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let deadlineHandle: ReturnType<typeof setTimeout> | null = null;
  let startedAt = 0;
  let settled = false;

  const clearDeadline = () => {
    if (deadlineHandle) {
      clearTimeout(deadlineHandle);
      deadlineHandle = null;
    }
  };

  const closeAtDeadline = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (settled) {
      return;
    }

    settled = true;
    clearDeadline();

    try {
      options.onDeadline?.();
    } catch {
      // Closing the response must not depend on optional cleanup succeeding.
    }

    const reason = new Error(options.errorMessage);
    controller.enqueue(encoder.encode(`3:${JSON.stringify(options.errorMessage)}\n`));
    controller.close();
    void reader?.cancel(reason).catch(() => undefined);
  };

  return new ReadableStream<Uint8Array>({
    start() {
      reader = stream.getReader();
      startedAt = Date.now();
    },
    async pull(controller) {
      if (settled) {
        return;
      }

      const remainingDuration = maxDuration - (Date.now() - startedAt);

      if (remainingDuration <= 0) {
        closeAtDeadline(controller);
        return;
      }

      try {
        const outcome = await Promise.race([
          reader!.read().then((next) => ({ type: 'read' as const, next })),
          new Promise<{ type: 'deadline' }>((resolve) => {
            deadlineHandle = setTimeout(() => resolve({ type: 'deadline' }), remainingDuration);
          }),
        ]);

        clearDeadline();

        if (outcome.type === 'deadline') {
          closeAtDeadline(controller);
          return;
        }

        if (outcome.next.done) {
          settled = true;
          controller.close();

          return;
        }

        controller.enqueue(outcome.next.value);
      } catch (error) {
        if (settled) {
          return;
        }

        settled = true;
        clearDeadline();
        controller.error(error);
      }
    },
    cancel(reason) {
      if (settled) {
        return Promise.resolve();
      }

      settled = true;
      clearDeadline();

      return reader?.cancel(reason) ?? Promise.resolve();
    },
  });
}
