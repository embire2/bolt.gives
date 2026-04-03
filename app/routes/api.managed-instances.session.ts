import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { fetchRuntimeControlJson } from '~/lib/.server/runtime-control';
import type { ManagedInstanceRecord } from '~/lib/managed-instances';

export async function loader({ request }: LoaderFunctionArgs) {
  const sessionToken = new URL(request.url).searchParams.get('sessionToken')?.trim() || '';

  try {
    const payload = await fetchRuntimeControlJson<{ ok: boolean; instance: ManagedInstanceRecord }>(
      `/managed-instances/session?sessionToken=${encodeURIComponent(sessionToken)}`,
    );

    return json(payload);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Managed instance session lookup failed.' },
      { status: 404 },
    );
  }
}
