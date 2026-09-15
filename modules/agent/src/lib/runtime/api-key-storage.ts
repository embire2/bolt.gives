import Cookies from 'js-cookie';

const API_KEYS_COOKIE_NAME = 'apiKeys';
const OWNER_COOKIE_NAME = 'bolt_api_key_owner';
const CHANGE_EVENT = 'bolt-api-keys-changed';
const STORAGE_EVENT_KEY = 'bolt-api-key-change';
const LEGACY_STORAGE_KEYS = ['cody-agent:api-keys:v1', 'cody-agent:api-keys:key:v1'];

function ownerName(ownerId?: string | null) {
  return ownerId || 'guest';
}

function clearLegacyStorage() {
  try {
    for (const key of LEGACY_STORAGE_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    // Restricted browser storage must not prevent logout.
  }
}

function notifyKeyChange() {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(CHANGE_EVENT));

  try {
    localStorage.setItem(STORAGE_EVENT_KEY, crypto.randomUUID());
  } catch {
    // Other tabs also recheck cookies when they receive focus.
  }
}

export function getApiKeysFromCookies(ownerId?: string | null): Record<string, string> {
  clearLegacyStorage();

  if (Cookies.get(OWNER_COOKIE_NAME) !== ownerName(ownerId)) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(Cookies.get(API_KEYS_COOKIE_NAME) || '{}');

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    if (Object.values(parsed).some((value) => typeof value !== 'string')) {
      return {};
    }

    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

/*
 * There is deliberately no decrypt-and-restore fallback after logout. Legacy
 * envelopes have no trustworthy owner and shared-origin encryption was not a vault.
 */
export async function loadApiKeysFromSecureStorage(ownerId?: string | null) {
  return getApiKeysFromCookies(ownerId);
}

export function setApiKeysCookie(apiKeys: Record<string, string>, expiresDays = 365, ownerId?: string | null) {
  clearLegacyStorage();

  try {
    const activeOwner = localStorage.getItem('bolt-profile-owner');

    if (activeOwner && activeOwner !== ownerName(ownerId)) {
      return false;
    }
  } catch {
    // Session changes still clear the cookies when storage is restricted.
  }

  const options = {
    expires: expiresDays,
    path: '/',
    sameSite: 'Lax' as const,
    secure: typeof location !== 'undefined' && location.protocol === 'https:',
  };
  Cookies.set(OWNER_COOKIE_NAME, ownerName(ownerId), options);
  Cookies.set(API_KEYS_COOKIE_NAME, JSON.stringify(apiKeys), options);
  notifyKeyChange();

  return true;
}

export function removeApiKeysCookie() {
  Cookies.remove(API_KEYS_COOKIE_NAME, { path: '/' });
  Cookies.remove(OWNER_COOKIE_NAME, { path: '/' });
  clearLegacyStorage();
  notifyKeyChange();
}

export function reconcileApiKeyOwner(ownerId?: string | null) {
  if (Cookies.get(OWNER_COOKIE_NAME) !== ownerName(ownerId)) {
    removeApiKeysCookie();
  } else {
    clearLegacyStorage();
  }
}

export function subscribeToApiKeyChanges(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_EVENT_KEY || event.key === null) {
      listener();
    }
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener('storage', onStorage);
  window.addEventListener('focus', listener);

  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('focus', listener);
  };
}
