import { afterEach, describe, expect, it, vi } from 'vitest';
import { securedChatFetch } from './chat-fetch';

afterEach(() => vi.unstubAllGlobals());

describe('chat response stream ownership', () => {
  it('streams incrementally and releases the network reader even when the SDK retains its closed reader', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const original = new Response(
      new ReadableStream<Uint8Array>({
        start(value) {
          controller = value;
        },
      }),
      {
        headers: { 'Content-Type': 'text/event-stream', 'X-Bolt-Stream-Deadline-Ms': '300000' },
      },
    );
    const clone = vi.spyOn(original, 'clone');
    const fetchMock = vi.fn().mockResolvedValue(original);
    vi.stubGlobal('fetch', fetchMock);

    const abort = new AbortController();
    const response = await securedChatFetch('/api/chat', { method: 'POST', signal: abort.signal });
    const reader = response.body!.getReader();
    controller.enqueue(new TextEncoder().encode('0:"first"\n'));
    expect(new TextDecoder().decode((await reader.read()).value)).toBe('0:"first"\n');
    expect(original.body!.locked).toBe(false);
    expect(original.bodyUsed).toBe(true);
    controller.close();
    expect((await reader.read()).done).toBe(true);
    await vi.waitFor(() => expect(clone.mock.results[0].value.body.locked).toBe(false));
    expect(response.body!.locked).toBe(true);
    expect(response.headers.get('X-Bolt-Stream-Deadline-Ms')).toBe('300000');
    expect(new Headers(fetchMock.mock.calls[0][1].headers).has('X-CSRF-Token')).toBe(true);
    expect(fetchMock.mock.calls[0][1].signal).toBe(abort.signal);
  });

  it('propagates cancellation to the network instead of draining a hidden clone', async () => {
    const cancel = vi.fn();
    const original = new Response(new ReadableStream({ cancel }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(original));

    const response = await securedChatFetch('/api/chat');
    await response.body!.cancel('user stopped');
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledWith(['transferred to chat reader', 'user stopped']));
    await vi.waitFor(() => expect(original.body!.locked).toBe(false));
  });

  it('releases a completed network response while the UI is still processing its last chunk', async () => {
    const chunk = new TextEncoder().encode('0:"complete"\n');
    const original = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(chunk);
          controller.close();
        },
      }),
    );
    const clone = vi.spyOn(original, 'clone');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(original));

    const response = await securedChatFetch('/api/chat');

    // No SDK read yet: completion must not depend on a subsequent React render.
    await vi.waitFor(() => expect(clone.mock.results[0].value.body.locked).toBe(false));
    expect(await response.text()).toBe('0:"complete"\n');
  });

  it('bounds read-ahead rather than buffering an arbitrarily large completion', async () => {
    let pulls = 0;
    const original = new Response(
      new ReadableStream({
        pull(controller) {
          pulls++;
          controller.enqueue(new Uint8Array(16 * 1024));
        },
      }),
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(original));

    const response = await securedChatFetch('/api/chat');
    await vi.waitFor(() => expect(pulls).toBeGreaterThanOrEqual(4));
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Four queued chunks, plus one each in the source, transfer and pipe.
    expect(pulls).toBeLessThanOrEqual(7);

    const pausedPulls = pulls;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(pulls).toBe(pausedPulls);
    await response.body!.cancel();
  });

  it('preserves stream failures and HTTP errors rather than reporting success', async () => {
    let controller!: ReadableStreamDefaultController;
    const original = new Response(
      new ReadableStream({
        start(value) {
          controller = value;
        },
      }),
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(original));

    const response = await securedChatFetch('/api/chat');
    controller.error(new Error('upstream disconnected'));
    await expect(response.text()).rejects.toThrow('upstream disconnected');
    await vi.waitFor(() => expect(original.body!.locked).toBe(false));

    const denied = new Response('daily quota', { status: 429 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(denied));
    expect(await securedChatFetch('/api/chat')).toBe(denied);
  });
});
