import { useFetcher } from '@remix-run/react';
import { OnboardingDialog } from './OnboardingDialog';

export function SingleUserOnboarding({ returnTo }: { returnTo: string }) {
  const fetcher = useFetcher<{ error?: string }>();
  const busy = fetcher.state !== 'idle';

  return (
    <OnboardingDialog titleId="owner-login-title">
      <fetcher.Form
        method="post"
        action="/profile/register"
        className="m-auto w-full max-w-lg rounded-3xl bg-[#fffdf5] p-8 shadow-xl"
      >
        <h2 id="owner-login-title" className="font-serif text-4xl">
          Your private workspace
        </h2>
        <p className="my-5 text-sm leading-6">
          This server is in single-owner mode. Enter the owner access token from your server&apos;s protected .env.local
          file (BOLT_SELF_HOST_ACCESS_TOKEN). No PostgreSQL or email service is required.
        </p>
        <input type="hidden" name="returnTo" value={returnTo} />
        <label className="block font-bold">
          Owner access token
          <input
            name="accessToken"
            type="password"
            autoComplete="current-password"
            required
            minLength={32}
            maxLength={256}
            className="my-3 w-full rounded-xl border border-[#173f32] bg-white px-4 py-3 focus:outline-2 focus:outline-[#173f32]"
          />
        </label>
        {fetcher.data?.error && (
          <p role="alert" className="my-3 text-sm text-red-800">
            {fetcher.data.error}
          </p>
        )}
        <button
          disabled={busy}
          type="submit"
          className="w-full rounded-xl border border-[#173f32] bg-[#c9f36a] px-5 py-4 font-bold disabled:opacity-60"
        >
          {busy ? 'Opening workspace...' : 'Open my workspace'}
        </button>
        <p className="mt-5 text-sm">
          After signing in, select a provider and enter your own API key to start coding. This is one private owner
          profile, not a multi-user hosted service.
        </p>
      </fetcher.Form>
    </OnboardingDialog>
  );
}
