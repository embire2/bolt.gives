import { json, redirect, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/cloudflare';
import { Form, useLoaderData } from '@remix-run/react';
import { ClientOnly } from 'remix-utils/client-only';
import { APP_VERSION } from '@bolt/core/lib/version';
import { resolveRuntimeEnvFromContext } from '@bolt/runtime/lib/.server/runtime-env';
import { resolveProfileSession } from '~/lib/.server/profile-session';
import { UsageBalanceBadge } from '~/components/header/UsageBalanceBadge.client';

export const meta: MetaFunction = () => [{ title: `Your Profile | bolt.gives v${APP_VERSION}` }];

export async function loader({ context, request }: LoaderFunctionArgs) {
  const profile = await resolveProfileSession(request, resolveRuntimeEnvFromContext(context));

  if (!profile) {
    return redirect('/login?returnTo=%2Fprofile');
  }

  return json({ profile });
}

export default function ProfilePage() {
  const { profile } = useLoaderData<typeof loader>();
  const initial = profile.name.charAt(0).toUpperCase();

  return (
    <main className="min-h-screen bg-[#eef2ec] px-4 py-10 text-[#10231d] sm:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="flex items-center justify-between">
          <a href="/" className="font-mono text-xs font-black uppercase tracking-[0.22em]">
            bolt.gives / v{APP_VERSION}
          </a>
          <a href="/chat" className="rounded-full bg-[#173f32] px-5 py-2.5 text-sm font-black text-white">
            Open workspace
          </a>
        </header>

        <section className="mt-10 overflow-hidden rounded-[2rem] border border-[#173f32] bg-[#fffdf5] shadow-[12px_12px_0_#c9f36a]">
          <div className="flex flex-col gap-6 border-b border-[#173f32] bg-[#173f32] p-8 text-white sm:flex-row sm:items-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-[#c9f36a] bg-[#fffdf5] font-serif text-4xl text-[#173f32]">
              {initial}
            </div>
            <div>
              <div className="text-xs font-black uppercase tracking-[0.2em] text-[#c9f36a]">Personal profile</div>
              <h1 className="mt-2 font-serif text-4xl">{profile.name}</h1>
            </div>
            <div className="sm:ml-auto">
              <ClientOnly>{() => <UsageBalanceBadge alwaysVisible />}</ClientOnly>
            </div>
          </div>

          <dl className="grid gap-px bg-[#173f32] sm:grid-cols-2">
            {[
              ['Email address', profile.email],
              ['Country', profile.country],
              ['Profile created', profile.createdAt ? new Date(profile.createdAt).toLocaleDateString() : 'Recently'],
              ['Last login', profile.lastLoginAt ? new Date(profile.lastLoginAt).toLocaleString() : 'This session'],
            ].map(([label, value]) => (
              <div key={label} className="bg-[#fffdf5] p-7">
                <dt className="text-xs font-black uppercase tracking-[0.16em] text-[#527065]">{label}</dt>
                <dd className="mt-3 break-words text-lg font-bold">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-col gap-4 p-8 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl text-sm leading-6 text-[#52645e]">
              Your authentication token is stored in a signed HTTP-only cookie. Only its hash is retained by the
              PostgreSQL profile service.
            </p>
            <Form method="post" action="/logout">
              <button
                type="submit"
                className="rounded-xl border border-[#173f32] bg-white px-5 py-3 text-sm font-black transition hover:bg-[#f4f7f1]"
              >
                Log out
              </button>
            </Form>
          </div>
        </section>
      </div>
    </main>
  );
}
