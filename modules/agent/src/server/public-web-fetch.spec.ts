import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { publicWebFetch, resolvePublicDestination } from './public-web-fetch.mjs';

const publicAnswers = async () => [{ address: '93.184.216.34', family: 4 }];

function transport(responses: Array<{ status?: number; headers?: Record<string, string>; body?: string }>) {
  const pins: unknown[] = [];
  const request = vi.fn((_url, options, callback) => {
    const emitter = new EventEmitter() as EventEmitter & { end: () => void; destroy: () => void };

    emitter.destroy = () => {};

    emitter.end = () => {
      options.lookup('example.com', { all: true }, (_error: unknown, addresses: unknown) => pins.push(addresses));
      queueMicrotask(() => {
        const item = responses.shift() || {};
        const response = Object.assign(Readable.from([Buffer.from(item.body || '')]), {
          statusCode: item.status || 200,
          headers: item.headers || {},
        });
        callback(response);
      });
    };

    return emitter;
  });

  return { request, pins };
}

describe('bounded, DNS-pinned public fetching', () => {
  it('rejects mixed public/private DNS answers without opening a connection', async () => {
    const request = vi.fn();
    await expect(
      publicWebFetch('https://example.com', {
        request,
        resolve: async () => [
          { address: '8.8.8.8', family: 4 },
          { address: '127.0.0.1', family: 4 },
        ],
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(request).not.toHaveBeenCalled();
  });
  it('pins the original validated address rather than performing another lookup', async () => {
    const fixture = transport([{ body: 'Public page' }]);
    const resolve = vi.fn(publicAnswers);
    const result = await publicWebFetch('https://example.com', { ...fixture, resolve });
    expect(result.body.toString()).toBe('Public page');
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(fixture.pins).toEqual([[{ address: '93.184.216.34', family: 4 }]]);
  });
  it('rejects redirects to private literals and rebinding DNS answers', async () => {
    for (const location of ['http://127.0.0.1/secret', 'https://example.com/next']) {
      const fixture = transport([{ status: 302, headers: { location } }]);
      const resolve = vi
        .fn()
        .mockResolvedValueOnce(await publicAnswers())
        .mockResolvedValue([{ address: '::1', family: 6 }]);
      await expect(publicWebFetch('https://example.com', { ...fixture, resolve })).rejects.toMatchObject({
        status: 400,
      });
      expect(fixture.request).toHaveBeenCalledTimes(1);
    }
  });
  it('bounds streaming and advertised payload sizes', async () => {
    for (const response of [{ body: 'too large' }, { headers: { 'content-length': '999999999' } }]) {
      await expect(
        publicWebFetch('https://example.com', { ...transport([response]), resolve: publicAnswers, maxBytes: 4 }),
      ).rejects.toMatchObject({ status: 400 });
    }
  });
  it('aborts a stalled DNS lookup and bounds redirect chains', async () => {
    await expect(
      resolvePublicDestination('https://example.com', {
        resolve: () => new Promise(() => {}),
        signal: AbortSignal.timeout(20),
      }),
    ).rejects.toMatchObject({ name: 'TimeoutError' });

    const fixture = transport(Array.from({ length: 6 }, () => ({ status: 302, headers: { location: '/again' } })));
    await expect(publicWebFetch('https://example.com', { ...fixture, resolve: publicAnswers })).rejects.toThrow(
      'redirect limit',
    );
    expect(fixture.request).toHaveBeenCalledTimes(6);
  });
});
