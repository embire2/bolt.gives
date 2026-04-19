/**
 * Client-side CSRF helper.
 *
 * Pairs with the double-submit cookie check in `app/lib/security.ts`.
 * On first page load we mint a token and stash it in a non-HttpOnly cookie
 * (`csrf_token`) so every subsequent fetch can read it from `document.cookie`
 * and re-echo it in the `X-CSRF-Token` header. The server compares cookie vs.
 * header; an attacker on a different origin can't read the cookie, so they
 * can't forge the matching header.
 *
 * Wrap your outgoing fetches with `securedFetch` (or call `getCsrfToken()`
 * and set the header yourself).
 */

const COOKIE_NAME = 'csrf_token';
const HEADER_NAME = 'X-CSRF-Token';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 12; // 12h

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') {
    return undefined;
  }

  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();

    if (!trimmed) {
      continue;
    }

    const eq = trimmed.indexOf('=');

    if (eq < 0) {
      continue;
    }

    const key = trimmed.slice(0, eq).trim();

    if (key === name) {
      try {
        return decodeURIComponent(trimmed.slice(eq + 1).trim());
      } catch {
        return trimmed.slice(eq + 1).trim();
      }
    }
  }

  return undefined;
}

function writeCookie(name: string, value: string, maxAgeSeconds: number) {
  if (typeof document === 'undefined') {
    return;
  }

  // Lax is sufficient here: we also enforce Origin/Referer server-side.
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax${
    typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''
  }`;
}

function mintToken(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // fallthrough
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 16)}`;
}

export function getCsrfToken(): string {
  const existing = readCookie(COOKIE_NAME);

  if (existing) {
    return existing;
  }

  const token = mintToken();
  writeCookie(COOKIE_NAME, token, COOKIE_MAX_AGE_SECONDS);

  return token;
}

/** Drop-in replacement for `fetch` that injects the CSRF header on
 *  non-GET/HEAD/OPTIONS requests and attaches credentials so the cookie
 *  rides along. */
export async function securedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const needsCsrf = !['GET', 'HEAD', 'OPTIONS'].includes(method);

  const headers = new Headers(init.headers);

  if (needsCsrf && !headers.has(HEADER_NAME)) {
    headers.set(HEADER_NAME, getCsrfToken());
  }

  return fetch(input, {
    credentials: init.credentials ?? 'same-origin',
    ...init,
    headers,
  });
}

export const csrfHeaderName = HEADER_NAME;
export const csrfCookieName = COOKIE_NAME;
