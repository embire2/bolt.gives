import { afterEach, describe, expect, it, vi } from 'vitest';
import { enforceDataStreamDeadline } from './data-stream-deadline';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

describe('enforceDataStreamDeadline', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits a recoverable error frame and closes a stalled stream at the deadline', async () => {
    vi.useFakeTimers();

    const onDeadline = vi.fn();
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('0:"working"\n'));
      },
    });
    const reader = enforceDataStreamDeadline(source, {
      maxDuration: 150_000,
      errorMessage: 'BOLT_STREAM_TIMEOUT: hosted FREE generation exceeded 150000ms',
      onDeadline,
    }).getReader();

    expect(decoder.decode((await reader.read()).value)).toBe('0:"working"\n');

    const errorFrame = reader.read();
    await vi.advanceTimersByTimeAsync(150_000);

    expect(decoder.decode((await errorFrame).value)).toContain('BOLT_STREAM_TIMEOUT');
    expect((await reader.read()).done).toBe(true);
    expect(onDeadline).toHaveBeenCalledTimes(1);
  });

  it('leaves streams unchanged when the deadline is disabled', () => {
    const source = new ReadableStream<Uint8Array>();

    expect(
      enforceDataStreamDeadline(source, {
        maxDuration: 0,
        errorMessage: 'unused',
      }),
    ).toBe(source);
  });
});
