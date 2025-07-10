import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { openDatabase, getUserByUsername } from '~/lib/persistence/userDb';
import { createUserSession } from '~/lib/auth/session';

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const formData = await request.formData();
    const data = Object.fromEntries(formData);

    const validation = loginSchema.safeParse(data);

    if (!validation.success) {
      return json(
        {
          error: 'Validation failed',
          details: validation.error.issues.map((issue) => ({
            field: issue.path[0],
            message: issue.message,
          })),
        },
        { status: 400 },
      );
    }

    const { username, password } = validation.data;

    const db = await openDatabase();

    if (!db) {
      return json({ error: 'Database unavailable' }, { status: 500 });
    }

    // Find user
    const user = await getUserByUsername(db, username);

    if (!user) {
      return json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Update last login
    await updateLastLogin(db, user.id);

    // Create session
    const sessionToken = await createUserSession(user.id, user.username);

    return json({
      success: true,
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
      sessionToken,
    });
  } catch (error) {
    console.error('Login error:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function updateLastLogin(db: IDBDatabase, userId: string) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('users', 'readwrite');
    const store = transaction.objectStore('users');
    const getRequest = store.get(userId);

    getRequest.onsuccess = () => {
      const user = getRequest.result;

      if (user) {
        user.lastLogin = new Date().toISOString();

        const updateRequest = store.put(user);
        updateRequest.onsuccess = () => resolve(user);
        updateRequest.onerror = () => reject(updateRequest.error);
      } else {
        reject(new Error('User not found'));
      }
    };

    getRequest.onerror = () => reject(getRequest.error);
  });
}
