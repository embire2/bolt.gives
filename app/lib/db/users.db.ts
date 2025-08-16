import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';

// Database path
const DB_PATH = path.join(process.cwd(), 'data', 'bolt-users.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database
const db = new Database(DB_PATH);

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    status TEXT DEFAULT 'active',
    force_password_change INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME,
    session_data TEXT,
    settings TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS chat_history (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    title TEXT,
    messages TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_chat_history_user_id ON chat_history(user_id);
  CREATE INDEX IF NOT EXISTS idx_chat_history_chat_id ON chat_history(chat_id);
`);

// User management functions
export class UserManager {
  // Initialize default admin user if not exists
  static async initializeAdmin() {
    const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');

    if (!adminExists) {
      const hashedPassword = await bcrypt.hash('admin', 12);
      const adminId = uuidv4();

      db.prepare(
        `
        INSERT INTO users (id, username, email, password_hash, role, force_password_change)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      ).run(adminId, 'admin', 'admin@bolt.gives', hashedPassword, 'admin', 1);

      console.log('✅ Default admin user created (username: admin, password: admin)');
      console.log('⚠️  Please change the admin password on first login!');
    }
  }

  // Create new user
  static async createUser(username: string, password: string, email?: string, role: string = 'user') {
    // Check user limit (5 users excluding admin)
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('user') as { count: number };

    if (role === 'user' && userCount.count >= 5) {
      throw new Error('User limit reached. Maximum 5 users allowed (excluding admin).');
    }

    // Check if username exists
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);

    if (existingUser) {
      throw new Error('Username already exists');
    }

    // Check if email exists
    if (email) {
      const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email);

      if (existingEmail) {
        throw new Error('Email already exists');
      }
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const userId = uuidv4();

    db.prepare(
      `
      INSERT INTO users (id, username, email, password_hash, role)
      VALUES (?, ?, ?, ?, ?)
    `,
    ).run(userId, username, email, hashedPassword, role);

    return { id: userId, username, email, role };
  }

  // Authenticate user
  static async authenticate(username: string, password: string) {
    const user = db
      .prepare(
        `
      SELECT id, username, email, password_hash, role, status, force_password_change
      FROM users 
      WHERE username = ? OR email = ?
    `,
      )
      .get(username, username) as any;

    if (!user) {
      throw new Error('Invalid credentials');
    }

    if (user.status === 'suspended') {
      throw new Error('Account suspended. Please contact administrator.');
    }

    if (user.status === 'deleted') {
      throw new Error('Account not found');
    }

    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    // Update last login
    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

    // Create session
    const sessionId = uuidv4();
    const token = Buffer.from(`${sessionId}:${user.id}`).toString('base64');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    db.prepare(
      `
      INSERT INTO sessions (id, user_id, token, expires_at)
      VALUES (?, ?, ?, ?)
    `,
    ).run(sessionId, user.id, token, expiresAt.toISOString());

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        forcePasswordChange: user.force_password_change === 1,
      },
      token,
    };
  }

  // Verify session token
  static async verifyToken(token: string) {
    const session = db
      .prepare(
        `
      SELECT s.*, u.id as user_id, u.username, u.email, u.role, u.status
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token = ? AND s.expires_at > datetime('now')
    `,
      )
      .get(token) as any;

    if (!session) {
      return null;
    }

    if (session.status !== 'active') {
      return null;
    }

    return {
      id: session.user_id,
      username: session.username,
      email: session.email,
      role: session.role,
    };
  }

  // Change password
  static async changePassword(userId: string, oldPassword: string, newPassword: string) {
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as any;

    if (!user) {
      throw new Error('User not found');
    }

    const isValid = await bcrypt.compare(oldPassword, user.password_hash);

    if (!isValid) {
      throw new Error('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    db.prepare(
      `
      UPDATE users 
      SET password_hash = ?, force_password_change = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    ).run(hashedPassword, userId);

    return true;
  }

  // Admin functions
  static async getAllUsers() {
    return db
      .prepare(
        `
      SELECT id, username, email, role, status, created_at, last_login
      FROM users
      ORDER BY created_at DESC
    `,
      )
      .all();
  }

  static async suspendUser(userId: string) {
    db.prepare('UPDATE users SET status = ? WHERE id = ?').run('suspended', userId);

    // Invalidate all sessions
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);

    return true;
  }

  static async activateUser(userId: string) {
    db.prepare('UPDATE users SET status = ? WHERE id = ?').run('active', userId);
    return true;
  }

  static async deleteUser(userId: string) {
    // Soft delete - mark as deleted but keep data
    db.prepare('UPDATE users SET status = ? WHERE id = ?').run('deleted', userId);

    // Invalidate all sessions
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);

    return true;
  }

  static async updateUserRole(userId: string, role: string) {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
    return true;
  }

  // Chat session management
  static async saveChatSession(userId: string, chatId: string, title: string, messages: any[]) {
    const existing = db.prepare('SELECT id FROM chat_history WHERE user_id = ? AND chat_id = ?').get(userId, chatId);

    if (existing) {
      db.prepare(
        `
        UPDATE chat_history 
        SET title = ?, messages = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND chat_id = ?
      `,
      ).run(title, JSON.stringify(messages), userId, chatId);
    } else {
      const id = uuidv4();
      db.prepare(
        `
        INSERT INTO chat_history (id, user_id, chat_id, title, messages)
        VALUES (?, ?, ?, ?, ?)
      `,
      ).run(id, userId, chatId, title, JSON.stringify(messages));
    }

    return true;
  }

  static async getUserChatSessions(userId: string) {
    const sessions = db
      .prepare(
        `
      SELECT chat_id, title, created_at, updated_at
      FROM chat_history
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `,
      )
      .all(userId);

    return sessions;
  }

  static async getChatSession(userId: string, chatId: string) {
    const session = db
      .prepare(
        `
      SELECT messages
      FROM chat_history
      WHERE user_id = ? AND chat_id = ?
    `,
      )
      .get(userId, chatId) as any;

    if (!session) {
      return null;
    }

    return JSON.parse(session.messages);
  }

  // Cleanup expired sessions
  static async cleanupSessions() {
    db.prepare('DELETE FROM sessions WHERE expires_at < datetime("now")').run();
  }
}

// Initialize admin on module load
UserManager.initializeAdmin().catch(console.error);

// Cleanup expired sessions every hour
setInterval(
  () => {
    UserManager.cleanupSessions().catch(console.error);
  },
  60 * 60 * 1000,
);

export default UserManager;
