import { describe, expect, it } from 'vitest';
import { createChatStreamResponse } from './chat-stream-response';

describe('chat stream response', () => {
  it('declares the actual AI SDK v1 protocol without hop-by-hop transport headers', async () => {
    const content = '0:"Hello"\nd:{"finishReason":"stop"}\n';
    const response = createChatStreamResponse(new Response(content).body!, 300000);
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(response.headers.get('X-Vercel-AI-Data-Stream')).toBe('v1');
    expect(response.headers.get('Cache-Control')).toBe('no-cache, no-transform');
    expect(response.headers.get('X-Accel-Buffering')).toBe('no');
    expect(response.headers.get('X-Bolt-Stream-Deadline-Ms')).toBe('300000');
    expect(response.headers.has('Connection')).toBe(false);
    expect(response.headers.has('Text-Encoding')).toBe(false);
    expect(await response.text()).toBe(content);
  });

  it('streams before completion and preserves errors instead of reporting a successful EOF', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const response = createChatStreamResponse(
      new ReadableStream({
        start(value) {
          controller = value;
        },
      }),
    );
    const reader = response.body!.getReader();
    const chunk = new TextEncoder().encode('0:"partial"\n');
    controller.enqueue(chunk);
    expect(await reader.read()).toEqual({ done: false, value: chunk });
    expect(response.headers.get('X-Bolt-Stream-Deadline-Ms')).toBe('disabled');
    controller.error(new Error('upstream disconnected'));
    await expect(reader.read()).rejects.toThrow('upstream disconnected');
    reader.releaseLock();
  });
});
