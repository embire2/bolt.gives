import { atom, map, type WritableAtom } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';
import { openDatabase, createUser, getUserByUsername, getUserByEmail } from '~/lib/persistence/userDb';
import { createUserSession, getCurrentUser, destroyUserSession } from '~/lib/auth/session';

const logger = createScopedLogger('AuthStore');

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  createdAt: string;
  lastLogin?: string;
}

export interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  sessionToken: string | null;
}

export class AuthStore {
  private _state = map<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    sessionToken: null,
  });

  constructor() {
    this._initializeAuth();
  }

  get user(): WritableAtom<AuthUser | null> {
    return atom(this._state.get().user);
  }

  get isAuthenticated(): WritableAtom<boolean> {
    return atom(this._state.get().isAuthenticated);
  }

  get isLoading(): WritableAtom<boolean> {
    return atom(this._state.get().isLoading);
  }

  get sessionToken(): WritableAtom<string | null> {
    return atom(this._state.get().sessionToken);
  }

  private _initializeAuth() {
    // Load session from localStorage on startup
    if (typeof window !== 'undefined') {
      const savedToken = localStorage.getItem('sessionToken');

      if (savedToken) {
        this._verifySession(savedToken);
      }
    }
  }

  private async _verifySession(token: string) {
    this._setLoading(true);

    try {
      const user = await getCurrentUser(token);

      if (user) {
        this._setUser(
          {
            id: user.id,
            username: user.username,
            email: user.email,
            createdAt: user.createdAt,
            lastLogin: user.lastLogin,
          },
          token,
        );
      } else {
        this._clearAuth();
      }
    } catch (error) {
      logger.error('Session verification failed:', error);
      this._clearAuth();
    } finally {
      this._setLoading(false);
    }
  }

  async login(username: string, password: string): Promise<{ success: boolean; error?: string }> {
    this._setLoading(true);

    try {
      const db = await openDatabase();

      if (!db) {
        return { success: false, error: 'Database unavailable' };
      }

      // Get user by username
      const user = await getUserByUsername(db, username);

      if (!user) {
        return { success: false, error: 'Invalid credentials' };
      }

      /*
       * For client-side demo, we'll use a simple password check
       * In production, you'd want proper password hashing
       */
      if (user.password !== password) {
        return { success: false, error: 'Invalid credentials' };
      }

      // Create session
      const sessionToken = await createUserSession(user.id, user.username);

      this._setUser(
        {
          id: user.id,
          username: user.username,
          email: user.email,
          createdAt: user.createdAt,
          lastLogin: user.lastLogin,
        },
        sessionToken,
      );

      return { success: true };
    } catch (error) {
      logger.error('Login failed:', error);
      return { success: false, error: 'Login failed' };
    } finally {
      this._setLoading(false);
    }
  }

  async register(username: string, email: string, password: string): Promise<{ success: boolean; error?: string }> {
    this._setLoading(true);

    try {
      const db = await openDatabase();

      if (!db) {
        return { success: false, error: 'Database unavailable' };
      }

      // Validate username format
      if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return { success: false, error: 'Username can only contain letters, numbers, and underscores' };
      }

      if (username.length < 3 || username.length > 20) {
        return { success: false, error: 'Username must be between 3 and 20 characters' };
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!emailRegex.test(email)) {
        return { success: false, error: 'Invalid email address' };
      }

      if (password.length < 6) {
        return { success: false, error: 'Password must be at least 6 characters long' };
      }

      // Check if user already exists
      const existingUser = await getUserByUsername(db, username);

      if (existingUser) {
        return { success: false, error: 'Username already exists' };
      }

      const existingEmail = await getUserByEmail(db, email);

      if (existingEmail) {
        return { success: false, error: 'Email already exists' };
      }

      // Create user (storing plain password for demo - use hashing in production)
      await createUser(db, {
        username,
        email,
        password, // In production: await bcrypt.hash(password, 12)
      });

      // After successful registration, automatically log in
      return await this.login(username, password);
    } catch (error) {
      logger.error('Registration failed:', error);
      return { success: false, error: 'Registration failed' };
    } finally {
      this._setLoading(false);
    }
  }

  async logout(): Promise<void> {
    const token = this._state.get().sessionToken;

    if (token) {
      try {
        await destroyUserSession(token);
      } catch (error) {
        logger.error('Logout failed:', error);
      }
    }

    this._clearAuth();
  }

  private _setUser(user: AuthUser, sessionToken: string) {
    this._state.setKey('user', user);
    this._state.setKey('isAuthenticated', true);
    this._state.setKey('sessionToken', sessionToken);

    // Save to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('sessionToken', sessionToken);
    }

    logger.info(`User ${user.username} authenticated`);
  }

  private _clearAuth() {
    this._state.setKey('user', null);
    this._state.setKey('isAuthenticated', false);
    this._state.setKey('sessionToken', null);

    // Remove from localStorage
    if (typeof window !== 'undefined') {
      localStorage.removeItem('sessionToken');
    }

    logger.info('User logged out');
  }

  private _setLoading(loading: boolean) {
    this._state.setKey('isLoading', loading);
  }

  getCurrentUser(): AuthUser | null {
    return this._state.get().user;
  }

  getSessionToken(): string | null {
    return this._state.get().sessionToken;
  }

  isUserAuthenticated(): boolean {
    return this._state.get().isAuthenticated;
  }
}

export const authStore = new AuthStore();
