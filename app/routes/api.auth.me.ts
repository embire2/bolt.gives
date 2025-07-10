import { type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { getCurrentUser } from '~/lib/auth/session';

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const sessionToken = request.headers.get('Authorization')?.replace('Bearer ', '');

    if (!sessionToken) {
      return json({ error: 'No session token provided' }, { status: 401 });
    }

    const user = await getCurrentUser(sessionToken);

    if (!user) {
      return json({ error: 'Invalid session' }, { status: 401 });
    }

    return json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
      },
    });
  } catch (error) {
    console.error('Get current user error:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}
