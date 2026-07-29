import {
  json,
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  type MetaFunction,
} from '@remix-run/cloudflare';
import { Form, useActionData, useLoaderData } from '@remix-run/react';
import { APP_VERSION } from '@bolt/core/lib/version';
import { normalizeProfileReturnTo } from '@bolt/control-plane/server/profile-auth.mjs';
import { resolveRuntimeEnvFromContext } from '@bolt/runtime/lib/.server/runtime-env';
import {
  consumeProfileLogin,
  requestProfileLogin,
  resolveProfileSession,
  serializeProfileSession,
} from '~/lib/.server/profile-session';

export const meta: MetaFunction = () => [{ title: `Login | bolt.gives v${APP_VERSION}` }];

export async function loader({ context, request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const returnTo = normalizeProfileReturnTo(url.searchParams.get('returnTo'));
  const token = String(url.searchParams.get('token') || '');
  const profile = await resolveProfileSession(request, resolveRuntimeEnvFromContext(context));

  if (profile && !token) {
    return redirect(returnTo);
  }

  return json({ token, returnTo });
}

export async function action({ context, request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = String(formData.get('intent') || '');
  const returnTo = normalizeProfileReturnTo(formData.get('returnTo'));
  const runtimeEnv = resolveRuntimeEnvFromContext(context);

  try {
    if (intent === 'request-link') {
      const result = await requestProfileLogin(
        {
          email: String(formData.get('email') || ''),
          returnTo,
        },
        runtimeEnv,
      );
      return json({ message: result.message, error: null });
    }

    if (intent === 'consume-link') {
      const result = await consumeProfileLogin(String(formData.get('token') || ''), runtimeEnv);
      return redirect(returnTo, {
        headers: {
          'Set-Cookie': await serializeProfileSession(result.session, runtimeEnv),
        },
      });
    }

    return json({ message: null, error: 'Unknown login action.' }, { status: 400 });
  } catch (error) {
    return json(
      {
        message: null,
        error: error instanceof Error ? error.message : 'Unable to sign in.',
      },
      { status: 400 },
    );
  }
}

export default function LoginPage() {
  const { token, returnTo } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#10231d] px-4 py-12 text-[#10231d]">
      <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(#c9f36a_1px,transparent_1px),linear-gradient(90deg,#c9f36a_1px,transparent_1px)] [background-size:48px_48px]" />
      <div className="relative w-full max-w-lg rounded-[2rem] border border-[#10231d] bg-[#fffdf5] p-8 shadow-[14px_14px_0_#c9f36a] sm:p-10">
        <a href="/" className="font-mono text-xs font-black uppercase tracking-[0.22em] text-[#527065]">
          bolt.gives / v{APP_VERSION}
        </a>
        <h1 className="mt-7 font-serif text-5xl leading-none">{token ? 'Complete sign in.' : 'Welcome back.'}</h1>
        <p className="mt-4 text-sm leading-6 text-[#52645e]">
          {token
            ? 'Confirm this one-time link to reconnect your profile and projects.'
            : 'Enter your profile email. We will send a secure one-time link, so there is no password to remember.'}
        </p>

        {token ? (
          <Form method="post" className="mt-8">
            <input type="hidden" name="intent" value="consume-link" />
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <button
              type="submit"
              className="w-full rounded-xl border border-[#10231d] bg-[#c9f36a] px-5 py-4 text-sm font-black shadow-[4px_4px_0_#10231d] transition hover:-translate-y-0.5"
            >
              Continue to my workspace
            </button>
          </Form>
        ) : (
          <Form method="post" className="mt-8">
            <input type="hidden" name="intent" value="request-link" />
            <input type="hidden" name="returnTo" value={returnTo} />
            <label className="block">
              <span className="text-sm font-bold">Email address</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                className="mt-2 w-full rounded-xl border border-[#173f32]/25 bg-white px-4 py-3.5 text-sm outline-none focus:border-[#173f32] focus:ring-4 focus:ring-[#c9f36a]/40"
              />
            </label>
            <button
              type="submit"
              className="mt-6 w-full rounded-xl border border-[#10231d] bg-[#c9f36a] px-5 py-4 text-sm font-black shadow-[4px_4px_0_#10231d] transition hover:-translate-y-0.5"
            >
              Email my secure login link
            </button>
          </Form>
        )}

        {actionData?.message ? (
          <div className="mt-6 rounded-xl border border-emerald-700/30 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
            {actionData.message}
          </div>
        ) : null}
        {actionData?.error ? (
          <div className="mt-6 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
            {actionData.error}
          </div>
        ) : null}
      </div>
    </main>
  );
}
