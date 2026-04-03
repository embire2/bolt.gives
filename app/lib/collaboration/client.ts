import type { Extension } from '@codemirror/state';
import type { WebsocketProvider as YWebsocketProvider } from 'y-websocket';
import type { Doc as YDoc, Text as YText, UndoManager as YUndoManager } from 'yjs';
import { logStore } from '~/lib/stores/logs';
import { getCollaborationServerUrl } from './config';

type CollaborationRuntime = {
  yCollab: typeof import('y-codemirror.next').yCollab;
  WebsocketProvider: typeof import('y-websocket').WebsocketProvider;
  Y: typeof import('yjs');
};

interface CollaborationBinding {
  filePath: string;
  roomName: string;
  doc: YDoc;
  yText: YText;
  provider: YWebsocketProvider;
  undoManager: YUndoManager;
}

const bindings = new Map<string, CollaborationBinding>();
let collaborationRuntimePromise: Promise<CollaborationRuntime> | null = null;

const userPalette = [
  { color: '#30bced', light: '#30bced33' },
  { color: '#6eeb83', light: '#6eeb8333' },
  { color: '#ffbc42', light: '#ffbc4233' },
  { color: '#ee6352', light: '#ee635233' },
  { color: '#9ac2c9', light: '#9ac2c933' },
  { color: '#8acb88', light: '#8acb8833' },
];

function loadCollaborationRuntime() {
  if (!collaborationRuntimePromise) {
    collaborationRuntimePromise = Promise.all([import('y-codemirror.next'), import('y-websocket'), import('yjs')]).then(
      ([codemirrorModule, websocketModule, yjsModule]) => ({
        yCollab: codemirrorModule.yCollab,
        WebsocketProvider: websocketModule.WebsocketProvider,
        Y: yjsModule,
      }),
    );
  }

  return collaborationRuntimePromise;
}

function getRandomColor() {
  return userPalette[Math.floor(Math.random() * userPalette.length)];
}

function getOrCreateClientId() {
  if (typeof window === 'undefined') {
    return 'server';
  }

  const key = 'bolt_collab_client_id';
  let clientId = window.localStorage.getItem(key);

  if (!clientId) {
    clientId = `user-${Math.floor(Math.random() * 1_000_000)}`;
    window.localStorage.setItem(key, clientId);
  }

  return clientId;
}

function toRoomName(filePath: string) {
  return encodeURIComponent(filePath);
}

async function createBinding(filePath: string, initialContent: string): Promise<CollaborationBinding> {
  const { WebsocketProvider: websocketProviderClass, Y } = await loadCollaborationRuntime();
  const doc = new Y.Doc();
  const roomName = toRoomName(filePath);
  const yText = doc.getText('content');
  const undoManager = new Y.UndoManager(yText);
  const provider = new websocketProviderClass(getCollaborationServerUrl(), roomName, doc, {
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

async function getBinding(filePath: string, initialContent: string): Promise<CollaborationBinding> {
  let binding = bindings.get(filePath);

  if (!binding) {
    binding = await createBinding(filePath, initialContent);
    bindings.set(filePath, binding);
  } else if (binding.yText.length === 0 && initialContent) {
    binding.yText.insert(0, initialContent);
  }

  return binding;
}

export async function getCollaborationExtension(filePath: string, initialContent: string): Promise<Extension> {
  const [{ yCollab }, binding] = await Promise.all([loadCollaborationRuntime(), getBinding(filePath, initialContent)]);
  return yCollab(binding.yText, binding.provider.awareness, { undoManager: binding.undoManager });
}

export function destroyAllCollaborationBindings() {
  bindings.forEach((binding) => {
    binding.provider.destroy();
    binding.doc.destroy();
  });

  bindings.clear();
}
