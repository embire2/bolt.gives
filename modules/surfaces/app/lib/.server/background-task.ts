type BackgroundTaskContext = {
  cloudflare?: {
    ctx?: {
      waitUntil?: (task: Promise<unknown>) => void;
    };
  };
};

export function scheduleBackgroundTask(context: unknown, task: Promise<unknown>) {
  const waitUntil = (context as BackgroundTaskContext | undefined)?.cloudflare?.ctx?.waitUntil;

  if (typeof waitUntil === 'function') {
    waitUntil(task);
  } else {
    void task;
  }

  return task;
}
