import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { normalizeProfileReturnTo } from '@bolt/control-plane/server/profile-auth.mjs';
import { resolveRuntimeEnvFromContext } from '@bolt/runtime/lib/.server/runtime-env';
import { registerProfile } from '~/lib/.server/profile-session';
import { isSingleUserMode, loginSelfHost } from '~/lib/.server/self-host';
import { profileLoginHeaders } from '~/lib/.server/profile-response';

export const loader = ({ request }: LoaderFunctionArgs) => redirect(new URL(request.url).origin);

export async function action({ context, request }: ActionFunctionArgs) {
  const origin = request.headers.get('Origin');
  const requestOrigin = new URL(request.url).origin;

  if (origin && origin !== requestOrigin) {
    return json({ error: 'Profile registration must be submitted from this site.' }, { status: 403 });
  }

  const formData = await request.formData();
  const returnTo = normalizeProfileReturnTo(formData.get('returnTo'));
  const runtimeEnv = resolveRuntimeEnvFromContext(context);

  try {
    const payload = isSingleUserMode(runtimeEnv)
      ? await loginSelfHost(String(formData.get('accessToken') || ''), runtimeEnv)
      : await registerProfile(
          {
            name: String(formData.get('name') || ''),
            email: String(formData.get('email') || ''),
            country: String(formData.get('country') || ''),
          },
          runtimeEnv,
        );

    return redirect(returnTo, {
      headers: await profileLoginHeaders(payload.session, runtimeEnv),
    });
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : 'Unable to create your profile.',
      },
      { status: 400 },
    );
  }
}
