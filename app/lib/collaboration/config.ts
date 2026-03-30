const COLLAB_SERVER_STORAGE_KEY = 'bolt_collab_server_url';
const COLLAB_ENABLED_STORAGE_KEY = 'bolt_collab_enabled';
const LOCAL_DEFAULT_COLLAB_SERVER_URL = 'ws://localhost:1234';
const PAGES_DEFAULT_COLLAB_SERVER_URL = 'wss://alpha1.bolt.gives/collab';

export function isLocalCollaborationHost(host: string) {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

export function isBoltPagesCollaborationHost(host: string) {
  return host === 'bolt-gives.pages.dev' || host.endsWith('.bolt-gives.pages.dev');
}

export function resolveDefaultCollaborationServerUrl(options: { host: string; protocol: string; originHost?: string }) {
  const { host, protocol, originHost = host } = options;

  if (isLocalCollaborationHost(host)) {
    return LOCAL_DEFAULT_COLLAB_SERVER_URL;
  }

  if (isBoltPagesCollaborationHost(host)) {
    return PAGES_DEFAULT_COLLAB_SERVER_URL;
  }

  const wsProto = protocol === 'https:' ? 'wss:' : 'ws:';

  return `${wsProto}//${originHost}/collab`;
}

export function isUnsafeStoredCollaborationUrl(rawUrl: string, currentHost: string) {
  try {
    const parsed = new URL(rawUrl);

    if (isLocalCollaborationHost(currentHost) || isLocalCollaborationHost(parsed.hostname)) {
      return !isLocalCollaborationHost(currentHost) && isLocalCollaborationHost(parsed.hostname);
    }

    if (
      isBoltPagesCollaborationHost(currentHost) &&
      (parsed.hostname === currentHost || isBoltPagesCollaborationHost(parsed.hostname))
    ) {
      return true;
    }

    return false;
  } catch {
    return true;
  }
}

export function getDefaultCollaborationServerUrl() {
  if (typeof window === 'undefined') {
    return LOCAL_DEFAULT_COLLAB_SERVER_URL;
  }

  return resolveDefaultCollaborationServerUrl({
    host: window.location.hostname,
    protocol: window.location.protocol,
    originHost: window.location.host,
  });
}

export function isCollaborationEnabled() {
  if (typeof window === 'undefined') {
    return false;
  }

  const value = window.localStorage.getItem(COLLAB_ENABLED_STORAGE_KEY);

  if (value === null) {
    return true;
  }

  return value !== 'false';
}

export function setCollaborationEnabled(enabled: boolean) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(COLLAB_ENABLED_STORAGE_KEY, String(enabled));
}

export function getCollaborationServerUrl() {
  if (typeof window === 'undefined') {
    return LOCAL_DEFAULT_COLLAB_SERVER_URL;
  }

  const stored = window.localStorage.getItem(COLLAB_SERVER_STORAGE_KEY);
  const fallback = getDefaultCollaborationServerUrl();

  if (!stored) {
    return fallback;
  }

  if (isUnsafeStoredCollaborationUrl(stored, window.location.hostname)) {
    window.localStorage.setItem(COLLAB_SERVER_STORAGE_KEY, fallback);
    return fallback;
  }

  return stored;
}

export function setCollaborationServerUrl(url: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(COLLAB_SERVER_STORAGE_KEY, url);
}
