import type { ServerBuild } from '@remix-run/cloudflare';
import { createPagesFunctionHandler } from '@remix-run/cloudflare-pages';
import {
  createKvRateLimitStore,
  createSecurityHeaders,
  checkRateLimit,
  enforceCsrf,
  setRateLimitStore,
} from '../app/lib/security';

/*
 * Cloudflare Pages entry.
 *
 * This wrapper applies production hardening on every request so individual
 * Remix loaders/actions don't each have to repeat the plumbing:
 *
 *   1. Install a Cloudflare-KV-backed rate-limit store when a `RATE_LIMIT_KV`
 *      binding exists. Without it we fall back to the in-memory limiter,
 *      which is per-isolate (still useful against bursts).
 *   2. CSRF guard on mutating methods for /api/* routes.
 *   3. Fixed-window rate limit per client IP on /api/* routes.
 *   4. Merge a standard security-header bag into every response (CSP,
 *      HSTS, X-Frame-Options, COOP/COEP, etc.).
 *   5. Route-level exceptions for the WebContainer connect/preview pages,
 *      which require cross-origin embedder policy overrides.
 */

interface PagesEnv {
  RATE_LIMIT_KV?: unknown;
  NODE_ENV?: string;
  [key: string]: unknown;
}

const WEBCONTAINER_PREFIXES = ['/webcontainer.connect', '/webcontainer.preview'];

export const onRequest: PagesFunction<PagesEnv> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  // 1. Distributed rate-limit store, if a KV binding is configured.
  const kvStore = createKvRateLimitStore(env?.RATE_LIMIT_KV);
  setRateLimitStore(kvStore);

  // 2. CSRF + 3. rate-limit on API routes only.
  if (url.pathname.startsWith('/api/')) {
    const csrf = enforceCsrf(request, env as Record<string, string | undefined>);

    if (csrf) {
      return csrf;
    }

    const rl = await checkRateLimit(request, url.pathname);

    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': Math.ceil(((rl.resetTime ?? Date.now()) - Date.now()) / 1000).toString(),
          'X-RateLimit-Limit': String(rl.limit ?? ''),
          'X-RateLimit-Remaining': String(rl.remaining ?? 0),
          'X-RateLimit-Reset': String(rl.resetTime ?? ''),
          ...createSecurityHeaders(env as Record<string, string | undefined>, request),
        },
      });
    }
  }

  // Dispatch to Remix.
  const serverBuild = (await import('../build/' + 'server')) as unknown as ServerBuild;

  const handler = createPagesFunctionHandler({
    build: serverBuild,
  });

  const response = await handler(context);

  // 4. Merge security headers. Routes are allowed to override any individual
  // header (e.g. api.chat.ts sets its own Content-Type for SSE).
  const headers = new Headers(response.headers);
  const security = createSecurityHeaders(env as Record<string, string | undefined>, request);

  for (const [key, value] of Object.entries(security)) {
    // 5. The WebContainer preview/connect routes need relaxed COEP so the
    // iframe can load cross-origin resources.
    if (
      (key === 'Cross-Origin-Embedder-Policy' || key === 'Cross-Origin-Opener-Policy') &&
      WEBCONTAINER_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
    ) {
      continue;
    }

    if (!headers.has(key)) {
      headers.set(key, value);
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};
