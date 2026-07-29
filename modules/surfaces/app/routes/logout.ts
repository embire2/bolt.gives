import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { resolveRuntimeEnvFromContext } from '@bolt/runtime/lib/.server/runtime-env';
import { clearProfileSession, revokeProfileSession } from '~/lib/.server/profile-session';

export const loader = ({ request }: LoaderFunctionArgs) => redirect(new URL(request.url).origin);

export async function action({ context, request }: ActionFunctionArgs) {
  const runtimeEnv = resolveRuntimeEnvFromContext(context);
  await revokeProfileSession(request, runtimeEnv);

  return redirect('/', {
    headers: {
      'Set-Cookie': await clearProfileSession(runtimeEnv),
    },
  });
}
