import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { fetchRuntimeControlJson } from '~/lib/.server/runtime-control';
import { isTenantAdminAuthorized } from '~/lib/.server/admin-auth';

type ShoutMessage = {
  id: string;
  author: string;
  content: string;
  createdAt: string;
};

export async function action({ request }: ActionFunctionArgs) {
  if (!(await isTenantAdminAuthorized(request))) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));

  try {
    const payload = await fetchRuntimeControlJson<{ ok: boolean; message: ShoutMessage }>('/shout/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    return json(payload);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Failed to send the shout-out message.' },
      { status: 400 },
    );
  }
}
