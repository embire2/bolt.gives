import type { Extension } from '@codemirror/state';
import { yCollab } from 'y-codemirror.next';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import { logStore } from '~/lib/stores/logs';

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

  /*
   * Keep local dev behavior intact. The collab server defaults to 1234, while the
   * web app usually runs on 5173, so using a relative URL here would break dev.
   */
  return resolveDefaultCollaborationServerUrl({
    host: window.location.hostname,
    protocol: window.location.protocol,
    originHost: window.location.host,
  });
}

interface CollaborationBinding {
  filePath: string;
  roomName: string;
  doc: Y.Doc;
  yText: Y.Text;
  provider: WebsocketProvider;
  undoManager: Y.UndoManager;
}

const bindings = new Map<string, CollaborationBinding>();

const userPalette = [
  { color: '#30bced', light: '#30bced33' },
  { color: '#6eeb83', light: '#6eeb8333' },
  { color: '#ffbc42', light: '#ffbc4233' },
  { color: '#ee6352', light: '#ee635233' },
  { color: '#9ac2c9', light: '#9ac2c933' },
  { color: '#8acb88', light: '#8acb8833' },
];

function getSecureRandomIndex(max: number): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const randomBytes = new Uint8Array(1);
    crypto.getRandomValues(randomBytes);
    return randomBytes[0] % max;
  }
  return Math.floor(Math.random() * max);
}

function getRandomColor() {
  return userPalette[getSecureRandomIndex(userPalette.length)];
}

function getOrCreateClientId() {
  if (typeof window === 'undefined') {
    return 'server';
  }

  const key = 'bolt_collab_client_id';
  let clientId = window.localStorage.getItem(key);

  if (!clientId) {
    const randomPart = typeof crypto !== 'undefined' && crypto.getRandomValues
      ? Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(36).padStart(2, '0')).join('')
      : Math.floor(Math.random() * 1_000_000).toString(36);
    clientId = `user-${randomPart}`;
    window.localStorage.setItem(key, clientId);
  }

  return clientId;
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

function toRoomName(filePath: string) {
  return encodeURIComponent(filePath);
}

function createBinding(filePath: string, initialContent: string): CollaborationBinding {
  const doc = new Y.Doc();
  const roomName = toRoomName(filePath);
  const yText = doc.getText('content');
  const undoManager = new Y.UndoManager(yText);
  const provider = new WebsocketProvider(getCollaborationServerUrl(), roomName, doc, {
    connect: true,
    params: {
      path: filePath,
    },
  });

  const color = getRandomColor();
  provider.awareness.setLocalStateField('user', {
    name: getOrCreateClientId(),
    color: color.color,
    colorLight: color.light,
    filePath,
  });

  if (yText.length === 0 && initialContent) {
    yText.insert(0, initialContent);
  }

  provider.on('status', ({ status }) => {
    logStore.logSystem('Collaboration status changed', {
      component: 'collaboration',
      filePath,
      roomName,
      status,
    });
  });

  return {
    filePath,
    roomName,
    doc,
    yText,
    provider,
    undoManager,
  };
}

function getBinding(filePath: string, initialContent: string) {
  let binding = bindings.get(filePath);

  if (!binding) {
    binding = createBinding(filePath, initialContent);
    bindings.set(filePath, binding);
  } else if (binding.yText.length === 0 && initialContent) {
    binding.yText.insert(0, initialContent);
  }

  return binding;
}

export function getCollaborationExtension(filePath: string, initialContent: string): Extension {
  const binding = getBinding(filePath, initialContent);
  return yCollab(binding.yText, binding.provider.awareness, { undoManager: binding.undoManager });
}

export function destroyAllCollaborationBindings() {
  bindings.forEach((binding) => {
    binding.provider.destroy();
    binding.doc.destroy();
  });

  bindings.clear();
}
