import Cookies from 'js-cookie';

const API_KEYS_COOKIE_NAME = 'apiKeys';
const API_KEYS_SECURE_STORAGE_KEY = 'cody-agent:api-keys:v1';

/*
 * NOTE: This is best-effort local obfuscation, not XSS-safe key storage.
 *
 * The AES key used to wrap the API keys envelope is persisted in the same
 * browser localStorage bucket as the ciphertext. Any JavaScript running on the
 * same origin (including an XSS payload) can read both values and decrypt the
 * stored API keys. Treat anything that travels through this module as if it
 * were stored in plaintext in localStorage.
 *
 * The only meaningful protection this layer offers is against casual, direct
 * inspection of the ciphertext blob (for example, from a user copying the
 * storage value out-of-band). If proper at-rest protection is required, move
 * key management server-side (HttpOnly endpoint), derive the key from a
 * user-supplied passphrase via a KDF, or use platform credential storage
 * (WebAuthn, OS keystore, IndexedDB with OS-backed protection).
 */
const BEST_EFFORT_KEYRING_STORAGE_KEY = 'cody-agent:api-keys:key:v1';
const apiKeyMemoizeCache: Record<string, Record<string, string>> = {};

function canUseSecureStorage() {
  return (
    typeof window !== 'undefined' &&
    typeof localStorage !== 'undefined' &&
    typeof crypto !== 'undefined' &&
    typeof crypto.subtle !== 'undefined'
  );
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

/*
 * Best-effort only: persists the symmetric key alongside the ciphertext in
 * localStorage. This is obfuscation, not XSS-safe storage. See the comment on
 * BEST_EFFORT_KEYRING_STORAGE_KEY above for mitigation options.
 */
async function getOrCreateBestEffortStorageKey() {
  if (!canUseSecureStorage()) {
    return null;
  }

  const storedKey = localStorage.getItem(BEST_EFFORT_KEYRING_STORAGE_KEY);

  if (storedKey) {
    return base64ToBytes(storedKey);
  }

  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  localStorage.setItem(BEST_EFFORT_KEYRING_STORAGE_KEY, bytesToBase64(keyBytes));

  return keyBytes;
}

async function importAesKey() {
  const keyBytes = await getOrCreateBestEffortStorageKey();

  if (!keyBytes) {
    return null;
  }

  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

function isValidApiKeyRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  for (const entry of Object.values(value as Record<string, unknown>)) {
    if (typeof entry !== 'string') {
      return false;
    }
  }

  return true;
}

async function persistEncryptedApiKeys(apiKeys: Record<string, string>) {
  if (!canUseSecureStorage()) {
    return;
  }

  try {
    const key = await importAesKey();

    if (!key) {
      return;
    }

    const payload = JSON.stringify(apiKeys);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipherBuffer = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      key,
      new TextEncoder().encode(payload),
    );

    const encryptedEnvelope = JSON.stringify({
      iv: bytesToBase64(iv),
      cipherText: bytesToBase64(new Uint8Array(cipherBuffer)),
      version: 1,
    });

    localStorage.setItem(API_KEYS_SECURE_STORAGE_KEY, encryptedEnvelope);
  } catch {
    // Best effort only: cookie remains the source of truth.
  }
}

export async function loadApiKeysFromSecureStorage() {
  if (!canUseSecureStorage()) {
    return {} as Record<string, string>;
  }

  try {
    const encryptedEnvelope = localStorage.getItem(API_KEYS_SECURE_STORAGE_KEY);

    if (!encryptedEnvelope) {
      return {} as Record<string, string>;
    }

    const parsed = JSON.parse(encryptedEnvelope) as { iv?: string; cipherText?: string };

    if (!parsed.iv || !parsed.cipherText) {
      return {} as Record<string, string>;
    }

    const key = await importAesKey();

    if (!key) {
      return {} as Record<string, string>;
    }

    const plainBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: base64ToBytes(parsed.iv),
      },
      key,
      base64ToBytes(parsed.cipherText),
    );

    const decoded = JSON.parse(new TextDecoder().decode(plainBuffer)) as unknown;

    if (!isValidApiKeyRecord(decoded)) {
      return {} as Record<string, string>;
    }

    return decoded;
  } catch {
    return {} as Record<string, string>;
  }
}

export function getApiKeysFromCookies() {
  const storedApiKeys = Cookies.get(API_KEYS_COOKIE_NAME);
  let parsedKeys: Record<string, string> = {};

  if (storedApiKeys) {
    parsedKeys = apiKeyMemoizeCache[storedApiKeys];

    if (!parsedKeys) {
      try {
        const decoded = JSON.parse(storedApiKeys) as unknown;

        if (!isValidApiKeyRecord(decoded)) {
          Cookies.remove(API_KEYS_COOKIE_NAME);
          return {};
        }

        parsedKeys = apiKeyMemoizeCache[storedApiKeys] = decoded;
      } catch {
        Cookies.remove(API_KEYS_COOKIE_NAME);
        return {};
      }
    }

    void persistEncryptedApiKeys(parsedKeys);
  }

  return parsedKeys;
}

export function setApiKeysCookie(apiKeys: Record<string, string>, expiresDays: number = 365) {
  const serialized = JSON.stringify(apiKeys);
  apiKeyMemoizeCache[serialized] = apiKeys;
  Cookies.set(API_KEYS_COOKIE_NAME, serialized, { expires: expiresDays });
  void persistEncryptedApiKeys(apiKeys);
}

export function removeApiKeysCookie() {
  Cookies.remove(API_KEYS_COOKIE_NAME);

  for (const cacheKey of Object.keys(apiKeyMemoizeCache)) {
    delete apiKeyMemoizeCache[cacheKey];
  }

  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(API_KEYS_SECURE_STORAGE_KEY);
    localStorage.removeItem(BEST_EFFORT_KEYRING_STORAGE_KEY);
  }
}
