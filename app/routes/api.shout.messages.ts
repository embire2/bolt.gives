import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { fetchRuntimeControlJson } from '~/lib/.server/runtime-control';

type ShoutMessage = {
  id: string;
  author: string;
  content: string;
  createdAt: string;
};

export async function loader(_args: LoaderFunctionArgs) {
  try {
    const payload = await fetchRuntimeControlJson<{ ok: boolean; messages: ShoutMessage[] }>('/shout/messages');
    return json(payload);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Failed to load shout-out messages.' },
      { status: 500 },
    );
  }
}
