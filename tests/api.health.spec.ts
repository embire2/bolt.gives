import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_VERSION } from '@bolt/core/lib/version';
import { loader } from '~/routes/api.health';

afterEach(() => vi.unstubAllGlobals());

async function readiness() {
  return (await loader({
    context: { cloudflare: { env: { BOLT_RUNTIME_CONTROL_URL: 'http://runtime.fixture:4321/runtime' } } },
    request: new Request('https://bolt.gives/api/health?ready=1'),
    params: {},
  } as unknown as Parameters<typeof loader>[0])) as Response;
}

describe('/api/health loader', () => {
  it('does not call downstream services for liveness', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    const response = await loader({
      request: new Request('https://bolt.gives/api/health'),
      context: {},
      params: {},
    } as Parameters<typeof loader>[0]);
    expect(response.status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('verifies the running runtime version and protocol rather than the existence of fetch', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true, version: APP_VERSION, protocolVersion: 1 }));
    vi.stubGlobal('fetch', fetch);

    const response = await readiness();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ready' });
    expect(fetch).toHaveBeenCalledWith(
      'http://runtime.fixture:4321/runtime/health',
      expect.objectContaining({
        redirect: 'manual',
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it.each([
    { ok: true },
    { ok: true, version: '4.0.1', protocolVersion: 1 },
    { ok: true, version: APP_VERSION, protocolVersion: 99 },
    { ok: false, version: APP_VERSION, protocolVersion: 1 },
  ])('rejects incompatible or unready runtimes: %j', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));

    const response = await readiness();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ status: 'degraded' });
  });

  it('redacts network failure details instead of leaking configured URLs or credentials', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('http://user:private-fixture@runtime.fixture')));

    const response = await readiness();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private-fixture');
  });

  it('rejects upstream HTTP errors without reflecting their body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private-fixture', { status: 500 })));

    const response = await readiness();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private-fixture');
  });

  it('reports the checked-in release version when APP_VERSION is not configured', async () => {
    const response = (await loader({
      context: {},
      request: new Request('https://bolt.gives/api/health'),
      params: {},
    } as unknown as Parameters<typeof loader>[0])) as Response;

    const payload = (await response.json()) as { version: string };

    expect(payload.version).toBe(APP_VERSION);
  });

  it('ignores stale deployment APP_VERSION metadata', async () => {
    const response = (await loader({
      context: {
        cloudflare: {
          env: {
            APP_VERSION: '3.2.0',
          },
        },
      },
      request: new Request('https://bolt.gives/api/health'),
      params: {},
    } as unknown as Parameters<typeof loader>[0])) as Response;

    const payload = (await response.json()) as { version: string };

    expect(payload.version).toBe(APP_VERSION);
  });
});
