import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/cloudflare';

/*
 * Production security middleware.
 *
 * This module is runtime-agnostic: it works on Cloudflare Pages/Workers,
 * Node/Docker (Remix-Node), Electron's in-process Remix handler, and Tauri's
 * WebView. It exposes three primitives:
 *
 *   - createSecurityHeaders(env, request) -> Record<string, string>
 *       Produces the CSP + anti-clickjacking + permissions-policy header bag
 *       we want on every response. Reads NODE_ENV from the provided env map,
 *       not from `process.env` (which is empty on Workers).
 *
 *   - checkRateLimit(store, request, endpoint) -> { allowed, resetTime? }
 *       Token-bucket-ish fixed-window limiter. The backing store is
 *       pluggable: in-memory by default, swappable for Cloudflare KV.
 *
 *   - withSecurity(handler, opts)
 *       Thin wrapper for route loaders/actions. Still exported so individual
 *       routes that want opt-in stricter method/rate policies can use it,
 *       but global hardening is now applied at the Cloudflare Pages entry
 *       (`functions/[[path]].ts`) and Remix SSR entry (`entry.server.tsx`),
 *       so every response gets the baseline without per-route plumbing.
 *
 *   - enforceCsrf(request, env) -> Response | null
 *       Double-submit cookie CSRF check for mutating routes. Returns a 403
 *       Response when the check fails, `null` when the request is allowed.
 */

/* ----------------------------------------------------------------------- */
/* Rate-limit store                                                         */
/* ----------------------------------------------------------------------- */

export interface RateLimitStore {
  get(key: string): Promise<{ count: number; resetTime: number } | undefined>;
  set(key: string, value: { count: number; resetTime: number }, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
}

class InMemoryRateLimitStore implements RateLimitStore {
  #map = new Map<string, { count: number; resetTime: number }>();
  #maxEntries: number;

  constructor(maxEntries = 10_000) {
    this.#maxEntries = maxEntries;
  }

  async get(key: string) {
    const entry = this.#map.get(key);

    if (!entry) {
      return undefined;
    }

    if (entry.resetTime < Date.now()) {
      this.#map.delete(key);
      return undefined;
    }

    return entry;
  }

  async set(key: string, value: { count: number; resetTime: number }) {
    // Cheap LRU: when we exceed the cap, drop oldest entries.
    if (this.#map.size >= this.#maxEntries) {
      const excess = this.#map.size - this.#maxEntries + 1;
      let dropped = 0;

      for (const storedKey of this.#map.keys()) {
        this.#map.delete(storedKey);
        dropped += 1;

        if (dropped >= excess) {
          break;
        }
      }
    }

    this.#map.set(key, value);
  }

  async delete(key: string) {
    this.#map.delete(key);
  }
}

/**
 * KV-backed store; `kv` is a Cloudflare KVNamespace. Typed loosely so we don't
 *  pull in @cloudflare/workers-types as a runtime dep.
 */
type KvLike = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
};

class KvRateLimitStore implements RateLimitStore {
  #kv: KvLike;

  constructor(kv: KvLike) {
    this.#kv = kv;
  }

  async get(key: string) {
    try {
      const raw = await this.#kv.get(`rl:${key}`);

      if (!raw) {
        return undefined;
      }

      const parsed = JSON.parse(raw) as { count?: unknown; resetTime?: unknown };

      if (typeof parsed.count !== 'number' || typeof parsed.resetTime !== 'number') {
        return undefined;
      }

      if (parsed.resetTime < Date.now()) {
        return undefined;
      }

      return { count: parsed.count, resetTime: parsed.resetTime };
    } catch {
      return undefined;
    }
  }

  async set(key: string, value: { count: number; resetTime: number }, ttlMs: number) {
    try {
      await this.#kv.put(`rl:${key}`, JSON.stringify(value), {
        expirationTtl: Math.max(60, Math.ceil(ttlMs / 1000)),
      });
    } catch {
      /*
       * KV occasionally fails closed; fall back to allowing the request rather
       * than denying legitimate traffic on a transient storage error.
       */
    }
  }

  async delete(key: string) {
    try {
      await this.#kv.delete(`rl:${key}`);
    } catch {
      // See set() — never block user traffic on a KV delete error.
    }
  }
}

let defaultStore: RateLimitStore = new InMemoryRateLimitStore();

/**
 * Called once during app bootstrap (or per-request on CF) to install a
 *  distributed store. Safe to call with `undefined` — keeps the in-memory
 *  fallback.
 */
export function setRateLimitStore(store: RateLimitStore | undefined) {
  defaultStore = store ?? new InMemoryRateLimitStore();
}

export function getRateLimitStore(): RateLimitStore {
  return defaultStore;
}

/**
 * Build a KV-backed store from a Cloudflare KV binding. Returns `undefined`
 *  if the binding looks invalid, so callers can transparently fall back to
 *  the in-memory store.
 */
export function createKvRateLimitStore(binding: unknown): RateLimitStore | undefined {
  if (
    !binding ||
    typeof binding !== 'object' ||
    typeof (binding as any).get !== 'function' ||
    typeof (binding as any).put !== 'function' ||
    typeof (binding as any).delete !== 'function'
  ) {
    return undefined;
  }

  return new KvRateLimitStore(binding as any);
}

/* ----------------------------------------------------------------------- */
/* Rate-limit rules                                                         */
/* ----------------------------------------------------------------------- */

type RateLimitRule = { windowMs: number; maxRequests: number };

const RATE_LIMITS: Array<{ pattern: RegExp; rule: RateLimitRule }> = [
  // Tight buckets for expensive / sensitive endpoints.
  { pattern: /^\/api\/llmcall$/, rule: { windowMs: 60_000, maxRequests: 10 } },
  { pattern: /^\/api\/chat$/, rule: { windowMs: 60_000, maxRequests: 30 } },
  { pattern: /^\/api\/enhancer$/, rule: { windowMs: 60_000, maxRequests: 20 } },
  { pattern: /^\/api\/netlify(?:-[^/]+)?$/, rule: { windowMs: 60_000, maxRequests: 20 } },
  { pattern: /^\/api\/vercel(?:-[^/]+)?$/, rule: { windowMs: 60_000, maxRequests: 20 } },
  { pattern: /^\/api\/github(?:-[^/]+)?$/, rule: { windowMs: 60_000, maxRequests: 30 } },
  { pattern: /^\/api\/gitlab(?:-[^/]+)?$/, rule: { windowMs: 60_000, maxRequests: 30 } },
  { pattern: /^\/api\/supabase(?:\.[^/]+)?$/, rule: { windowMs: 60_000, maxRequests: 30 } },
  { pattern: /^\/api\/bug-report$/, rule: { windowMs: 15 * 60_000, maxRequests: 10 } },
  { pattern: /^\/api\/export-api-keys$/, rule: { windowMs: 15 * 60_000, maxRequests: 5 } },

  // Generous default for everything else under /api.
  { pattern: /^\/api\//, rule: { windowMs: 15 * 60_000, maxRequests: 200 } },
];

function findRule(pathname: string): RateLimitRule | undefined {
  for (const { pattern, rule } of RATE_LIMITS) {
    if (pattern.test(pathname)) {
      return rule;
    }
  }

  return undefined;
}

/* ----------------------------------------------------------------------- */
/* Client IP extraction                                                     */
/* ----------------------------------------------------------------------- */

export function getClientIP(request: Request): string {
  const cfIp = request.headers.get('cf-connecting-ip');

  if (cfIp) {
    return cfIp;
  }

  const realIp = request.headers.get('x-real-ip');

  if (realIp) {
    return realIp;
  }

  const forwardedFor = request.headers.get('x-forwarded-for');

  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();

    if (first) {
      return first;
    }
  }

  return 'unknown';
}

/* ----------------------------------------------------------------------- */
/* Rate-limit check                                                         */
/* ----------------------------------------------------------------------- */

export async function checkRateLimit(
  request: Request,
  endpoint: string,
  store: RateLimitStore = defaultStore,
): Promise<{ allowed: boolean; resetTime?: number; remaining?: number; limit?: number }> {
  const rule = findRule(endpoint);

  if (!rule) {
    return { allowed: true };
  }

  const clientIp = getClientIP(request);
  const key = `${clientIp}:${endpoint}`;
  const now = Date.now();

  const existing = await store.get(key);

  if (existing && existing.resetTime > now) {
    if (existing.count >= rule.maxRequests) {
      return {
        allowed: false,
        resetTime: existing.resetTime,
        remaining: 0,
        limit: rule.maxRequests,
      };
    }

    const next = { count: existing.count + 1, resetTime: existing.resetTime };
    await store.set(key, next, next.resetTime - now);

    return {
      allowed: true,
      resetTime: next.resetTime,
      remaining: Math.max(0, rule.maxRequests - next.count),
      limit: rule.maxRequests,
    };
  }

  const resetTime = now + rule.windowMs;
  await store.set(key, { count: 1, resetTime }, rule.windowMs);

  return {
    allowed: true,
    resetTime,
    remaining: rule.maxRequests - 1,
    limit: rule.maxRequests,
  };
}

/* ----------------------------------------------------------------------- */
/* Security headers                                                         */
/* ----------------------------------------------------------------------- */

type EnvLike = Record<string, string | undefined> | undefined | null;

function isProduction(env: EnvLike): boolean {
  const fromEnv = env?.NODE_ENV;

  if (typeof fromEnv === 'string') {
    return fromEnv === 'production';
  }

  // Fall back to process.env when present (Node / Electron / Tauri / Docker).
  if (typeof process !== 'undefined' && process?.env?.NODE_ENV) {
    return process.env.NODE_ENV === 'production';
  }

  // Workers has no `process.env`; assume production there.
  return typeof process === 'undefined';
}

function getRequestHostname(request?: Request): string {
  if (!request) {
    return '';
  }

  try {
    return new URL(request.url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = String(hostname || '')
    .trim()
    .toLowerCase();

  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '[::1]' ||
    normalized === '::1' ||
    normalized.endsWith('.localhost')
  );
}

/** Returns the full security header set we want applied to every response. */
export function createSecurityHeaders(env?: EnvLike, request?: Request): Record<string, string> {
  const production = isProduction(env);
  const localLoopbackRequest = isLoopbackHostname(getRequestHostname(request));

  /*
   * CSP notes:
   *
   *  - We keep 'unsafe-inline' for style-src because Tailwind + Radix inject
   *    inline styles at runtime; moving to nonces requires a larger UI pass.
   *  - We keep 'unsafe-eval' for script-src only outside production so
   *    Vite/HMR work; in production we drop it. The WebContainer worker
   *    iframe runs in its own origin and is covered by `frame-src blob:`.
   *  - `connect-src` is permissive because the agent fans out to many
   *    provider APIs (OpenAI, Anthropic, Gemini, Groq, GitHub, Netlify,
   *    Vercel, Supabase, etc.). We keep it `https:` + `wss:` rather than
   *    blanket-allow http, which blocks mixed-content downgrade attacks.
   */
  const scriptSrc = production
    ? "'self' 'unsafe-inline' blob: https://*.bolt.gives https://bolt.gives"
    : "'self' 'unsafe-inline' 'unsafe-eval' blob:";
  const connectSrc = localLoopbackRequest
    ? /*
       * Chromium rejects bracketed IPv6 loopback sources here, so keep the
       * loopback allowances to the forms WebContainer/provider traffic
       * actually uses in practice.
       */
      "'self' https: wss: blob: http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*"
    : "'self' https: wss: blob:";

  const csp = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline' https:",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    `connect-src ${connectSrc}`,
    "worker-src 'self' blob:",
    "frame-src 'self' blob: https:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(localLoopbackRequest ? [] : ['upgrade-insecure-requests']),
  ].join('; ');

  const headers: Record<string, string> = {
    'Content-Security-Policy': csp,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  };

  if (production) {
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload';
  }

  /*
   * Include a request-id if the upstream proxy set one; otherwise mint a new
   * one so logs stay correlatable.
   */
  const requestId = request?.headers.get('x-request-id') ?? generateRequestId();
  headers['X-Request-Id'] = requestId;

  return headers;
}

function generateRequestId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') {
      return (crypto as any).randomUUID();
    }
  } catch {
    // fallthrough
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/* ----------------------------------------------------------------------- */
/* CSRF (double-submit cookie)                                              */
/* ----------------------------------------------------------------------- */

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function parseCookies(header: string | null): Record<string, string> {
  if (!header) {
    return {};
  }

  const out: Record<string, string> = {};

  for (const part of header.split(';')) {
    const trimmed = part.trim();

    if (!trimmed) {
      continue;
    }

    const eq = trimmed.indexOf('=');

    if (eq < 0) {
      continue;
    }

    const name = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    out[name] = decodeURIComponent(value);
  }

  return out;
}

/**
 * Returns a `Response` when CSRF validation fails, or `null` when the
 *  request may proceed. Safe methods (GET/HEAD/OPTIONS) always pass.
 */
export function enforceCsrf(request: Request, env?: EnvLike): Response | null {
  if (CSRF_SAFE_METHODS.has(request.method)) {
    return null;
  }

  const url = new URL(request.url);

  /*
   * Same-origin or same-site POST from our own UI is fine; we use
   * Origin/Referer as a pre-check before requiring the token, so the static
   * UI (which may not carry the cookie on first POST) still works when the
   * caller is clearly us.
   */
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const expectedHost = url.host;

  const sameOrigin = (origin && tryHost(origin) === expectedHost) || (referer && tryHost(referer) === expectedHost);

  if (!sameOrigin) {
    return new Response(JSON.stringify({ error: 'Cross-origin request blocked' }), {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
        ...createSecurityHeaders(env, request),
      },
    });
  }

  /*
   * Double-submit cookie check — accept either cookie+header match, or a
   * well-formed Bearer-style API key header used by first-party tooling.
   */
  const cookies = parseCookies(request.headers.get('cookie'));
  const cookieToken = cookies[CSRF_COOKIE_NAME];
  const headerToken = request.headers.get(CSRF_HEADER_NAME);

  if (cookieToken && headerToken && cookieToken === headerToken) {
    return null;
  }

  /*
   * Allow unauthenticated POSTs to select public endpoints that can't carry
   * cookies yet (e.g. initial bootstrap). Keep the list narrow.
   */
  const allowListNoCsrf = new Set<string>(['/api/health', '/api/sessions']);

  if (allowListNoCsrf.has(url.pathname)) {
    return null;
  }

  return new Response(JSON.stringify({ error: 'CSRF token missing or invalid' }), {
    status: 403,
    headers: {
      'Content-Type': 'application/json',
      ...createSecurityHeaders(env, request),
    },
  });
}

function tryHost(urlish: string): string | null {
  try {
    return new URL(urlish).host;
  } catch {
    return null;
  }
}

/* ----------------------------------------------------------------------- */
/* Validation + sanitizers                                                  */
/* ----------------------------------------------------------------------- */

export function validateApiKeyFormat(apiKey: string, provider: string): boolean {
  if (!apiKey || typeof apiKey !== 'string') {
    return false;
  }

  if (apiKey.includes('your_') || apiKey.includes('here') || apiKey.includes('xxxx')) {
    return false;
  }

  const minLengths: Record<string, number> = {
    anthropic: 50,
    openai: 40,
    groq: 30,
    google: 30,
    github: 30,
    netlify: 30,
  };

  const minLength = minLengths[provider.toLowerCase()] ?? 20;

  return apiKey.length >= minLength;
}

export function sanitizeErrorMessage(error: unknown, env?: EnvLike): string {
  if (!isProduction(env)) {
    return error instanceof Error ? error.message : String(error);
  }

  if (error instanceof Error) {
    const m = error.message.toLowerCase();

    if (m.includes('api key') || m.includes('token') || m.includes('secret') || m.includes('password')) {
      return 'Authentication failed';
    }

    if (m.includes('rate limit') || m.includes('429')) {
      return 'Rate limit exceeded. Please try again later.';
    }

    if (m.includes('timeout') || m.includes('timed out')) {
      return 'Upstream request timed out.';
    }
  }

  return 'An unexpected error occurred.';
}

/* ----------------------------------------------------------------------- */
/* Per-route opt-in wrapper                                                 */
/* ----------------------------------------------------------------------- */

export function withSecurity<T extends (args: ActionFunctionArgs | LoaderFunctionArgs) => Promise<Response>>(
  handler: T,
  options: {
    rateLimit?: boolean;
    allowedMethods?: string[];
    requireCsrf?: boolean;
  } = {},
) {
  return async (args: ActionFunctionArgs | LoaderFunctionArgs): Promise<Response> => {
    const { request, context } = args as { request: Request; context?: any };
    const url = new URL(request.url);
    const endpoint = url.pathname;
    const env = (context?.cloudflare?.env ?? context?.env) as EnvLike;

    if (options.allowedMethods && !options.allowedMethods.includes(request.method)) {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          Allow: options.allowedMethods.join(', '),
          ...createSecurityHeaders(env, request),
        },
      });
    }

    if (options.requireCsrf !== false) {
      const csrf = enforceCsrf(request, env);

      if (csrf) {
        return csrf;
      }
    }

    if (options.rateLimit !== false) {
      const result = await checkRateLimit(request, endpoint);

      if (!result.allowed) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': Math.ceil(((result.resetTime ?? Date.now()) - Date.now()) / 1000).toString(),
            'X-RateLimit-Limit': String(result.limit ?? ''),
            'X-RateLimit-Remaining': String(result.remaining ?? 0),
            'X-RateLimit-Reset': String(result.resetTime ?? ''),
            ...createSecurityHeaders(env, request),
          },
        });
      }
    }

    try {
      const response = await handler(args);
      const merged = new Headers(response.headers);

      for (const [k, v] of Object.entries(createSecurityHeaders(env, request))) {
        // Only set if the route didn't already customize it.
        if (!merged.has(k)) {
          merged.set(k, v);
        }
      }

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: merged,
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: true, message: sanitizeErrorMessage(error, env) }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...createSecurityHeaders(env, request),
        },
      });
    }
  };
}
