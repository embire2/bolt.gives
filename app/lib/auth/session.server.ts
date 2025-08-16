import { createCookieSessionStorage } from '@remix-run/node';

const sessionSecret = process.env.SESSION_SECRET || 'bolt-gives-secret-key-change-in-production';

if (!process.env.SESSION_SECRET && process.env.NODE_ENV === 'production') {
  console.warn(
    '⚠️ SESSION_SECRET environment variable is not set. Using default secret which is insecure in production!',
  );
}

export const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: 'bolt_session',
    secure: process.env.NODE_ENV === 'production',
    secrets: [sessionSecret],
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24, // 24 hours
    httpOnly: true,
  },
});

export async function getSession(cookieHeader: string | null) {
  return sessionStorage.getSession(cookieHeader);
}

export async function commitSession(session: any) {
  return sessionStorage.commitSession(session);
}

export async function destroySession(session: any) {
  return sessionStorage.destroySession(session);
}

export async function requireAuth(request: Request) {
  const session = await getSession(request.headers.get('Cookie'));
  const userId = session.get('userId');

  if (!userId) {
    throw new Response('Unauthorized', { status: 401 });
  }

  return {
    userId,
    username: session.get('username'),
    role: session.get('role'),
    token: session.get('token'),
  };
}

export async function requireAdmin(request: Request) {
  const user = await requireAuth(request);

  if (user.role !== 'admin') {
    throw new Response('Forbidden', { status: 403 });
  }

  return user;
}
