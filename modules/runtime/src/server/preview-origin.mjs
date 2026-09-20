import crypto from 'node:crypto';
import { readPreviewBrowserError } from './preview-browser-monitor.mjs';

const COOKIE = '__Host-bolt_preview';
const LOCAL_COOKIE = 'bolt_preview';

export function createPreviewOrigin({
  template,
  secret,
  lookup,
  healthy = () => false,
  onError = () => undefined,
  now = Date.now,
}) {
  if (!template) {
    return null;
  }

  if (!secret || secret.length < 32 || template.split('{id}').length !== 2) {
    throw new Error('Isolated Preview requires an origin template and a signing secret of at least 32 characters.');
  }

  const probe = new URL(template.replace('{id}', 'pv-check'));
  const local = probe.protocol === 'http:' && probe.hostname.endsWith('.localhost');

  if (
    (!local && probe.protocol !== 'https:') ||
    probe.pathname !== '/' ||
    probe.search ||
    probe.hash ||
    probe.username ||
    probe.password ||
    !probe.hostname.startsWith('pv-check.')
  ) {
    throw new Error('Preview template must be https://{id}.<preview-domain>, or HTTP *.localhost for private testing.');
  }

  const suffix = probe.host.slice('pv-check'.length);
  const originFor = (id) => template.replace('{id}', id).replace(/\/$/, '');
  const sign = (value) => crypto.createHmac('sha256', secret).update(value).digest('base64url');
  const hostId = (sessionId) =>
    `pv-${crypto.createHmac('sha256', secret).update(`host:${sessionId}`).digest('hex').slice(0, 32)}`;
  const encode = (value) => {
    const data = Buffer.from(JSON.stringify(value)).toString('base64url');
    return `${data}.${sign(data)}`;
  };
  const decode = (token) => {
    if (typeof token !== 'string' || token.length > 2048) {
      return null;
    }

    const [data, signature, extra] = token.split('.');

    if (!data || !signature || extra || !/^[A-Za-z0-9_-]+$/.test(data) || !/^[A-Za-z0-9_-]{43}$/.test(signature)) {
      return null;
    }

    const expected = sign(data);

    if (
      signature.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
      return null;
    }

    try {
      const value = JSON.parse(Buffer.from(data, 'base64url').toString());

      if (
        !Number.isFinite(value.expires) ||
        value.expires <= now() ||
        !/^[a-zA-Z0-9_-]{1,96}$/.test(value.sessionId) ||
        value.host !== hostId(value.sessionId)
      ) {
        return null;
      }

      return value;
    } catch {
      return null;
    }
  };
  const isHost = (host) => {
    const value = String(host || '').toLowerCase();
    return value.endsWith(suffix) && value.startsWith('pv-');
  };
  const cookieName = local ? LOCAL_COOKIE : COOKIE;
  const errorWindows = new WeakMap();
  const certificateHosts = new Map();
  const headers = {
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Origin-Agent-Cluster': '?1',
  };
  const deny = (res, status = 403) => {
    res.writeHead(status, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Preview access expired or unavailable. Refresh Preview from your project.');
  };

  function authorize(req) {
    const host = String(req.headers.host || '').toLowerCase();

    if (!isHost(host)) {
      return null;
    }

    const pairs = String(req.headers.cookie || '')
      .split(';')
      .map((part) => part.trim());
    const value = decode(pairs.find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1));

    if (!value || `${value.host}${suffix}` !== host || value.kind !== 'access') {
      return null;
    }

    const session = lookup(value.sessionId);
    const url = new URL(req.url || '/', originFor(value.host));
    const isHealthRead = req.method === 'GET' && url.pathname === '/__bolt/health';

    if (!session || (!session.preview?.port && !isHealthRead)) {
      return null;
    }

    if (req.headers.origin && req.headers.origin !== url.origin) {
      return null;
    }

    const match = url.pathname.match(/^\/runtime\/preview\/([^/]+)\/(\d+)(\/.*)?$/);

    if (url.pathname.startsWith('/runtime/') && (!match || match[1] !== value.sessionId)) {
      return null;
    }

    const tail = match ? match[3] || '/' : url.pathname;

    return { value, session, url, upstreamUrl: `${tail}${url.search}` };
  }

  return {
    isHost,
    permitsCertificate(host) {
      const id = certificateHosts.get(String(host || '').toLowerCase());
      return Boolean(id && lookup(id)?.preview?.port);
    },
    url(sessionId, port) {
      const host = hostId(sessionId);
      certificateHosts.set(`${host}${suffix}`, sessionId);

      const token = encode({ sessionId, host, kind: 'bootstrap', expires: now() + 5 * 60_000 });

      return `${originFor(host)}/runtime/preview/${sessionId}/${port}/?__bolt_isolated=1&__bolt_token=${token}`;
    },
    authorize,
    handle(req, res, proxy) {
      if (!isHost(req.headers.host)) {
        return false;
      }

      const url = new URL(req.url || '/', `${probe.protocol}//${req.headers.host}`);
      const bootstrap = decode(url.searchParams.get('__bolt_token'));

      if (url.searchParams.has('__bolt_token')) {
        const match = url.pathname.match(/^\/runtime\/preview\/([^/]+)\/\d+\/$/);

        if (
          req.method !== 'GET' ||
          !bootstrap ||
          bootstrap.kind !== 'bootstrap' ||
          `${bootstrap.host}${suffix}` !== req.headers.host ||
          match?.[1] !== bootstrap.sessionId ||
          !lookup(bootstrap.sessionId)?.preview?.port
        ) {
          deny(res);
          return true;
        }

        const access = encode({ ...bootstrap, kind: 'access', expires: now() + 60 * 60_000 });
        url.searchParams.delete('__bolt_token');
        res.writeHead(303, {
          ...headers,
          Location: `/${url.search}`,
          'Set-Cookie': `${cookieName}=${access}; Path=/; HttpOnly; SameSite=None; Secure; Partitioned; Max-Age=3600`,
        });
        res.end();

        return true;
      }

      const authorized = authorize(req);

      if (!authorized) {
        deny(res);
        return true;
      }

      if (url.pathname === '/__bolt/health') {
        if (req.method !== 'GET') {
          deny(res, 405);
          return true;
        }

        // A repair document can inspect only its own readiness, never platform logs or secrets.
        const port = authorized.session.preview?.port;
        const ready = Boolean(port && healthy(authorized.session));
        res.writeHead(200, { ...headers, 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            healthy: ready,
            previewOwnershipConfirmed: ready,
            preview: port ? { baseUrl: `/runtime/preview/${authorized.value.sessionId}/${port}/` } : null,
          }),
        );

        return true;
      }

      if (url.pathname === '/__bolt/error') {
        if (req.method !== 'POST') {
          deny(res, 405);
          return true;
        }

        const window = errorWindows.get(authorized.session);
        const current = window && window.until > now() ? window : { until: now() + 60_000, count: 0 };
        errorWindows.set(authorized.session, current);

        if (++current.count > 3) {
          req.resume();
          deny(res, 429);

          return true;
        }

        const deadline = setTimeout(() => req.destroy(), 5000);
        void readPreviewBrowserError(req)
          .then((error) => {
            onError(authorized.session, error);
            res.writeHead(202, headers);
            res.end();
          })
          .catch(() => {
            if (!res.destroyed && !res.writableEnded) {
              deny(res, 400);
            }
          })
          .finally(() => clearTimeout(deadline));

        return true;
      }

      // No control-plane routes or platform/browser credentials reach the generated server.
      req.headers.cookie = String(req.headers.cookie || '')
        .split(';')
        .filter((part) => !part.trim().startsWith(`${cookieName}=`))
        .join(';');
      req.url = `/runtime/preview/${authorized.value.sessionId}/${authorized.session.preview.port}${authorized.upstreamUrl}`;
      req.boltIsolatedPreview = true;

      for (const [key, value] of Object.entries(headers)) {
        res.setHeader(key, value);
      }
      proxy(req, res, new URL(req.url, 'http://preview.internal').pathname);

      return true;
    },
  };
}
