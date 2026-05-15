import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { fetchRuntimeControlJson } from '~/lib/.server/runtime-control';

export async function action({ request }: ActionFunctionArgs) {
  const body = await request.json().catch(() => ({}));

  try {
    const payload = await fetchRuntimeControlJson<{ ok: boolean }>('/shout/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    return json(payload);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Failed to report the shout-out message.' },
      { status: 400 },
    );
  }
}
