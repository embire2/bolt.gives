import { useLoaderData, useNavigate, useSearchParams } from '@remix-run/react';
import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { atom } from 'nanostores';
import { generateId, type JSONValue, type Message } from 'ai';
import { toast } from 'react-toastify';
import { workbenchStore } from '~/lib/stores/workbench';
import { logStore } from '~/lib/stores/logs';
import { authStore } from '~/lib/stores/auth';
import {
  getUserChatById,
  getUserChatByUrlId,
  saveUserChat,
  getNextUserChatId,
  getUserChatUrlId,
  duplicateUserChat,
  createUserChatFromMessages,
  getUserSnapshot,
  setUserSnapshot,
} from './userChats';
import type { IChatMetadata } from './db';
import type { FileMap } from '~/lib/stores/files';
import type { Snapshot } from './types';
import { webcontainer } from '~/lib/webcontainer';
import { detectProjectCommands, createCommandActionsString } from '~/utils/projectCommands';
import type { ContextAnnotation } from '~/types/context';

export interface ChatHistoryItem {
  id: string;
  urlId?: string;
  description?: string;
  messages: Message[];
  timestamp: string;
  metadata?: IChatMetadata;
}

const persistenceEnabled = !import.meta.env.VITE_DISABLE_PERSISTENCE;

export const chatId = atom<string | undefined>(undefined);
export const description = atom<string | undefined>(undefined);
export const chatMetadata = atom<IChatMetadata | undefined>(undefined);

export function useUserChatHistory() {
  const navigate = useNavigate();
  const { id: mixedId } = useLoaderData<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const user = useStore(authStore.user);
  const isAuthenticated = useStore(authStore.isAuthenticated);

  const [archivedMessages, setArchivedMessages] = useState<Message[]>([]);
  const [initialMessages, setInitialMessages] = useState<Message[]>([]);
  const [ready, setReady] = useState<boolean>(false);
  const [urlId, setUrlId] = useState<string | undefined>();

  useEffect(() => {
    if (!isAuthenticated || !user) {
      setReady(true);
      return;
    }

    if (!persistenceEnabled) {
      setReady(true);
      toast.error('Chat persistence is unavailable');

      return;
    }

    if (mixedId) {
      Promise.all([
        getUserChatByUrlId(user.id, mixedId).catch(() => getUserChatById(user.id, mixedId)),
        getUserSnapshot(user.id, mixedId).catch(() => undefined),
      ])
        .then(async ([storedChat, snapshot]) => {
          if (storedChat && storedChat.messages.length > 0) {
            const validSnapshot = snapshot || { chatIndex: '', files: {} };
            const summary = validSnapshot.summary;

            const rewindId = searchParams.get('rewindTo');
            let startingIdx = -1;
            const endingIdx = rewindId
              ? storedChat.messages.findIndex((m) => m.id === rewindId) + 1
              : storedChat.messages.length;
            const snapshotIndex = storedChat.messages.findIndex((m) => m.id === validSnapshot.chatIndex);

            if (snapshotIndex >= 0 && snapshotIndex < endingIdx) {
              startingIdx = snapshotIndex;
            }

            if (snapshotIndex > 0 && storedChat.messages[snapshotIndex].id == rewindId) {
              startingIdx = -1;
            }

            let filteredMessages = storedChat.messages.slice(startingIdx + 1, endingIdx);
            let archivedMessages: Message[] = [];

            if (startingIdx >= 0) {
              archivedMessages = storedChat.messages.slice(0, startingIdx + 1);
            }

            setArchivedMessages(archivedMessages);

            if (startingIdx > 0) {
              const files = Object.entries(validSnapshot?.files || {})
                .map(([key, value]) => {
                  if (value?.type !== 'file') {
                    return null;
                  }

                  return {
                    content: value.content,
                    path: key,
                  };
                })
                .filter((x): x is { content: string; path: string } => !!x);
              const projectCommands = await detectProjectCommands(files);

              const commandActionsString = createCommandActionsString(projectCommands);

              filteredMessages = [
                {
                  id: generateId(),
                  role: 'user',
                  content: `Restore project from snapshot`,
                  annotations: ['no-store', 'hidden'],
                },
                {
                  id: storedChat.messages[snapshotIndex].id,
                  role: 'assistant',
                  content: `Bolt Restored your chat from a snapshot. You can revert this message to load the full chat history.
                  <boltArtifact id="restored-project-setup" title="Restored Project & Setup" type="bundled">
                  ${Object.entries(snapshot?.files || {})
                    .map(([key, value]) => {
                      if (value?.type === 'file') {
                        return `
                      <boltAction type="file" filePath="${key}">
${value.content}
                      </boltAction>
                      `;
                      } else {
                        return ``;
                      }
                    })
                    .join('\n')}
                  ${commandActionsString} 
                  </boltArtifact>
                  `,
                  annotations: [
                    'no-store',
                    ...(summary
                      ? [
                          {
                            chatId: storedChat.messages[snapshotIndex].id,
                            type: 'chatSummary',
                            summary,
                          } satisfies ContextAnnotation,
                        ]
                      : []),
                  ],
                },
                ...filteredMessages,
              ];
              restoreSnapshot(user.id, mixedId, validSnapshot);
            }

            setInitialMessages(filteredMessages);
            setUrlId(storedChat.urlId);
            description.set(storedChat.description);
            chatId.set(storedChat.id);
            chatMetadata.set(storedChat.metadata);
          } else {
            navigate('/', { replace: true });
          }

          setReady(true);
        })
        .catch((error) => {
          console.error(error);
          logStore.logError('Failed to load chat messages or snapshot', error);
          toast.error('Failed to load chat: ' + error.message);
          setReady(true);
        });
    } else {
      setReady(true);
    }
  }, [mixedId, navigate, searchParams, user, isAuthenticated]);

  const takeSnapshot = useCallback(
    async (chatIdx: string, files: FileMap, _chatId?: string | undefined, chatSummary?: string) => {
      if (!user) {
        return;
      }

      const id = chatId.get();

      if (!id) {
        return;
      }

      const snapshot: Snapshot = {
        chatIndex: chatIdx,
        files,
        summary: chatSummary,
      };

      try {
        await setUserSnapshot(user.id, id, snapshot);
      } catch (error) {
        console.error('Failed to save snapshot:', error);
        toast.error('Failed to save chat snapshot.');
      }
    },
    [user],
  );

  const restoreSnapshot = useCallback(async (userId: string, chatId: string, snapshot: Snapshot) => {
    const container = await webcontainer;
    const validSnapshot = snapshot || { chatIndex: '', files: {} };

    if (!validSnapshot?.files) {
      return;
    }

    Object.entries(validSnapshot.files).forEach(async ([key, value]) => {
      if (key.startsWith(container.workdir)) {
        key = key.replace(container.workdir, '');
      }

      if (value?.type === 'folder') {
        await container.fs.mkdir(key, { recursive: true });
      }
    });

    Object.entries(validSnapshot.files).forEach(async ([key, value]) => {
      if (value?.type === 'file') {
        if (key.startsWith(container.workdir)) {
          key = key.replace(container.workdir, '');
        }

        await container.fs.writeFile(key, value.content, { encoding: value.isBinary ? undefined : 'utf8' });
      }
    });
  }, []);

  return {
    ready: !mixedId || ready,
    initialMessages,
    updateChatMetadata: async (metadata: IChatMetadata) => {
      if (!user) {
        return;
      }

      const id = chatId.get();

      if (!id) {
        return;
      }

      try {
        await saveUserChat(user.id, id, initialMessages, urlId, description.get(), undefined, metadata);
        chatMetadata.set(metadata);
      } catch (error) {
        toast.error('Failed to update chat metadata');
        console.error(error);
      }
    },
    storeMessageHistory: async (messages: Message[]) => {
      if (!user || messages.length === 0) {
        return;
      }

      const { firstArtifact } = workbenchStore;
      messages = messages.filter((m) => !m.annotations?.includes('no-store'));

      let _urlId = urlId;

      if (!urlId && firstArtifact?.id) {
        const newUrlId = await getUserChatUrlId(user.id, firstArtifact.id);
        _urlId = newUrlId;
        navigateChat(newUrlId);
        setUrlId(newUrlId);
      }

      let chatSummary: string | undefined = undefined;
      const lastMessage = messages[messages.length - 1];

      if (lastMessage.role === 'assistant') {
        const annotations = lastMessage.annotations as JSONValue[];
        const filteredAnnotations = (annotations?.filter(
          (annotation: JSONValue) =>
            annotation && typeof annotation === 'object' && Object.keys(annotation).includes('type'),
        ) || []) as { type: string; value: any } & { [key: string]: any }[];

        if (filteredAnnotations.find((annotation) => annotation.type === 'chatSummary')) {
          chatSummary = filteredAnnotations.find((annotation) => annotation.type === 'chatSummary')?.summary;
        }
      }

      takeSnapshot(messages[messages.length - 1].id, workbenchStore.files.get(), _urlId, chatSummary);

      if (!description.get() && firstArtifact?.title) {
        description.set(firstArtifact?.title);
      }

      if (initialMessages.length === 0 && !chatId.get()) {
        const nextId = await getNextUserChatId(user.id);
        chatId.set(nextId);

        if (!urlId) {
          navigateChat(nextId);
        }
      }

      const finalChatId = chatId.get();

      if (!finalChatId) {
        console.error('Cannot save messages, chat ID is not set.');
        toast.error('Failed to save chat messages: Chat ID missing.');

        return;
      }

      await saveUserChat(
        user.id,
        finalChatId,
        [...archivedMessages, ...messages],
        urlId,
        description.get(),
        undefined,
        chatMetadata.get(),
      );
    },
    duplicateCurrentChat: async (listItemId: string) => {
      if (!user || (!mixedId && !listItemId)) {
        return;
      }

      try {
        const newId = await duplicateUserChat(user.id, mixedId || listItemId);
        navigate(`/chat/${newId}`);
        toast.success('Chat duplicated successfully');
      } catch (error) {
        toast.error('Failed to duplicate chat');
        console.log(error);
      }
    },
    importChat: async (description: string, messages: Message[], metadata?: IChatMetadata) => {
      if (!user) {
        return;
      }

      try {
        const newId = await createUserChatFromMessages(user.id, description, messages, metadata);
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
    exportChat: async (id = urlId) => {
      if (!user || !id) {
        return;
      }

      try {
        const chat = await getUserChatByUrlId(user.id, id);

        if (!chat) {
          toast.error('Chat not found');
          return;
        }

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
      } catch (error) {
        toast.error('Failed to export chat');
        console.error(error);
      }
    },
  };
}

function navigateChat(nextId: string) {
  const url = new URL(window.location.href);
  url.pathname = `/chat/${nextId}`;
  window.history.replaceState({}, '', url);
}
