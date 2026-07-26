import { useLoaderData, useNavigate, useParams, useSearchParams } from '@remix-run/react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { atom } from 'nanostores';
import type { JSONValue, Message } from 'ai';
import { toast } from 'react-toastify';
import { logStore } from '@bolt/project/lib/stores/logs';
import {
  getMessages,
  getNextId,
  getUrlId,
  openDatabase,
  setMessages,
  duplicateChat,
  createChatFromMessages,
  getSnapshot,
  setSnapshot,
  type IChatMetadata,
} from './db';
import type { FileMap } from '@bolt/core/types/files';
import type { Snapshot } from './types';
import { detectProjectCommands } from '@bolt/core/utils/projectCommands';
import { isHostedRuntimeEnabled } from '@bolt/runtime/lib/runtime/hosted-runtime-client';
import {
  hasRestorableSnapshotFiles,
  resolvePersistedChatRouteId,
  resolvePersistedChatMessages,
  shouldNavigateAfterPersistedMessage,
  shouldPersistSnapshot,
} from './chat-history-utils';
import { rebindHealthyHostedRuntimePreview } from './chat-history-runtime';

export interface ChatHistoryItem {
  id: string;
  urlId?: string;
  description?: string;
  messages: Message[];
  timestamp: string;
  metadata?: IChatMetadata;
}

const persistenceEnabled = !import.meta.env.VITE_DISABLE_PERSISTENCE;
const browserPersistenceEnabled =
  persistenceEnabled && !import.meta.env.SSR && typeof window !== 'undefined' && typeof indexedDB !== 'undefined';

export const db = browserPersistenceEnabled ? await openDatabase() : undefined;

export const chatId = atom<string | undefined>(undefined);
export const description = atom<string | undefined>(undefined);
export const chatMetadata = atom<IChatMetadata | undefined>(undefined);

async function getWorkbenchStore() {
  return (await import('@bolt/project/lib/stores/workbench')).workbenchStore;
}

export function useChatHistory(options: { loadPersistedChat?: boolean } = {}) {
  const navigate = useNavigate();
  const { id: routeParamId } = useParams<{ id?: string }>();
  const { id: loaderId } = useLoaderData<{ id?: string }>();
  const mixedId = resolvePersistedChatRouteId(routeParamId, loaderId);
  const [searchParams] = useSearchParams();
  const loadPersistedChat = options.loadPersistedChat !== false;
  const rewindId = searchParams.get('rewindTo');
  const loadKey = `${mixedId || 'new'}:${rewindId || 'latest'}`;
  const [initialMessages, setInitialMessages] = useState<Message[]>([]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [urlId, setUrlId] = useState<string | undefined>();
  const urlIdRef = useRef<string | undefined>();
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve());

  const takeSnapshot = useCallback(
    async (chatIdx: string, files: FileMap, targetChatId: string, runtimeSessionId: string, chatSummary?: string) => {
      if (!db) {
        return;
      }

      if (!shouldPersistSnapshot(files, chatSummary)) {
        return;
      }

      const snapshot: Snapshot = {
        chatIndex: chatIdx,
        files,
        summary: chatSummary,
        runtimeSessionId,
      };

      try {
        await setSnapshot(db, targetChatId, snapshot);
      } catch (error) {
        console.error('Failed to save snapshot:', error);
        toast.error('Failed to save chat snapshot.');
      }
    },
    [db],
  );

  const restoreSnapshot = useCallback(async (snapshot?: Snapshot, shouldContinue: () => boolean = () => true) => {
    const validSnapshot = snapshot || { chatIndex: '', files: {} };

    if (!hasRestorableSnapshotFiles(validSnapshot) || !shouldContinue()) {
      return;
    }

    const workbenchStore = await getWorkbenchStore();

    if (!shouldContinue()) {
      return;
    }

    if (validSnapshot.runtimeSessionId) {
      workbenchStore.setHostedRuntimeSessionId(validSnapshot.runtimeSessionId);
    }

    await workbenchStore.restoreSnapshot(validSnapshot.files);

    if (!shouldContinue()) {
      return;
    }

    if (validSnapshot.runtimeSessionId && isHostedRuntimeEnabled()) {
      try {
        const rebound = await rebindHealthyHostedRuntimePreview({
          sessionId: validSnapshot.runtimeSessionId,
          applyPreview: (preview) => {
            if (shouldContinue()) {
              workbenchStore.syncHostedPreview(preview);
            }
          },
        });

        if (!shouldContinue() || rebound) {
          return;
        }
      } catch (error) {
        logStore.logWarning('Saved hosted Preview was unavailable; runtime recovery will run', {
          sessionId: validSnapshot.runtimeSessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const files = Object.entries(validSnapshot.files)
      .map(([filePath, value]) => {
        if (value?.type !== 'file') {
          return null;
        }

        return {
          content: value.content,
          path: filePath,
        };
      })
      .filter((file): file is { content: string; path: string } => Boolean(file));
    const projectCommands = await detectProjectCommands(files);

    if (!shouldContinue()) {
      return;
    }

    const runtimeArtifactId = 'restored-project-setup';
    const runtimeMessageId = `snapshot-runtime-${validSnapshot.chatIndex || Date.now()}`;

    workbenchStore.addArtifact({
      id: runtimeArtifactId,
      messageId: runtimeMessageId,
      title: 'Restored Project Runtime',
      type: 'bundled',
    });

    const runtimeActions = [
      projectCommands?.setupCommand
        ? {
            artifactId: runtimeArtifactId,
            messageId: runtimeMessageId,
            actionId: `${runtimeArtifactId}-setup`,
            action: {
              type: 'shell' as const,
              content: projectCommands.setupCommand,
            },
          }
        : null,
      projectCommands?.startCommand
        ? {
            artifactId: runtimeArtifactId,
            messageId: runtimeMessageId,
            actionId: `${runtimeArtifactId}-start`,
            action: {
              type: 'start' as const,
              content: projectCommands.startCommand,
            },
          }
        : null,
    ].filter((action): action is NonNullable<typeof action> => action !== null);

    for (const action of runtimeActions) {
      const existingArtifact = workbenchStore.artifacts.get()[runtimeArtifactId];
      const existingAction = existingArtifact?.runner.actions.get()[action.actionId];

      if (existingAction) {
        continue;
      }

      workbenchStore.addAction(action);
      workbenchStore.runAction(action);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!loadPersistedChat) {
      setLoadedKey(loadKey);

      return () => {
        cancelled = true;
      };
    }

    setLoadedKey(null);
    setInitialMessages([]);
    setUrlId(undefined);
    urlIdRef.current = undefined;
    description.set(undefined);
    chatId.set(undefined);
    chatMetadata.set(undefined);

    if (!db) {
      setLoadedKey(loadKey);

      if (persistenceEnabled) {
        const error = new Error('Chat persistence is unavailable');
        logStore.logError('Chat persistence initialization failed', error);
        toast.error('Chat persistence is unavailable');
      }

      return () => {
        cancelled = true;
      };
    }

    if (!mixedId) {
      setLoadedKey(loadKey);

      return () => {
        cancelled = true;
      };
    }

    const loadStoredChat = async () => {
      try {
        const storedMessages = await getMessages(db, mixedId);

        if (!storedMessages || storedMessages.messages.length === 0) {
          if (!cancelled) {
            navigate('/', { replace: true });
          }

          return;
        }

        // Snapshots are keyed by the internal chat ID, not by the user-facing URL slug.
        const snapshot = await getSnapshot(db, storedMessages.id);
        const restored = resolvePersistedChatMessages(storedMessages.messages, snapshot, rewindId);

        if (cancelled) {
          return;
        }

        if (restored.shouldRestoreSnapshot && snapshot) {
          await restoreSnapshot(snapshot, () => !cancelled);
        }

        if (cancelled) {
          return;
        }

        setInitialMessages(restored.visibleMessages);
        setUrlId(storedMessages.urlId);
        urlIdRef.current = storedMessages.urlId;
        description.set(storedMessages.description);
        chatId.set(storedMessages.id);
        chatMetadata.set(storedMessages.metadata);
        setLoadedKey(loadKey);
      } catch (error) {
        if (cancelled) {
          return;
        }

        console.error(error);
        logStore.logError('Failed to load chat messages or snapshot', error);
        toast.error(`Failed to load chat: ${error instanceof Error ? error.message : String(error)}`);
        navigate('/', { replace: true });
      }
    };

    void loadStoredChat();

    return () => {
      cancelled = true;
    };
  }, [loadKey, loadPersistedChat, mixedId, navigate, restoreSnapshot, rewindId]);

  const storeMessageHistory = useCallback(
    (incomingMessages: Message[], isStreaming: boolean = false) => {
      const queuedPersist = persistQueueRef.current.then(async () => {
        if (!db || incomingMessages.length === 0) {
          return;
        }

        const messages = incomingMessages.filter((message) => !message.annotations?.includes('no-store'));

        if (messages.length === 0) {
          return;
        }

        const workbenchStore = await getWorkbenchStore();
        const { firstArtifact } = workbenchStore;
        let targetChatId = chatId.get();

        if (!targetChatId) {
          targetChatId = await getNextId(db);
          chatId.set(targetChatId);
        }

        let targetUrlId = urlIdRef.current;

        if (!targetUrlId && firstArtifact?.id) {
          targetUrlId = await getUrlId(db, firstArtifact.id);
          urlIdRef.current = targetUrlId;
          setUrlId(targetUrlId);
        }

        let chatSummary: string | undefined;
        const lastMessage = messages[messages.length - 1];

        if (lastMessage.role === 'assistant') {
          const annotations = lastMessage.annotations as JSONValue[];
          const summaryAnnotation = annotations?.find(
            (annotation: JSONValue) =>
              annotation && typeof annotation === 'object' && 'type' in annotation && annotation.type === 'chatSummary',
          ) as { type: string; summary?: string } | undefined;
          chatSummary = summaryAnnotation?.summary;
        }

        if (!description.get() && firstArtifact?.title) {
          description.set(firstArtifact.title);
        }

        const shouldNavigate = shouldNavigateAfterPersistedMessage(messages, isStreaming, Boolean(firstArtifact?.id));

        if (!targetUrlId && shouldNavigate) {
          targetUrlId = targetChatId;
          urlIdRef.current = targetUrlId;
          setUrlId(targetUrlId);
        }

        await setMessages(db, targetChatId, messages, targetUrlId, description.get(), undefined, chatMetadata.get());
        await takeSnapshot(
          lastMessage.id,
          workbenchStore.files.get(),
          targetChatId,
          workbenchStore.hostedRuntimeSessionId,
          chatSummary,
        );

        if (!mixedId && shouldNavigate) {
          navigateChat(navigate, targetUrlId || targetChatId);
        }
      });

      persistQueueRef.current = queuedPersist.catch(() => undefined);

      return queuedPersist;
    },
    [mixedId, navigate, takeSnapshot],
  );

  return {
    ready: loadedKey === loadKey,
    chatKey: loadKey,
    initialMessages,
    updateChatMestaData: async (metadata: IChatMetadata) => {
      const id = chatId.get();

      if (!db || !id) {
        return;
      }

      try {
        const storedMessages = await getMessages(db, id);
        await setMessages(
          db,
          id,
          storedMessages.messages,
          storedMessages.urlId,
          storedMessages.description,
          storedMessages.timestamp,
          metadata,
        );
        chatMetadata.set(metadata);
      } catch (error) {
        toast.error('Failed to update chat metadata');
        console.error(error);
      }
    },
    storeMessageHistory,
    duplicateCurrentChat: async (listItemId: string) => {
      if (!db || (!mixedId && !listItemId)) {
        return;
      }

      try {
        const newId = await duplicateChat(db, mixedId || listItemId);
        navigate(`/chat/${newId}`);
        toast.success('Chat duplicated successfully');
      } catch (error) {
        toast.error('Failed to duplicate chat');
        console.log(error);
      }
    },
    importChat: async (description: string, messages: Message[], metadata?: IChatMetadata) => {
      if (!db) {
        return;
      }

      try {
        const newId = await createChatFromMessages(db, description, messages, metadata);
        window.location.href = `/chat/${newId}`;
        toast.success('Chat imported successfully');
      } catch (error) {
        if (error instanceof Error) {
          toast.error('Failed to import chat: ' + error.message);
        } else {
          toast.error('Failed to import chat');
        }
      }
    },
    exportChat: async (id = urlId || chatId.get()) => {
      if (!db || !id) {
        return;
      }

      const chat = await getMessages(db, id);
      const chatData = {
        messages: chat.messages,
        description: chat.description,
        exportDate: new Date().toISOString(),
      };

      const blob = new Blob([JSON.stringify(chatData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chat-${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  };
}

function navigateChat(navigate: ReturnType<typeof useNavigate>, nextId: string) {
  const targetPath = `/chat/${nextId}`;

  if (window.location.pathname === targetPath) {
    return;
  }

  navigate(targetPath);
}
