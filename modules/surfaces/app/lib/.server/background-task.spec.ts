import { describe, expect, it, vi } from 'vitest';
import { scheduleBackgroundTask } from './background-task';

describe('scheduleBackgroundTask', () => {
  it('keeps metering work alive through the Cloudflare execution context', async () => {
    const waitUntil = vi.fn();
    const task = Promise.resolve('recorded');

    expect(
      scheduleBackgroundTask(
        {
          cloudflare: {
            ctx: { waitUntil },
          },
        },
        task,
      ),
    ).toBe(task);
    expect(waitUntil).toHaveBeenCalledWith(task);
    await expect(task).resolves.toBe('recorded');
  });

  it('still runs the task in the local Node runtime', async () => {
    const task = Promise.resolve('recorded');

    expect(scheduleBackgroundTask({}, task)).toBe(task);
    await expect(task).resolves.toBe('recorded');
  });
});
