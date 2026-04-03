import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { fetchRuntimeControlJson } from '~/lib/.server/runtime-control';
import type { ManagedInstanceRecord } from '~/lib/managed-instances';

export async function action({ request }: ActionFunctionArgs) {
  const body = await request.json().catch(() => ({}));

  try {
    const payload = await fetchRuntimeControlJson<{
      ok: boolean;
      existing: boolean;
      sessionToken: string;
      instance: ManagedInstanceRecord;
    }>('/managed-instances/spawn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    return json(payload);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Managed instance spawn failed.' }, { status: 400 });
  }
}
