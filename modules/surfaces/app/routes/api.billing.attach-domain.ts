import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { resolveRuntimeEnvFromContext } from '@bolt/runtime/lib/.server/runtime-env';
import { attachProfileBillingDomain, resolveProfileSession } from '~/lib/.server/profile-session';

export async function action({ context, request }: ActionFunctionArgs) {
  const origin = request.headers.get('Origin');
  const requestOrigin = new URL(request.url).origin;

  if (origin && origin !== requestOrigin) {
    return json({ ok: false, message: 'Custom Domain changes must be started from this site.' }, { status: 403 });
  }

  const runtimeEnv = resolveRuntimeEnvFromContext(context);
  const profile = await resolveProfileSession(request, runtimeEnv);

  if (!profile) {
    return json(
      { ok: false, requiresCheckout: true, message: 'Login before attaching a Custom Domain.' },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { sessionId?: string; customDomain?: string };

  if (!body.sessionId || !body.customDomain) {
    return json({ ok: false, message: 'A published project and Custom Domain are required.' }, { status: 400 });
  }

  try {
    const result = await attachProfileBillingDomain(
      request,
      { sessionId: body.sessionId, customDomain: body.customDomain },
      runtimeEnv,
    );

    if (!result) {
      return json(
        { ok: false, requiresCheckout: true, message: 'Custom Domain billing is not active.' },
        { status: 402 },
      );
    }

    return json(result, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to attach the Custom Domain.';
    const requiresCheckout = /billing is not active|status 402/i.test(message);

    return json(
      { ok: false, requiresCheckout, message },
      { status: requiresCheckout ? 402 : 502, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  }
}
