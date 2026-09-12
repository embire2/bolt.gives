import { afterEach, describe, expect, it, vi } from 'vitest';
import { readRuntimeSnapshot } from './snapshot-transport';

afterEach(() => vi.unstubAllGlobals());
describe('runtime snapshot transport', () => {
  it('preserves an empty disk snapshot and excludes legacy generated entries', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ files: {} }))
      .mockResolvedValueOnce(
        Response.json({
          files: {
            '/home/project/.cache/index': { type: 'file', content: 'cache' },
            '/home/project/README.md': { type: 'file', content: 'source' },
          },
        }),
      );
    vi.stubGlobal('fetch', fetch);
    expect(await readRuntimeSnapshot('https://runtime.example/snapshot')).toEqual({});
    expect(Object.keys(await readRuntimeSnapshot('https://runtime.example/snapshot'))).toEqual([
      '/home/project/README.md',
    ]);
  });
  it('retries concurrent revisions within a bounded attempt count', async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(null, { status: 409 })));
    vi.stubGlobal('fetch', fetch);
    await expect(readRuntimeSnapshot('https://runtime.example/snapshot')).rejects.toThrow('409');
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('does not turn a failed read into stale or empty source', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 413 })));
    await expect(readRuntimeSnapshot('https://runtime.example/snapshot')).rejects.toThrow('413');
  });
  it('distinguishes a missing session from a generic proxy 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response('Unknown runtime session', { status: 404 }))
        .mockResolvedValueOnce(new Response('Route not found', { status: 404 })),
    );
    await expect(readRuntimeSnapshot('https://runtime.example/snapshot')).rejects.toMatchObject({
      status: 404,
      sessionMissing: true,
    });
    await expect(readRuntimeSnapshot('https://runtime.example/snapshot')).rejects.toMatchObject({
      status: 404,
      sessionMissing: false,
    });
  });
});
