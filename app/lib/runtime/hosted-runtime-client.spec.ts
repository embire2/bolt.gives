import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  extractHostedRuntimeSessionIdFromPreviewBaseUrl,
  fetchHostedRuntimeSnapshot,
  fetchHostedRuntimePreviewStatus,
  reportHostedRuntimePreviewAlert,
  resolveHostedRuntimeBaseUrl,
  shouldReloadHostedPreviewIframe,
} from './hosted-runtime-client';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('hosted runtime client', () => {
  it('uses the local runtime service for localhost', () => {
    expect(
      resolveHostedRuntimeBaseUrl({
        host: 'localhost',
        protocol: 'http:',
        originHost: 'localhost:5173',
      }),
    ).toBe('http://127.0.0.1:4321/runtime');
  });

  it('routes pages hosts to alpha1 runtime', () => {
    expect(
      resolveHostedRuntimeBaseUrl({
        host: 'bolt-gives.pages.dev',
        protocol: 'https:',
        originHost: 'bolt-gives.pages.dev',
      }),
    ).toBe('https://alpha1.bolt.gives/runtime');
  });

  it('uses same-host runtime for hosted instances', () => {
    expect(
      resolveHostedRuntimeBaseUrl({
        host: 'alpha1.bolt.gives',
        protocol: 'https:',
        originHost: 'alpha1.bolt.gives',
      }),
    ).toBe('https://alpha1.bolt.gives/runtime');
  });

  it('fetches hosted preview status from the runtime endpoint', async () => {
    vi.stubGlobal('window', {
      location: {
        hostname: 'alpha1.bolt.gives',
        protocol: 'https:',
        host: 'alpha1.bolt.gives',
      },
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sessionId: 'abc123',
        preview: {
          port: 4100,
          baseUrl: 'https://alpha1.bolt.gives/runtime/preview/abc123/4100',
        },
        status: 'ready',
        healthy: true,
        updatedAt: '2026-03-29T08:00:00.000Z',
        recentLogs: [],
        alert: null,
        recovery: {
          state: 'idle',
          token: 0,
          message: null,
          updatedAt: '2026-03-29T08:00:00.000Z',
        },
      }),
    });

    vi.stubGlobal('fetch', fetchMock);

    const status = await fetchHostedRuntimePreviewStatus('abc123');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://alpha1.bolt.gives/runtime/sessions/abc123/preview-status',
      expect.objectContaining({
        method: 'GET',
      }),
    );
    expect(status.status).toBe('ready');
    expect(status.preview?.port).toBe(4100);
  });

  it('fetches the hosted workspace snapshot from the runtime endpoint', async () => {
    vi.stubGlobal('window', {
      location: {
        hostname: 'alpha1.bolt.gives',
        protocol: 'https:',
        host: 'alpha1.bolt.gives',
      },
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        files: {
          '/home/project/src/App.tsx': {
            type: 'file',
            content: 'export default function App() { return null; }',
            isBinary: false,
          },
        },
      }),
    });

    vi.stubGlobal('fetch', fetchMock);

    const files = await fetchHostedRuntimeSnapshot('abc123');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://alpha1.bolt.gives/runtime/sessions/abc123/snapshot',
      expect.objectContaining({
        method: 'GET',
      }),
    );
    expect(files['/home/project/src/App.tsx']?.type).toBe('file');
  });

  it('reports hosted preview alerts back to the runtime service', async () => {
    vi.stubGlobal('window', {
      location: {
        hostname: 'alpha1.bolt.gives',
        protocol: 'https:',
        host: 'alpha1.bolt.gives',
      },
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '',
    });

    vi.stubGlobal('fetch', fetchMock);

    await reportHostedRuntimePreviewAlert('abc123', {
      type: 'error',
      title: 'Preview Error',
      description: 'Unexpected token',
      content: '[plugin:vite:react-babel] Unexpected token',
      source: 'preview',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://alpha1.bolt.gives/runtime/sessions/abc123/preview-alert',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );
  });

  it('extracts the active hosted runtime session id from a preview base url', () => {
    expect(
      extractHostedRuntimeSessionIdFromPreviewBaseUrl('https://alpha1.bolt.gives/runtime/preview/session-abc123/4100'),
    ).toBe('session-abc123');
    expect(extractHostedRuntimeSessionIdFromPreviewBaseUrl('')).toBeNull();
  });

  it('reloads a blocked hosted preview iframe once the preview becomes healthy', () => {
    expect(
      shouldReloadHostedPreviewIframe({
        frameLocation: 'chrome-error://chromewebdata/',
        targetUrl: 'https://alpha1.bolt.gives/runtime/preview/session-abc123/4100/',
        status: {
          healthy: true,
          updatedAt: '2026-03-29T12:00:00.000Z',
        },
        lastReloadKey: null,
      }),
    ).toEqual({
      shouldReload: true,
      reloadKey: 'https://alpha1.bolt.gives/runtime/preview/session-abc123/4100/::2026-03-29T12:00:00.000Z',
    });
  });

  it('does not loop reloads for the same healthy preview status', () => {
    expect(
      shouldReloadHostedPreviewIframe({
        frameLocation: 'chrome-error://chromewebdata/',
        targetUrl: 'https://alpha1.bolt.gives/runtime/preview/session-abc123/4100/',
        status: {
          healthy: true,
          updatedAt: '2026-03-29T12:00:00.000Z',
        },
        lastReloadKey: 'https://alpha1.bolt.gives/runtime/preview/session-abc123/4100/::2026-03-29T12:00:00.000Z',
      }),
    ).toEqual({
      shouldReload: false,
      reloadKey: 'https://alpha1.bolt.gives/runtime/preview/session-abc123/4100/::2026-03-29T12:00:00.000Z',
    });
  });
});
