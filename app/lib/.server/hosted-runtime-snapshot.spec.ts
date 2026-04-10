import { describe, expect, it, vi, afterEach } from 'vitest';
import { fetchHostedRuntimeSnapshotForRequest, resolveHostedRuntimeBaseUrlForRequest } from './hosted-runtime-snapshot';

describe('resolveHostedRuntimeBaseUrlForRequest', () => {
  it('uses the local runtime for localhost', () => {
    expect(resolveHostedRuntimeBaseUrlForRequest('http://127.0.0.1:5173/api/chat')).toBe(
      'http://127.0.0.1:4321/runtime',
    );
  });

  it('routes Pages requests to alpha1 runtime', () => {
    expect(resolveHostedRuntimeBaseUrlForRequest('https://bolt-gives.pages.dev/api/chat')).toBe(
      'https://alpha1.bolt.gives/runtime',
    );
  });

  it('uses the same origin runtime for hosted domains', () => {
    expect(resolveHostedRuntimeBaseUrlForRequest('https://alpha1.bolt.gives/api/chat')).toBe(
      'https://alpha1.bolt.gives/runtime',
    );
  });
});

describe('fetchHostedRuntimeSnapshotForRequest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns hosted files when the runtime snapshot exists', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          files: {
            'src/App.tsx': {
              type: 'file',
              content: 'export default function App() { return null; }',
              isBinary: false,
            },
          },
        }),
      }),
    );

    await expect(
      fetchHostedRuntimeSnapshotForRequest({
        requestUrl: 'https://alpha1.bolt.gives/api/chat',
        sessionId: 'session-123',
      }),
    ).resolves.toMatchObject({
      'src/App.tsx': expect.objectContaining({
        type: 'file',
      }),
    });
  });

  it('returns null when the runtime snapshot is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
      }),
    );

    await expect(
      fetchHostedRuntimeSnapshotForRequest({
        requestUrl: 'https://alpha1.bolt.gives/api/chat',
        sessionId: 'session-123',
      }),
    ).resolves.toBeNull();
  });
});
