import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { resolveRuntimeEnvFromContext } from '@bolt/runtime/lib/.server/runtime-env';
import { clearProfileSession, revokeProfileSession } from '~/lib/.server/profile-session';

export const loader = ({ request }: LoaderFunctionArgs) => redirect(new URL(request.url).origin);

export async function action({ context, request }: ActionFunctionArgs) {
  const runtimeEnv = resolveRuntimeEnvFromContext(context);
  await revokeProfileSession(request, runtimeEnv);

  const headers = new Headers();
  headers.append('Set-Cookie', await clearProfileSession(runtimeEnv));
  headers.append('Set-Cookie', 'apiKeys=; Path=/; Max-Age=0; SameSite=Lax');
  headers.append('Set-Cookie', 'bolt_api_key_owner=; Path=/; Max-Age=0; SameSite=Lax');

  return redirect('/', {
    headers,
  });
}
