import { describe, expect, it, vi } from 'vitest';
import { createResilientExecutionQueue } from './serial-execution-queue';

describe('createResilientExecutionQueue', () => {
  it('continues executing later tasks after one task fails', async () => {
    const executionOrder: string[] = [];
    const onError = vi.fn();
    const enqueue = createResilientExecutionQueue(onError);

    await Promise.all([
      enqueue(async () => {
        executionOrder.push('first');
      }),
      enqueue(async () => {
        executionOrder.push('second');
        throw new Error('boom');
      }),
      enqueue(async () => {
        executionOrder.push('third');
      }),
    ]);

    expect(executionOrder).toEqual(['first', 'second', 'third']);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
