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
  let settled = false;

  const clearDeadline = () => {
    if (deadlineHandle) {
      clearTimeout(deadlineHandle);
      deadlineHandle = null;
    }
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      reader = stream.getReader();
      deadlineHandle = setTimeout(() => {
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
      }, maxDuration);

      void (async () => {
        try {
          while (!settled) {
            const next = await reader!.read();

            if (settled) {
              return;
            }

            if (next.done) {
              settled = true;
              clearDeadline();
              controller.close();

              return;
            }

            controller.enqueue(next.value);
          }
        } catch (error) {
          if (settled) {
            return;
          }

          settled = true;
          clearDeadline();
          controller.error(error);
        }
      })();
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
