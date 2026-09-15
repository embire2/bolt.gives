import { setTimeout as sleep } from 'node:timers/promises';

export function attachProjectLifecycle(child, { stop, remove }, { timeoutMs = 15000, pollMs = 100 } = {}) {
  let closed = false;
  let cleanup;
  let stopping;
  let notifyClosed;
  const whenClosed = new Promise((resolve) => {
    notifyClosed = resolve;
  });
  const removeContainer = () =>
    Promise.resolve()
      .then(() => remove(AbortSignal.timeout(5000)))
      .catch(() => false);

  child.once('close', () => {
    closed = true;
    cleanup = removeContainer();
    notifyClosed();
  });

  child.terminateProject = () => {
    if (stopping) {
      return stopping;
    }

    stopping = (async () => {
      const deadline = AbortSignal.timeout(timeoutMs);

      try {
        /*
         * `podman stop --ignore` also succeeds before `podman run` creates the container.
         * Only the attached client's close plus successful removal proves the project stopped.
         */
        while (!closed) {
          deadline.throwIfAborted();
          await stop(deadline);

          if (!closed) {
            await Promise.race([whenClosed, sleep(pollMs, undefined, { signal: deadline })]);
          }
        }

        const removed = await (cleanup || removeContainer());

        if (!removed) {
          cleanup = undefined;
        }

        return { stopped: removed === true };
      } catch {
        return { stopped: false };
      }
    })();
    void stopping.then((result) => {
      if (!result.stopped) {
        stopping = undefined;
      }
    });

    return stopping;
  };
}
