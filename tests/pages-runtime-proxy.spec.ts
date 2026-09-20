import { describe, expect, it, vi } from 'vitest';
import {
  buildRuntimeProxyHeaders,
  buildRuntimeProxyTargetUrl,
  runtimeProxyBaseUrl,
  buildHostedFreeApiProxyHeaders,
  fetchPagesStaticAsset,
  isStaticAssetRequest,
  normalizeRuntimeControlBaseUrl,
  shouldProxyRuntimeRequest,
  shouldProxyCollaborationRequest,
  shouldProxyHostedFreeApiRequest,
  onRequest,
} from '../functions/[[path]]';

describe('Cloudflare Pages runtime proxy helpers', () => {
  it('rejects hostile admin mutations before rendering on direct and managed origins', async () => {
    for (const env of [{}, { BOLT_RUNTIME_CONTROL_PUBLIC_URL: 'https://bolt.gives/runtime' }]) {
      for (const pathname of ['/admin', '/tenant-admin']) {
        const response = await onRequest({
          request: new Request(`https://bolt.gives${pathname}`, {
            method: 'POST',
            headers: { Origin: 'https://untrusted.example' },
            body: new URLSearchParams({ intent: 'instance-policy' }),
          }),
          env,
        } as never);
        expect(response.status).toBe(403);
        expect(await response.text()).toBe('Cross-origin admin request blocked.');
      }
    }
  });

  it('forwards custom-domain collaboration upgrades to the configured test backend', async () => {
    const upgraded = { status: 101, webSocket: {} } as Response;
    const transport = vi.spyOn(globalThis, 'fetch').mockResolvedValue(upgraded);

    try {
      const response = await onRequest({
        request: new Request('https://alpha.bolt.gives/collab/events?room=owned-fixture', {
          headers: { Upgrade: 'websocket', Origin: 'https://alpha.bolt.gives' },
        }),
        env: { BOLT_RUNTIME_CONTROL_PUBLIC_URL: 'https://alpha1.bolt.gives/runtime' },
      } as never);
      expect(response).toBe(upgraded);

      const [url, options] = transport.mock.calls[0];
      expect(String(url)).toBe('https://alpha1.bolt.gives/collab/events?room=owned-fixture');
      expect(new Headers(options?.headers).get('upgrade')).toBe('websocket');
      expect(new Headers(options?.headers).get('origin')).toBe('https://alpha1.bolt.gives');
      expect(options?.redirect).toBe('manual');
    } finally {
      transport.mockRestore();
    }
  });
  it('rejects cross-origin collaboration requests and self-proxy loops', async () => {
    const transport = vi.spyOn(globalThis, 'fetch');

    try {
      for (const [origin, expected] of [
        ['https://preview.example.com', 403],
        ['https://bolt.gives', 503],
      ] as const) {
        const response = await onRequest({
          request: new Request('https://bolt.gives/collab/events', { headers: { Origin: origin } }),
          env: {},
        } as never);
        expect(response.status).toBe(expected);
      }
      expect(transport).not.toHaveBeenCalled();
      expect(shouldProxyCollaborationRequest('/collab/events')).toBe(true);
      expect(shouldProxyCollaborationRequest('/collaboration')).toBe(false);
    } finally {
      transport.mockRestore();
    }
  });
  it('uses the configured FREE stream relay on custom domains without relaying back to itself', () => {
    const request = new Request('https://alpha.bolt.gives/api/chat', {
      method: 'POST',
      headers: { 'X-Bolt-Selected-Provider': 'FREE' },
    });
    const env = {
      BOLT_HOSTED_FREE_RELAY_ORIGIN: 'https://alpha1.bolt.gives',
      BOLT_HOSTED_FREE_RELAY_SECRET: 'fixture-relay-secret',
    };
    expect(shouldProxyHostedFreeApiRequest(request, env)).toBe(true);
    expect(
      shouldProxyHostedFreeApiRequest(request, { ...env, BOLT_HOSTED_FREE_RELAY_ORIGIN: 'https://alpha.bolt.gives/' }),
    ).toBe(false);
    expect(shouldProxyHostedFreeApiRequest(request, { ...env, BOLT_HOSTED_FREE_RELAY_SECRET: '' })).toBe(false);
    expect(shouldProxyHostedFreeApiRequest(request, { ...env, BOLT_HOSTED_FREE_RELAY_ORIGIN: 'invalid' })).toBe(false);
  });
  it('does not attach a trusted relay credential to a cross-origin caller spoofing relay headers', async () => {
    const transport = vi.spyOn(globalThis, 'fetch');

    try {
      const response = await onRequest({
        request: new Request('https://alpha.bolt.gives/api/chat', {
          method: 'POST',
          headers: {
            Origin: 'https://preview.example.com',
            'X-Bolt-Selected-Provider': 'FREE',
            'X-Bolt-Hosted-Free-Relay': '1',
            'X-Bolt-Hosted-Free-Relay-Secret': 'spoofed',
          },
        }),
        env: {
          BOLT_HOSTED_FREE_RELAY_ORIGIN: 'https://alpha1.bolt.gives',
          BOLT_HOSTED_FREE_RELAY_SECRET: 'fixture-relay-secret',
        },
      } as never);
      expect(response.status).toBe(403);
      expect(transport).not.toHaveBeenCalled();
    } finally {
      transport.mockRestore();
    }
  });
  it('keeps stale-port redirects on the authenticated instance rather than losing its cookie at the central host', async () => {
    const transport = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) =>
      String(url).endsWith('/profile/session')
        ? Response.json({ ok: true, profile: { id: 'fixture' } })
        : new Response(null, {
            status: 307,
            headers: { Location: 'https://alpha1.bolt.gives/runtime/preview/fixture/6100/?revision=2' },
          }),
    );

    try {
      const response = await onRequest({
        request: new Request('https://fixture.pages.dev/runtime/preview/fixture/4100/', {
          headers: {
            Authorization:
              'BoltProfile 01f00000-0000-4000-8000-000000000001.Abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE',
          },
        }),
        env: { BOLT_RUNTIME_CONTROL_PUBLIC_URL: 'https://alpha1.bolt.gives/runtime' },
      } as never);
      expect(response.headers.get('Location')).toBe(
        'https://fixture.pages.dev/runtime/preview/fixture/6100/?revision=2',
      );
    } finally {
      transport.mockRestore();
    }
  });
  it.each(['GET', 'POST'])('never forwards the private admin control plane (%s)', async (method) => {
    const transport = vi.spyOn(globalThis, 'fetch');

    try {
      const response = await onRequest({
        request: new Request('https://example.com/runtime/tenant-admin/status', { method }),
        env: {},
      } as never);
      expect(response.status).toBe(404);
      expect(transport).not.toHaveBeenCalled();
    } finally {
      transport.mockRestore();
    }
  });
  it('does not misreport a runtime outage as a signed-out owner', async () => {
    const credentials = 'BoltProfile 01f00000-0000-4000-8000-000000000001.Abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE';
    const transport = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));

    try {
      const response = await onRequest({
        request: new Request('https://example.com/runtime/sessions/fixture/snapshot', {
          headers: { Authorization: credentials },
        }),
        env: { BOLT_SELF_HOST_MODE: 'single-user' },
      } as never);
      expect(response.status).toBe(503);
      expect(response.headers.get('Retry-After')).toBe('2');
      expect(response.headers.has('Set-Cookie')).toBe(false);
    } finally {
      transport.mockRestore();
    }
  });
  it('requires an owner session for single-user runtime and generation access', async () => {
    for (const pathname of ['/runtime/sessions/fixture/snapshot', '/api/chat']) {
      const response = await onRequest({
        request: new Request(`https://example.com${pathname}`),
        env: { BOLT_SELF_HOST_MODE: 'single-user' },
      } as never);
      expect(response.status).toBe(401);
    }
  });
  it('forwards runtime request streams in the Node production host without a duplex error', async () => {
    const transport = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const forwarded = new Request(url, init);

      if (forwarded.url.endsWith('/profile/session')) {
        return Response.json({ ok: true, profile: { id: 'owned-fixture' } });
      }

      expect(await forwarded.text()).toBe('{"files":{}}');

      return new Response('{}');
    });

    try {
      const response = await onRequest({
        request: new Request('http://phase1.localhost/runtime/sessions/fixture/sync', {
          method: 'POST',
          headers: {
            Authorization:
              'BoltProfile 01f00000-0000-4000-8000-000000000001.Abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE',
          },
          body: '{"files":{}}',
        }),
        env: { BOLT_RUNTIME_CONTROL_URL: 'http://127.0.0.1:4327/runtime' },
      } as never);
      expect(response.status).toBe(200);
      expect(transport).toHaveBeenCalledTimes(2);
    } finally {
      transport.mockRestore();
    }
  });
  it('rejects anonymous project access on hosted instances, not only private owner installs', async () => {
    for (const pathname of ['/runtime/sessions/fixture/snapshot', '/runtime/preview/fixture/4100/']) {
      const response = await onRequest({ request: new Request(`https://example.com${pathname}`), env: {} } as never);
      expect(response.status).toBe(401);
    }
  });
  it.each(['GET', 'POST', 'DELETE'])('blocks generated sibling-origin runtime requests (%s)', async (method) => {
    const transport = vi.spyOn(globalThis, 'fetch');

    try {
      const response = await onRequest({
        request: new Request('https://example.com/runtime/sessions/fixture/snapshot', {
          method,
          headers: { Origin: 'https://pv-fixture.example.com' },
        }),
        env: {},
      } as never);
      expect(response.status).toBe(403);
      expect(transport).not.toHaveBeenCalled();
    } finally {
      transport.mockRestore();
    }
  });
  it('recognizes runtime routes that must be proxied instead of handled by Remix', () => {
    expect(shouldProxyRuntimeRequest('/runtime')).toBe(true);
    expect(shouldProxyRuntimeRequest('/runtime/sessions/session-1/preview-status')).toBe(true);
    expect(shouldProxyRuntimeRequest('/api/chat')).toBe(false);
  });

  it('maps instance-host runtime URLs to the central runtime target', () => {
    expect(
      buildRuntimeProxyTargetUrl(
        'https://clinic-one.pages.dev/runtime/preview/session-1/4100/src/main.tsx?import',
        'https://bolt.gives/runtime',
      ),
    ).toBe('https://bolt.gives/runtime/preview/session-1/4100/src/main.tsx?import');

    expect(normalizeRuntimeControlBaseUrl('https://bolt.gives')).toBe('https://bolt.gives/runtime');
  });

  it('uses the private listener instead of recursively proxying to the public app', () => {
    expect(
      runtimeProxyBaseUrl({
        BOLT_RUNTIME_CONTROL_URL: 'http://127.0.0.1:4322/runtime',
        BOLT_RUNTIME_CONTROL_PUBLIC_URL: 'https://alpha1.bolt.gives/runtime',
      }),
    ).toBe('http://127.0.0.1:4322/runtime');
  });

  it('normalizes an already-validated browser Origin for the server proxy hop', () => {
    const request = new Request('https://instance.pages.dev/runtime/sessions/one/sync', {
      headers: { Origin: 'https://instance.pages.dev' },
    });
    expect(buildRuntimeProxyHeaders(request, 'https://bolt.gives/runtime').get('Origin')).toBe('https://bolt.gives');
  });

  it('preserves the managed instance origin for preview URL generation', () => {
    const request = new Request('https://clinic-one.pages.dev/runtime/sessions/session-1/command', {
      method: 'POST',
      headers: {
        Host: 'clinic-one.pages.dev',
        'Content-Length': '123',
        'X-Test': 'kept',
      },
    });
    const headers = buildRuntimeProxyHeaders(request);

    expect(headers.get('x-bolt-public-origin')).toBe('https://clinic-one.pages.dev');
    expect(headers.get('x-forwarded-host')).toBe('clinic-one.pages.dev');
    expect(headers.get('x-forwarded-proto')).toBe('https');
    expect(headers.get('x-test')).toBe('kept');
    expect(headers.has('host')).toBe(false);
    expect(headers.has('content-length')).toBe(false);
  });

  it('relays managed hosted FREE requests before loading the full Pages route', () => {
    const request = new Request('https://clinic-one.pages.dev/api/chat', {
      method: 'POST',
      headers: {
        Cookie: 'selectedProvider=FREE; csrf_token=test',
        Host: 'clinic-one.pages.dev',
        'Content-Length': '123',
      },
      body: '{}',
    });
    const env = { BOLT_HOSTED_FREE_RELAY_SECRET: 'relay-secret' };

    expect(shouldProxyHostedFreeApiRequest(request, env)).toBe(true);
    expect(
      shouldProxyHostedFreeApiRequest(
        new Request('https://clinic-one.pages.dev/api/chat', {
          method: 'POST',
          headers: { Cookie: 'selectedProvider=OpenAI' },
        }),
        env,
      ),
    ).toBe(false);
    expect(
      shouldProxyHostedFreeApiRequest(
        new Request('https://bolt.gives/api/chat', {
          method: 'POST',
          headers: { Cookie: 'selectedProvider=FREE' },
        }),
        env,
      ),
    ).toBe(false);

    const headers = buildHostedFreeApiProxyHeaders(request, 'relay-secret');
    expect(headers.get('x-bolt-hosted-free-relay')).toBe('1');
    expect(headers.get('x-bolt-hosted-free-relay-secret')).toBe('relay-secret');
    expect(headers.get('x-bolt-forwarded-host')).toBe('clinic-one.pages.dev');
    expect(headers.has('host')).toBe(false);
    expect(headers.has('content-length')).toBe(false);
  });

  it('short-circuits missing static assets before Remix SSR', () => {
    expect(isStaticAssetRequest(new Request('https://alpha1.bolt.gives/app-screenshot.png'))).toBe(true);
    expect(isStaticAssetRequest(new Request('https://alpha1.bolt.gives/assets/missing.js'))).toBe(true);
    expect(isStaticAssetRequest(new Request('https://alpha1.bolt.gives/chat'))).toBe(false);
    expect(
      isStaticAssetRequest(
        new Request('https://alpha1.bolt.gives/api/export.pdf', {
          method: 'POST',
        }),
      ),
    ).toBe(false);
  });

  it('serves existing Pages assets and keeps missing assets lightweight', async () => {
    const existingRequest = new Request('https://alpha1.bolt.gives/assets/app.js');
    const existingResponse = await fetchPagesStaticAsset(existingRequest, {
      ASSETS: {
        fetch: async () =>
          new Response('console.log("loaded")', {
            headers: { 'Content-Type': 'application/javascript' },
          }),
      },
    });
    const missingResponse = await fetchPagesStaticAsset(new Request('https://alpha1.bolt.gives/assets/missing.js'), {
      ASSETS: {
        fetch: async () => new Response('not found', { status: 404 }),
      },
    });

    expect(existingResponse?.status).toBe(200);
    expect(existingResponse?.headers.get('content-type')).toContain('application/javascript');
    expect(await existingResponse?.text()).toContain('loaded');
    expect(missingResponse?.status).toBe(404);
    expect(missingResponse?.headers.get('cache-control')).toBe('no-store');
    expect(await missingResponse?.text()).toBe('');
  });
});
