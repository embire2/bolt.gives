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
    const fetchMock = vi.fn().mockResolvedValue(original);
    vi.stubGlobal('fetch', fetchMock);

    const abort = new AbortController();
    const response = await securedChatFetch('/api/chat', { method: 'POST', signal: abort.signal });
    const reader = response.body!.getReader();
    controller.enqueue(new TextEncoder().encode('0:"first"\n'));
    expect(new TextDecoder().decode((await reader.read()).value)).toBe('0:"first"\n');
    expect(original.body!.locked).toBe(true);
    controller.close();
    expect((await reader.read()).done).toBe(true);
    await vi.waitFor(() => expect(original.body!.locked).toBe(false));
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
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledWith('user stopped'));
    await vi.waitFor(() => expect(original.body!.locked).toBe(false));
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
