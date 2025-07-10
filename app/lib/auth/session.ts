import { createScopedLogger } from '~/utils/logger';
import { getUserById, openDatabase, type User } from '~/lib/persistence/userDb';

const logger = createScopedLogger('Session');

export interface SessionData {
  userId: string;
  username: string;
  createdAt: string;
  expiresAt: string;
}

// In-memory session store (in production, use Redis or similar)
const sessionStore = new Map<string, SessionData>();

// Session duration: 7 days
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000;

export async function createUserSession(userId: string, username: string): Promise<string> {
  const sessionToken = generateSessionToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION);

  const sessionData: SessionData = {
    userId,
    username,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  sessionStore.set(sessionToken, sessionData);
  logger.info(`Created session for user ${username}`);

  return sessionToken;
}

export async function getCurrentUser(sessionToken: string): Promise<User | null> {
  const sessionData = sessionStore.get(sessionToken);

  if (!sessionData) {
    return null;
  }

  // Check if session has expired
  const now = new Date();
  const expiresAt = new Date(sessionData.expiresAt);

  if (now > expiresAt) {
    sessionStore.delete(sessionToken);
    logger.info(`Session expired for user ${sessionData.username}`);

    return null;
  }

  // Get user from database
  const db = await openDatabase();

  if (!db) {
    logger.error('Database unavailable');
    return null;
  }

  const user = await getUserById(db, sessionData.userId);

  return user;
}

export async function destroyUserSession(sessionToken: string): Promise<void> {
  const sessionData = sessionStore.get(sessionToken);

  if (sessionData) {
    sessionStore.delete(sessionToken);
    logger.info(`Destroyed session for user ${sessionData.username}`);
  }
}

export async function validateSession(sessionToken: string): Promise<boolean> {
  const user = await getCurrentUser(sessionToken);
  return user !== null;
}

export function generateSessionToken(): string {
  return 'session_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 16);
}

// Clean up expired sessions (call this periodically)
export function cleanupExpiredSessions(): void {
  const now = new Date();
  let cleanedCount = 0;

  for (const [token, sessionData] of sessionStore.entries()) {
    const expiresAt = new Date(sessionData.expiresAt);

    if (now > expiresAt) {
      sessionStore.delete(token);
      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    logger.info(`Cleaned up ${cleanedCount} expired sessions`);
  }
}

// Run cleanup every hour (only in browser)
if (typeof window !== 'undefined') {
  setInterval(cleanupExpiredSessions, 60 * 60 * 1000);
}
