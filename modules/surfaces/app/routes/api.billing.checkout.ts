import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { resolveRuntimeEnvFromContext } from '@bolt/runtime/lib/.server/runtime-env';
import { createProfileBillingCheckout, resolveProfileSession } from '~/lib/.server/profile-session';

export async function action({ context, request }: ActionFunctionArgs) {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get('Origin');

  if (origin && origin !== requestOrigin) {
    return json({ ok: false, message: 'Billing checkout must be started from this site.' }, { status: 403 });
  }

  const runtimeEnv = resolveRuntimeEnvFromContext(context);
  const profile = await resolveProfileSession(request, runtimeEnv);

  if (!profile) {
    return json({ ok: false, message: 'Login before upgrading your account.' }, { status: 401 });
  }

  try {
    const checkout = await createProfileBillingCheckout(request, runtimeEnv);

    if (!checkout?.checkoutUrl) {
      throw new Error('Stripe Checkout did not return a secure payment URL.');
    }

    return json(checkout, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    return json(
      { ok: false, message: error instanceof Error ? error.message : 'Unable to start secure Stripe Checkout.' },
      { status: 502, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  }
}
