import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('UserDB');

export interface User {
  id: string;
  username: string;
  email: string;
  password: string;
  createdAt: string;
  lastLogin?: string;
}

export interface CreateUserData {
  username: string;
  email: string;
  password: string;
}

// Open or create the users database
export async function openDatabase(): Promise<IDBDatabase | undefined> {
  if (typeof indexedDB === 'undefined') {
    console.error('indexedDB is not available in this environment.');
    return undefined;
  }

  return new Promise((resolve) => {
    const request = indexedDB.open('boltUsers', 1);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion;

      if (oldVersion < 1) {
        // Create users object store
        if (!db.objectStoreNames.contains('users')) {
          const userStore = db.createObjectStore('users', { keyPath: 'id' });
          userStore.createIndex('username', 'username', { unique: true });
          userStore.createIndex('email', 'email', { unique: true });
        }

        // Create user_chats object store for user-specific chats
        if (!db.objectStoreNames.contains('user_chats')) {
          const chatStore = db.createObjectStore('user_chats', { keyPath: 'id' });
          chatStore.createIndex('userId', 'userId', { unique: false });
          chatStore.createIndex('urlId', 'urlId', { unique: true });
        }

        // Create user_snapshots object store for user-specific snapshots
        if (!db.objectStoreNames.contains('user_snapshots')) {
          const snapshotStore = db.createObjectStore('user_snapshots', { keyPath: ['userId', 'chatId'] });
          snapshotStore.createIndex('userId', 'userId', { unique: false });
        }
      }
    };

    request.onsuccess = (event: Event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event: Event) => {
      resolve(undefined);
      logger.error((event.target as IDBOpenDBRequest).error);
    };
  });
}

// Create a new user
export async function createUser(db: IDBDatabase, userData: CreateUserData): Promise<string> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('users', 'readwrite');
    const store = transaction.objectStore('users');

    const userId = generateUserId();
    const user: User = {
      id: userId,
      username: userData.username,
      email: userData.email,
      password: userData.password,
      createdAt: new Date().toISOString(),
    };

    const request = store.put(user);

    request.onsuccess = () => resolve(userId);
    request.onerror = () => reject(request.error);
  });
}

// Get user by ID
export async function getUserById(db: IDBDatabase, userId: string): Promise<User | null> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('users', 'readonly');
    const store = transaction.objectStore('users');
    const request = store.get(userId);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

// Get user by username
export async function getUserByUsername(db: IDBDatabase, username: string): Promise<User | null> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('users', 'readonly');
    const store = transaction.objectStore('users');
    const index = store.index('username');
    const request = index.get(username);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

// Get user by email
export async function getUserByEmail(db: IDBDatabase, email: string): Promise<User | null> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('users', 'readonly');
    const store = transaction.objectStore('users');
    const index = store.index('email');
    const request = index.get(email);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

// Update user
export async function updateUser(db: IDBDatabase, userId: string, updates: Partial<User>): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('users', 'readwrite');
    const store = transaction.objectStore('users');
    const getRequest = store.get(userId);

    getRequest.onsuccess = () => {
      const user = getRequest.result;

      if (user) {
        const updatedUser = { ...user, ...updates };
        const updateRequest = store.put(updatedUser);
        updateRequest.onsuccess = () => resolve();
        updateRequest.onerror = () => reject(updateRequest.error);
      } else {
        reject(new Error('User not found'));
      }
    };

    getRequest.onerror = () => reject(getRequest.error);
  });
}

// Delete user
export async function deleteUser(db: IDBDatabase, userId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['users', 'user_chats', 'user_snapshots'], 'readwrite');
    const userStore = transaction.objectStore('users');
    const chatStore = transaction.objectStore('user_chats');
    const snapshotStore = transaction.objectStore('user_snapshots');

    // Delete user
    userStore.delete(userId);

    // Delete user's chats
    const chatIndex = chatStore.index('userId');
    const chatRequest = chatIndex.openCursor(userId);

    chatRequest.onsuccess = () => {
      const cursor = chatRequest.result;

      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    // Delete user's snapshots
    const snapshotIndex = snapshotStore.index('userId');
    const snapshotRequest = snapshotIndex.openCursor(userId);

    snapshotRequest.onsuccess = () => {
      const cursor = snapshotRequest.result;

      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

// Generate a unique user ID
function generateUserId(): string {
  return 'user_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}
