import Cookies from 'js-cookie';

const API_KEYS_COOKIE_NAME = 'apiKeys';
const API_KEYS_SECURE_STORAGE_KEY = 'cody-agent:api-keys:v1';
const API_KEYS_KEYRING_STORAGE_KEY = 'cody-agent:api-keys:key:v1';
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

async function getOrCreateSecureStorageKey() {
  if (!canUseSecureStorage()) {
    return null;
  }

  const storedKey = localStorage.getItem(API_KEYS_KEYRING_STORAGE_KEY);

  if (storedKey) {
    return base64ToBytes(storedKey);
  }

  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  localStorage.setItem(API_KEYS_KEYRING_STORAGE_KEY, bytesToBase64(keyBytes));

  return keyBytes;
}

async function importAesKey() {
  const keyBytes = await getOrCreateSecureStorageKey();

  if (!keyBytes) {
    return null;
  }

  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
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

    return JSON.parse(new TextDecoder().decode(plainBuffer)) as Record<string, string>;
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
      parsedKeys = apiKeyMemoizeCache[storedApiKeys] = JSON.parse(storedApiKeys);
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

  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(API_KEYS_SECURE_STORAGE_KEY);
  }
}
