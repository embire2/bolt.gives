import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { destroyUserSession } from '~/lib/auth/session';

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const sessionToken = request.headers.get('Authorization')?.replace('Bearer ', '');

    if (sessionToken) {
      await destroyUserSession(sessionToken);
    }

    return json({
      success: true,
      message: 'Logout successful',
    });
  } catch (error) {
    console.error('Logout error:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}
