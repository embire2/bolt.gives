import { normalizeCredential } from '~/lib/runtime/credentials';

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function parseCookies(cookieHeader: string | null) {
  const cookies: Record<string, string> = {};

  if (!cookieHeader) {
    return cookies;
  }

  const items = cookieHeader.split(';').map((cookie) => cookie.trim());

  items.forEach((item) => {
    const [name, ...rest] = item.split('=');

    if (!name || rest.length === 0) {
      return;
    }

    const decodedName = safeDecodeURIComponent(name.trim());
    const decodedValue = safeDecodeURIComponent(rest.join('=').trim());

    if (!decodedName || decodedValue === null) {
      return;
    }

    cookies[decodedName] = decodedValue;
  });

  return cookies;
}

export function getApiKeysFromCookie(cookieHeader: string | null): Record<string, string> {
  const cookies = parseCookies(cookieHeader);

  if (!cookies.apiKeys) {
    return {};
  }

  try {
    const parsed = JSON.parse(cookies.apiKeys) as Record<string, unknown>;
    const normalized: Record<string, string> = {};

    for (const [providerName, value] of Object.entries(parsed)) {
      const credential = normalizeCredential(value);

      if (!credential) {
        continue;
      }

      normalized[providerName] = credential;
    }

    return normalized;
  } catch {
    return {};
  }
}

export function getProviderSettingsFromCookie(cookieHeader: string | null): Record<string, any> {
  const cookies = parseCookies(cookieHeader);

  if (!cookies.providers) {
    return {};
  }

  try {
    const parsed = JSON.parse(cookies.providers) as Record<string, any>;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
