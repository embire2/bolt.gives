import { describe, expect, it, vi } from 'vitest';
import { createPreviewOrigin } from './preview-origin.mjs';

function fixture() {
  let time = 100000;
  const sessions = new Map([
    ['one', { preview: { port: 4100 } }],
    ['two', { preview: { port: 4101 } }],
  ]);
  const gateway = createPreviewOrigin({
    template: 'https://{id}.preview.example.com',
    secret: 'fixture-signing-secret-is-long-enough',
    lookup: (id: string) => sessions.get(id),
    healthy: () => true,
    now: () => time,
  })!;
  const url = new URL(gateway.url('one', 4100));
  const response = {
    status: 0,
    headers: {} as Record<string, string>,
    writeHead(status: number, headers: Record<string, string>) {
      this.status = status;
      this.headers = headers;
    },
    end: vi.fn(),
    setHeader: vi.fn(),
  };
  const request = { method: 'GET', url: `${url.pathname}${url.search}`, headers: { host: url.host, cookie: '' } };
  const proxyCalls: unknown[][] = [];
  const proxy = (...args: unknown[]) => {
    proxyCalls.push(args);
  };

  return {
    gateway,
    url,
    request,
    response,
    proxy,
    proxyCalls,
    sessions,
    advance: () => {
      time += 3600001;
    },
  };
}

describe('isolated Preview capability gateway', () => {
  it('uses a distinct DNS-safe project origin and a secure host-only bootstrap cookie', () => {
    const f = fixture();
    expect(f.url.hostname).toMatch(/^pv-[a-f0-9]{32}\.preview\.example\.com$/);
    expect(new URL(f.gateway.url('two', 4101)).hostname).not.toBe(f.url.hostname);
    expect(f.gateway.handle(f.request, f.response, f.proxy)).toBe(true);
    expect(f.response.status).toBe(303);
    expect(f.response.headers.Location).not.toContain('__bolt_token');
    expect(f.response.headers.Location).toBe('/?__bolt_isolated=1');

    const cookie = f.response.headers['Set-Cookie'];
    expect(cookie).toContain('__Host-bolt_preview=');
    expect(cookie).toContain('HttpOnly; SameSite=None; Secure; Partitioned');
    expect(cookie).not.toContain('Domain=');
    expect(f.response.headers['Referrer-Policy']).toBe('no-referrer');
    expect(f.proxyCalls).toHaveLength(0);
  });

  it('permits certificates only for issued hosts with an existing Preview', () => {
    const f = fixture();
    expect(f.gateway.permitsCertificate(f.url.hostname)).toBe(true);
    expect(f.gateway.permitsCertificate('pv-unknown.preview.example.com')).toBe(false);
    f.sessions.delete('one');
    expect(f.gateway.permitsCertificate(f.url.hostname)).toBe(false);
  });

  it('scopes HTTP access to one project and strips its capability before upstream forwarding', () => {
    const f = fixture();
    f.gateway.handle(f.request, f.response, f.proxy);
    f.request.headers.cookie = f.response.headers['Set-Cookie'].split(';')[0];
    f.request.url = '/runtime/preview/two/4101/';
    f.gateway.handle(f.request, f.response, f.proxy);
    expect(f.response.status).toBe(403);
    expect(f.proxyCalls).toHaveLength(0);
    f.request.url = '/runtime/sessions/one/snapshot';
    expect(f.gateway.authorize(f.request)).toBeNull();
    f.request.url = '/runtime/preview/one/4100/src/App.tsx';
    f.gateway.handle(f.request, f.response, f.proxy);
    expect(f.proxyCalls).toHaveLength(1);
    expect(f.request.headers.cookie).not.toContain('bolt_preview');
  });

  it('rejects missing, tampered, expired, wrong-host and revoked access', () => {
    const f = fixture();
    const access = { ...f.request, url: '/', headers: { ...f.request.headers } };
    expect(f.gateway.authorize(access)).toBeNull();
    f.gateway.handle(f.request, f.response, f.proxy);
    access.headers.cookie = f.response.headers['Set-Cookie'].split(';')[0];
    expect(f.gateway.authorize(access)?.value.sessionId).toBe('one');
    expect(
      f.gateway.authorize({ ...access, headers: { ...access.headers, cookie: `${access.headers.cookie}X` } }),
    ).toBeNull();
    expect(
      f.gateway.authorize({
        ...access,
        headers: { ...access.headers, cookie: access.headers.cookie.replace(/\.[^.]+$/, `.${'\u00e9'.repeat(43)}`) },
      }),
    ).toBeNull();
    expect(
      f.gateway.authorize({
        ...access,
        headers: { ...access.headers, host: new URL(f.gateway.url('two', 4101)).host },
      }),
    ).toBeNull();
    f.sessions.delete('one');
    expect(f.gateway.authorize(access)).toBeNull();
    f.sessions.set('one', { preview: { port: 4100 } });
    f.advance();
    expect(f.gateway.authorize(access)).toBeNull();
  });

  it('exposes only project-scoped readiness to the repair document', () => {
    const f = fixture();
    f.gateway.handle(f.request, f.response, f.proxy);
    f.request.headers.cookie = f.response.headers['Set-Cookie'].split(';')[0];
    f.request.url = '/__bolt/health';
    f.gateway.handle(f.request, f.response, f.proxy);
    expect(f.response.status).toBe(200);
    expect(JSON.parse(f.response.end.mock.lastCall![0])).toEqual({
      healthy: true,
      previewOwnershipConfirmed: true,
      preview: { baseUrl: '/runtime/preview/one/4100/' },
    });
    expect(f.proxyCalls).toHaveLength(0);
    f.request.method = 'POST';
    f.gateway.handle(f.request, f.response, f.proxy);
    expect(f.response.status).toBe(405);
  });

  it('rejects cross-project reads and mutations even with a valid target cookie', () => {
    const f = fixture();
    f.gateway.handle(f.request, f.response, f.proxy);

    const cookie = f.response.headers['Set-Cookie'].split(';')[0];

    for (const method of ['GET', 'POST', 'DELETE']) {
      expect(
        f.gateway.authorize({
          method,
          url: '/api/private',
          headers: { host: f.url.host, cookie, origin: new URL(f.gateway.url('two', 4101)).origin },
        }),
      ).toBeNull();
    }
  });

  it('keeps authenticated repair polling alive while the dev server changes ports', () => {
    const f = fixture();
    f.gateway.handle(f.request, f.response, f.proxy);
    f.request.headers.cookie = f.response.headers['Set-Cookie'].split(';')[0];
    f.sessions.set('one', { preview: { port: 0 } });
    f.request.url = '/__bolt/health';
    expect(f.gateway.authorize({ ...f.request, headers: { ...f.request.headers, cookie: '' } })).toBeNull();
    expect(f.gateway.authorize({ ...f.request, method: 'POST' })).toBeNull();
    f.gateway.handle(f.request, f.response, f.proxy);
    expect(f.response.status).toBe(200);
    expect(JSON.parse(f.response.end.mock.lastCall![0])).toEqual({
      healthy: false,
      previewOwnershipConfirmed: false,
      preview: null,
    });
    f.request.url = '/src/App.tsx';
    expect(f.gateway.authorize(f.request)).toBeNull();
    f.request.url = '/__bolt/health';
    f.sessions.set('one', { preview: { port: 4200 } });
    f.gateway.handle(f.request, f.response, f.proxy);
    expect(JSON.parse(f.response.end.mock.lastCall![0]).preview.baseUrl).toBe('/runtime/preview/one/4200/');
    f.sessions.delete('one');
    expect(f.gateway.authorize(f.request)).toBeNull();
    expect(f.proxyCalls).toHaveLength(0);
  });

  it('fails closed for invalid origin/secret configuration', () => {
    expect(createPreviewOrigin({ template: '', secret: '', lookup: () => null })).toBeNull();

    for (const template of [
      'http://{id}.example.com',
      'https://app.example.com/{id}',
      'https://{id}.example.com/?token=x',
    ]) {
      expect(() => createPreviewOrigin({ template, secret: 'x'.repeat(32), lookup: () => null })).toThrow();
    }
  });
});
