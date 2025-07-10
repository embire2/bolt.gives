import type { Message } from 'ai';
import { createScopedLogger } from '~/utils/logger';
import { openDatabase } from './userDb';
import type { IChatMetadata } from './db';
import type { Snapshot } from './types';

const logger = createScopedLogger('UserChats');

export interface UserChatHistoryItem {
  id: string;
  userId: string;
  urlId?: string;
  description?: string;
  messages: Message[];
  timestamp: string;
  metadata?: IChatMetadata;
}

export async function getUserChats(userId: string): Promise<UserChatHistoryItem[]> {
  const db = await openDatabase();

  if (!db) {
    throw new Error('Database unavailable');
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction('user_chats', 'readonly');
    const store = transaction.objectStore('user_chats');
    const index = store.index('userId');
    const request = index.getAll(userId);

    request.onsuccess = () => {
      const results = request.result as UserChatHistoryItem[];

      // Sort by timestamp descending (newest first)
      results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      resolve(results);
    };

    request.onerror = () => {
      logger.error('Failed to get user chats:', request.error);
      reject(request.error);
    };
  });
}

export async function getUserChatById(userId: string, chatId: string): Promise<UserChatHistoryItem | null> {
  const db = await openDatabase();

  if (!db) {
    throw new Error('Database unavailable');
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction('user_chats', 'readonly');
    const store = transaction.objectStore('user_chats');
    const request = store.get(chatId);

    request.onsuccess = () => {
      const chat = request.result as UserChatHistoryItem;

      // Verify the chat belongs to the user
      if (chat && chat.userId === userId) {
        resolve(chat);
      } else {
        resolve(null);
      }
    };

    request.onerror = () => {
      logger.error('Failed to get user chat:', request.error);
      reject(request.error);
    };
  });
}

export async function getUserChatByUrlId(userId: string, urlId: string): Promise<UserChatHistoryItem | null> {
  const db = await openDatabase();

  if (!db) {
    throw new Error('Database unavailable');
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction('user_chats', 'readonly');
    const store = transaction.objectStore('user_chats');
    const index = store.index('urlId');
    const request = index.get(urlId);

    request.onsuccess = () => {
      const chat = request.result as UserChatHistoryItem;

      // Verify the chat belongs to the user
      if (chat && chat.userId === userId) {
        resolve(chat);
      } else {
        resolve(null);
      }
    };

    request.onerror = () => {
      logger.error('Failed to get user chat by URL ID:', request.error);
      reject(request.error);
    };
  });
}

export async function saveUserChat(
  userId: string,
  chatId: string,
  messages: Message[],
  urlId?: string,
  description?: string,
  timestamp?: string,
  metadata?: IChatMetadata,
): Promise<void> {
  const db = await openDatabase();

  if (!db) {
    throw new Error('Database unavailable');
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction('user_chats', 'readwrite');
    const store = transaction.objectStore('user_chats');

    if (timestamp && isNaN(Date.parse(timestamp))) {
      reject(new Error('Invalid timestamp'));
      return;
    }

    const chatData: UserChatHistoryItem = {
      id: chatId,
      userId,
      messages,
      urlId,
      description,
      timestamp: timestamp ?? new Date().toISOString(),
      metadata,
    };

    const request = store.put(chatData);

    request.onsuccess = () => {
      logger.info(`Saved chat ${chatId} for user ${userId}`);
      resolve();
    };

    request.onerror = () => {
      logger.error('Failed to save user chat:', request.error);
      reject(request.error);
    };
  });
}

export async function deleteUserChat(userId: string, chatId: string): Promise<void> {
  const db = await openDatabase();

  if (!db) {
    throw new Error('Database unavailable');
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['user_chats', 'user_snapshots'], 'readwrite');
    const chatStore = transaction.objectStore('user_chats');
    const snapshotStore = transaction.objectStore('user_snapshots');

    // First verify the chat belongs to the user
    const getRequest = chatStore.get(chatId);

    getRequest.onsuccess = () => {
      const chat = getRequest.result as UserChatHistoryItem;

      if (!chat || chat.userId !== userId) {
        reject(new Error('Chat not found or access denied'));
        return;
      }

      // Delete the chat
      const deleteChatRequest = chatStore.delete(chatId);

      // Delete associated snapshot
      const deleteSnapshotRequest = snapshotStore.delete([userId, chatId]);

      let chatDeleted = false;
      let snapshotDeleted = false;

      const checkCompletion = () => {
        if (chatDeleted && snapshotDeleted) {
          logger.info(`Deleted chat ${chatId} for user ${userId}`);
          resolve();
        }
      };

      deleteChatRequest.onsuccess = () => {
        chatDeleted = true;
        checkCompletion();
      };

      deleteChatRequest.onerror = () => reject(deleteChatRequest.error);

      deleteSnapshotRequest.onsuccess = () => {
        snapshotDeleted = true;
        checkCompletion();
      };

      deleteSnapshotRequest.onerror = () => {
        // Snapshot might not exist, that's okay
        snapshotDeleted = true;
        checkCompletion();
      };
    };

    getRequest.onerror = () => reject(getRequest.error);
  });
}

export async function getNextUserChatId(userId: string): Promise<string> {
  const db = await openDatabase();

  if (!db) {
    throw new Error('Database unavailable');
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction('user_chats', 'readonly');
    const store = transaction.objectStore('user_chats');
    const index = store.index('userId');
    const request = index.getAllKeys(userId);

    request.onsuccess = () => {
      const keys = request.result as string[];
      const highestId = keys.reduce((max, key) => {
        const num = parseInt(key.replace(/^.*_/, ''), 10);
        return isNaN(num) ? max : Math.max(max, num);
      }, 0);

      const nextId = `${userId}_chat_${highestId + 1}`;
      resolve(nextId);
    };

    request.onerror = () => {
      logger.error('Failed to get next chat ID:', request.error);
      reject(request.error);
    };
  });
}

export async function getUserChatUrlId(userId: string, baseId: string): Promise<string> {
  const db = await openDatabase();

  if (!db) {
    throw new Error('Database unavailable');
  }

  const existingIds = await getUserChatUrlIds(db, userId);

  if (!existingIds.includes(baseId)) {
    return baseId;
  }

  let counter = 2;

  while (existingIds.includes(`${baseId}-${counter}`)) {
    counter++;
  }

  return `${baseId}-${counter}`;
}

async function getUserChatUrlIds(db: IDBDatabase, userId: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('user_chats', 'readonly');
    const store = transaction.objectStore('user_chats');
    const index = store.index('userId');
    const request = index.openCursor(userId);

    const urlIds: string[] = [];

    request.onsuccess = () => {
      const cursor = request.result;

      if (cursor) {
        const chat = cursor.value as UserChatHistoryItem;

        if (chat.urlId) {
          urlIds.push(chat.urlId);
        }

        cursor.continue();
      } else {
        resolve(urlIds);
      }
    };

    request.onerror = () => {
      logger.error('Failed to get URL IDs:', request.error);
      reject(request.error);
    };
  });
}

export async function duplicateUserChat(userId: string, chatId: string): Promise<string> {
  const db = await openDatabase();

  if (!db) {
    throw new Error('Database unavailable');
  }

  const chat = await getUserChatById(userId, chatId);

  if (!chat) {
    throw new Error('Chat not found');
  }

  return createUserChatFromMessages(userId, `${chat.description || 'Chat'} (copy)`, chat.messages, chat.metadata);
}

export async function createUserChatFromMessages(
  userId: string,
  description: string,
  messages: Message[],
  metadata?: IChatMetadata,
): Promise<string> {
  const newChatId = await getNextUserChatId(userId);
  const newUrlId = await getUserChatUrlId(userId, newChatId);

  await saveUserChat(userId, newChatId, messages, newUrlId, description, undefined, metadata);

  return newUrlId;
}

export async function getUserSnapshot(userId: string, chatId: string): Promise<Snapshot | undefined> {
  const db = await openDatabase();

  if (!db) {
    throw new Error('Database unavailable');
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction('user_snapshots', 'readonly');
    const store = transaction.objectStore('user_snapshots');
    const request = store.get([userId, chatId]);

    request.onsuccess = () => {
      const result = request.result;
      resolve(result ? result.snapshot : undefined);
    };

    request.onerror = () => {
      logger.error('Failed to get user snapshot:', request.error);
      reject(request.error);
    };
  });
}

export async function setUserSnapshot(userId: string, chatId: string, snapshot: Snapshot): Promise<void> {
  const db = await openDatabase();

  if (!db) {
    throw new Error('Database unavailable');
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction('user_snapshots', 'readwrite');
    const store = transaction.objectStore('user_snapshots');
    const request = store.put({ userId, chatId, snapshot });

    request.onsuccess = () => {
      logger.info(`Saved snapshot for user ${userId}, chat ${chatId}`);
      resolve();
    };

    request.onerror = () => {
      logger.error('Failed to save user snapshot:', request.error);
      reject(request.error);
    };
  });
}
