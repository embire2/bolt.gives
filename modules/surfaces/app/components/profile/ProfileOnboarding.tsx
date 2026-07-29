import { useFetcher, useLocation } from '@remix-run/react';
import { useProfile } from '~/lib/profile-context';

type RegistrationActionData = {
  error?: string;
};

export function ProfileOnboarding() {
  const profile = useProfile();
  const fetcher = useFetcher<RegistrationActionData>();
  const location = useLocation();

  if (profile) {
    return null;
  }

  const busy = fetcher.state !== 'idle';
  const returnTo = `${location.pathname}${location.search}`;

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center overflow-y-auto bg-[#10231d]/80 px-4 py-8 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-onboarding-title"
    >
      <div className="relative w-full max-w-2xl overflow-hidden rounded-[2rem] border border-[#173f32] bg-[#fffdf5] text-[#10231d] shadow-[14px_14px_0_#c9f36a]">
        <div className="grid gap-0 md:grid-cols-[0.8fr_1.2fr]">
          <div className="relative overflow-hidden bg-[#173f32] p-7 text-[#fffdf5] sm:p-9">
            <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full border-[28px] border-[#c9f36a]/20" />
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-[#c9f36a]">
              Your personal workspace
            </p>
            <h2 id="profile-onboarding-title" className="mt-6 font-serif text-4xl leading-[0.95]">
              Let&apos;s know who we&apos;re building with.
            </h2>
            <p className="mt-6 text-sm leading-6 text-[#fffdf5]/70">
              Your profile keeps projects, history, usage, and deployment access connected to you. Authentication tokens
              stay server-side and are never added to generated code.
            </p>
            <div className="mt-10 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#c9f36a]">
              <span className="h-2 w-2 rounded-full bg-[#c9f36a]" />
              PostgreSQL-backed
            </div>
          </div>

          <fetcher.Form method="post" action="/profile/register" className="p-7 sm:p-9">
            <input type="hidden" name="returnTo" value={returnTo} />
            <div className="mb-7">
              <div className="text-xs font-black uppercase tracking-[0.2em] text-[#527065]">Create your profile</div>
              <p className="mt-2 text-sm text-[#52645e]">Three details, then you can start building.</p>
            </div>

            <label className="block">
              <span className="text-sm font-bold">Name and Surname</span>
              <input
                name="name"
                autoComplete="name"
                required
                minLength={3}
                maxLength={120}
                placeholder="Ada Lovelace"
                className="mt-2 w-full rounded-xl border border-[#173f32]/25 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#173f32] focus:ring-4 focus:ring-[#c9f36a]/40"
              />
            </label>

            <label className="mt-5 block">
              <span className="text-sm font-bold">Email address</span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                placeholder="ada@example.com"
                className="mt-2 w-full rounded-xl border border-[#173f32]/25 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#173f32] focus:ring-4 focus:ring-[#c9f36a]/40"
              />
            </label>

            <label className="mt-5 block">
              <span className="text-sm font-bold">Country</span>
              <input
                name="country"
                autoComplete="country-name"
                required
                minLength={2}
                maxLength={80}
                placeholder="South Africa"
                className="mt-2 w-full rounded-xl border border-[#173f32]/25 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#173f32] focus:ring-4 focus:ring-[#c9f36a]/40"
              />
            </label>

            {fetcher.data?.error ? (
              <div className="mt-5 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
                {fetcher.data.error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl border border-[#173f32] bg-[#c9f36a] px-5 py-3.5 text-sm font-black text-[#10231d] shadow-[4px_4px_0_#173f32] transition hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#173f32] disabled:cursor-wait disabled:opacity-60"
            >
              {busy ? 'Creating your workspace...' : 'Create profile and continue'}
              {!busy ? <span aria-hidden="true">→</span> : null}
            </button>

            <p className="mt-6 text-center text-sm text-[#52645e]">
              Already have a profile?{' '}
              <a
                href={`/login?returnTo=${encodeURIComponent(returnTo)}`}
                className="font-black text-[#173f32] underline decoration-[#c9f36a] decoration-4 underline-offset-4"
              >
                Login securely
              </a>
            </p>
          </fetcher.Form>
        </div>
      </div>
    </div>
  );
}
