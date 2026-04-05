import {
  createCookie,
  json,
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  type MetaFunction,
} from '@remix-run/cloudflare';
import { Form, useActionData, useLoaderData } from '@remix-run/react';
import { Header } from '~/components/header/Header';
import BackgroundRays from '~/components/ui/BackgroundRays';
import { fetchRuntimeControlJson } from '~/lib/.server/runtime-control';
import type { ManagedInstanceRecord, ManagedInstanceSupport } from '~/lib/managed-instances';
import { APP_VERSION } from '~/lib/version';

type ManagedInstanceSession = {
  sessionToken: string;
  email: string;
  projectName: string;
  issuedAt: string;
  pagesUrl?: string;
  status?: ManagedInstanceRecord['status'];
  trialEndsAt?: string;
  currentGitSha?: string | null;
};

function getManagedInstanceCookieSecret() {
  if (typeof process !== 'undefined' && process.env?.BOLT_MANAGED_INSTANCE_COOKIE_SECRET?.trim()) {
    return process.env.BOLT_MANAGED_INSTANCE_COOKIE_SECRET.trim();
  }

  return 'bolt-managed-instance-dev-secret-change-me';
}

function createManagedInstanceCookie() {
  return createCookie('bolt_managed_instance', {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: typeof process !== 'undefined' ? process.env.NODE_ENV === 'production' : true,
    maxAge: 60 * 60 * 24 * 15,
    secrets: [getManagedInstanceCookieSecret()],
  });
}

export const meta: MetaFunction = () => [{ title: `Managed Cloudflare Trials | bolt.gives v${APP_VERSION}` }];

export async function loader({ request }: LoaderFunctionArgs) {
  const sessionCookie = createManagedInstanceCookie();
  const session = (await sessionCookie.parse(request.headers.get('Cookie'))) as ManagedInstanceSession | undefined;

  let support: ManagedInstanceSupport = {
    supported: false,
    reason: 'Managed Cloudflare trial instances are unavailable on this deployment.',
    trialDays: 15,
    rootDomain: 'pages.dev',
    sourceBranch: 'main',
  };
  let instance: ManagedInstanceRecord | null = null;

  try {
    support = await fetchRuntimeControlJson<ManagedInstanceSupport>('/managed-instances/config');
  } catch (error) {
    support = {
      supported: false,
      reason:
        error instanceof Error
          ? error.message
          : 'Managed Cloudflare trial instances are unavailable on this deployment.',
      trialDays: 15,
      rootDomain: 'pages.dev',
      sourceBranch: 'main',
    };
  }

  if (session?.sessionToken) {
    try {
      const payload = await fetchRuntimeControlJson<{ ok: boolean; instance: ManagedInstanceRecord }>(
        `/managed-instances/session?sessionToken=${encodeURIComponent(session.sessionToken)}`,
      );
      instance = payload.instance;
    } catch {
      if (session.projectName && session.pagesUrl && session.trialEndsAt) {
        instance = {
          id: `session:${session.projectName}`,
          name: session.projectName,
          projectName: session.projectName,
          routeHostname: new URL(session.pagesUrl).host,
          email: session.email,
          pagesUrl: session.pagesUrl,
          trialEndsAt: session.trialEndsAt,
          plan: `experimental-free-${support.trialDays}d`,
          currentGitSha: session.currentGitSha || null,
          previousGitSha: null,
          lastRolloutAt: session.issuedAt,
          lastDeploymentUrl: session.pagesUrl,
          status: session.status || 'active',
          createdAt: session.issuedAt,
          updatedAt: session.issuedAt,
          lastError: null,
          suspendedAt: null,
          expiredAt: null,
          sourceBranch: support.sourceBranch,
        } satisfies ManagedInstanceRecord;
      } else {
        instance = null;
      }
    }
  }

  return json(
    {
      support,
      instance,
      sessionEmail: session?.email || '',
      sessionProjectName: session?.projectName || '',
    },
    instance
      ? undefined
      : session?.sessionToken
        ? {
            headers: {
              'Set-Cookie': await sessionCookie.serialize('', { maxAge: 0 }),
            },
          }
        : undefined,
  );
}

export async function action({ request }: ActionFunctionArgs) {
  const sessionCookie = createManagedInstanceCookie();
  const session = (await sessionCookie.parse(request.headers.get('Cookie'))) as ManagedInstanceSession | undefined;
  const formData = await request.formData();
  const intent = String(formData.get('intent') || '');
  const sourceHost = new URL(request.url).host.toLowerCase();

  if (intent === 'clear-session') {
    return redirect('/managed-instances', {
      headers: {
        'Set-Cookie': await sessionCookie.serialize('', { maxAge: 0 }),
      },
    });
  }

  if (intent === 'spawn') {
    const name = String(formData.get('name') || '').trim();
    const email = String(formData.get('email') || '')
      .trim()
      .toLowerCase();
    const subdomain = String(formData.get('subdomain') || '')
      .trim()
      .toLowerCase();
    const company = String(formData.get('company') || '').trim();
    const role = String(formData.get('role') || '').trim();
    const phone = String(formData.get('phone') || '').trim();
    const country = String(formData.get('country') || '').trim();
    const useCase = String(formData.get('useCase') || '').trim();

    try {
      const payload = await fetchRuntimeControlJson<{
        ok: boolean;
        sessionToken: string;
        instance: ManagedInstanceRecord;
      }>('/managed-instances/spawn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          subdomain,
          company,
          role,
          phone,
          country,
          useCase,
          sourceHost,
          sessionToken: session?.sessionToken || undefined,
        }),
      });

      return redirect('/managed-instances', {
        headers: {
          'Set-Cookie': await sessionCookie.serialize({
            sessionToken: payload.sessionToken,
            email: payload.instance.email,
            projectName: payload.instance.projectName,
            issuedAt: new Date().toISOString(),
            pagesUrl: payload.instance.pagesUrl,
            status: payload.instance.status,
            trialEndsAt: payload.instance.trialEndsAt,
            currentGitSha: payload.instance.currentGitSha || null,
          } satisfies ManagedInstanceSession),
        },
      });
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : 'Unable to provision the managed trial instance.' },
        { status: 400 },
      );
    }
  }

  if (intent === 'refresh') {
    if (!session?.sessionToken || !session.projectName) {
      return json({ error: 'Managed instance session is missing. Spawn the trial instance again.' }, { status: 400 });
    }

    try {
      await fetchRuntimeControlJson<{ ok: boolean }>(
        `/managed-instances/${encodeURIComponent(session.projectName)}/refresh`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionToken: session.sessionToken }),
        },
      );
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : 'Unable to refresh the managed instance.' },
        { status: 400 },
      );
    }

    return redirect('/managed-instances');
  }

  if (intent === 'suspend') {
    if (!session?.sessionToken || !session.projectName) {
      return json({ error: 'Managed instance session is missing. Spawn the trial instance again.' }, { status: 400 });
    }

    try {
      await fetchRuntimeControlJson<{ ok: boolean }>(
        `/managed-instances/${encodeURIComponent(session.projectName)}/suspend`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionToken: session.sessionToken }),
        },
      );
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : 'Unable to suspend the managed instance.' },
        { status: 400 },
      );
    }

    return redirect('/managed-instances');
  }

  return json({ error: 'Unknown action.' }, { status: 400 });
}

export default function ManagedInstancesPage() {
  const { support, instance, sessionEmail, sessionProjectName } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const preferredHostname = instance ? `${instance.projectName}.${support.rootDomain}` : '';
  const assignedHostnameDiffers = Boolean(
    instance && instance.routeHostname && instance.routeHostname !== preferredHostname,
  );

  return (
    <div className="flex h-full w-full flex-col bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary">
      <BackgroundRays />
      <Header />
      <main className="modern-scrollbar flex-1 overflow-y-auto overflow-x-hidden px-4 py-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          <section className="rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2/90 p-6 shadow-xl backdrop-blur">
            <div className="text-xs font-semibold uppercase tracking-[0.25em] text-bolt-elements-textTertiary">
              Experimental Cloudflare trials
            </div>
            <h1 className="mt-2 text-3xl font-semibold text-bolt-elements-textPrimary">
              Spawn one managed bolt.gives instance for {support.trialDays} days
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-bolt-elements-textSecondary">
              This control plane provisions one Pages-hosted trial instance per client, keeps it tied to your original
              browser session, and rolls updates forward from the current stable build. Choose your preferred subdomain
              on <span className="font-mono">{support.rootDomain}</span>; the final assigned hostname follows Cloudflare
              availability and is shown below after provisioning.
            </p>
          </section>

          {actionData?.error ? (
            <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-200">
              {actionData.error}
            </div>
          ) : null}

          {!support.supported ? (
            <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-5 text-sm text-bolt-elements-textPrimary">
              {support.reason}
            </div>
          ) : null}

          <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-4">
              <Form
                reloadDocument
                method="post"
                className="rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2/90 p-6 shadow-lg backdrop-blur"
              >
                <input type="hidden" name="intent" value="spawn" />
                <h2 className="text-xl font-semibold text-bolt-elements-textPrimary">Request your trial instance</h2>
                <p className="mt-2 text-sm text-bolt-elements-textSecondary">
                  Registration is required before a trial can be provisioned. Your profile is stored in the private
                  admin panel and linked to the Cloudflare instance assigned to you. One client can hold one managed
                  instance. Repeating the request from the same browser session returns the same instance instead of
                  creating a second one.
                </p>

                <div className="mt-5 grid gap-4">
                  <label className="grid gap-2 text-sm text-bolt-elements-textSecondary">
                    Full name
                    <input
                      name="name"
                      required
                      minLength={2}
                      placeholder="Ada Lovelace"
                      className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-bolt-elements-textPrimary"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-bolt-elements-textSecondary">
                    Work email
                    <input
                      name="email"
                      type="email"
                      required
                      defaultValue={instance?.email || sessionEmail}
                      placeholder="owner@example.com"
                      className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-bolt-elements-textPrimary"
                    />
                  </label>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-2 text-sm text-bolt-elements-textSecondary">
                      Company
                      <input
                        name="company"
                        placeholder="OpenWeb"
                        className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-bolt-elements-textPrimary"
                      />
                    </label>

                    <label className="grid gap-2 text-sm text-bolt-elements-textSecondary">
                      Role
                      <input
                        name="role"
                        placeholder="Founder / Engineering Lead"
                        className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-bolt-elements-textPrimary"
                      />
                    </label>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-2 text-sm text-bolt-elements-textSecondary">
                      Phone
                      <input
                        name="phone"
                        placeholder="+27 ..."
                        className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-bolt-elements-textPrimary"
                      />
                    </label>

                    <label className="grid gap-2 text-sm text-bolt-elements-textSecondary">
                      Country
                      <input
                        name="country"
                        placeholder="South Africa"
                        className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-bolt-elements-textPrimary"
                      />
                    </label>
                  </div>

                  <label className="grid gap-2 text-sm text-bolt-elements-textSecondary">
                    Preferred subdomain
                    <div className="flex items-center rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2">
                      <input
                        name="subdomain"
                        required
                        minLength={3}
                        defaultValue={instance?.projectName || sessionProjectName}
                        placeholder="my-team-bolt"
                        className="min-w-0 flex-1 bg-transparent text-bolt-elements-textPrimary outline-none"
                      />
                      <span className="pl-3 text-xs font-mono text-bolt-elements-textSecondary">
                        .{support.rootDomain}
                      </span>
                    </div>
                  </label>

                  <label className="grid gap-2 text-sm text-bolt-elements-textSecondary">
                    What are you building?
                    <textarea
                      name="useCase"
                      rows={4}
                      placeholder="Describe the product, users, and what you need bolt.gives to help you build."
                      className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-bolt-elements-textPrimary"
                    />
                  </label>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={!support.supported}
                    className="rounded-lg bg-bolt-elements-button-primary-background px-4 py-2 text-sm font-medium text-bolt-elements-button-primary-text disabled:opacity-50"
                  >
                    Spawn trial instance
                  </button>
                </div>
              </Form>

              <Form
                reloadDocument
                method="post"
                className="rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2/90 p-4 shadow-lg backdrop-blur"
              >
                <input type="hidden" name="intent" value="clear-session" />
                <button
                  type="submit"
                  className="rounded-lg border border-bolt-elements-borderColor px-4 py-2 text-sm text-bolt-elements-textPrimary"
                >
                  Clear local instance session
                </button>
              </Form>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2/90 p-5 shadow-lg backdrop-blur">
                <div className="text-xs uppercase tracking-wide text-bolt-elements-textTertiary">Trial policy</div>
                <ul className="mt-3 space-y-2 text-sm text-bolt-elements-textSecondary">
                  <li>One client gets one Pages-hosted experimental instance.</li>
                  <li>Trial expires after {support.trialDays} days.</li>
                  <li>Updates follow the current stable branch: {support.sourceBranch}.</li>
                  <li>The FREE provider still boots with DeepSeek V3.2 preselected.</li>
                  <li>Your registration profile is stored in the private admin panel for operator support.</li>
                </ul>
              </div>

              {instance ? (
                <div className="rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2/90 p-5 shadow-lg backdrop-blur">
                  <div className="text-xs uppercase tracking-wide text-bolt-elements-textTertiary">
                    Current instance
                  </div>
                  <div className="mt-3 text-lg font-semibold text-bolt-elements-textPrimary">
                    {instance.projectName}
                  </div>
                  <div className="mt-1 text-sm text-bolt-elements-textSecondary">{instance.pagesUrl}</div>
                  {assignedHostnameDiffers ? (
                    <div className="mt-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                      Cloudflare assigned <span className="font-mono">{instance.routeHostname}</span> because the
                      preferred hostname <span className="font-mono">{preferredHostname}</span> was not available.
                      Always use the assigned live URL shown above.
                    </div>
                  ) : null}
                  <div className="mt-4 grid gap-2 text-sm text-bolt-elements-textSecondary">
                    <div>Status: {instance.status}</div>
                    <div>Trial ends: {new Date(instance.trialEndsAt).toLocaleString()}</div>
                    <div>Current git SHA: {instance.currentGitSha || 'pending first rollout'}</div>
                    {instance.lastError ? <div className="text-red-300">Last error: {instance.lastError}</div> : null}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <a
                      href={instance.pagesUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg bg-bolt-elements-button-primary-background px-4 py-2 text-sm font-medium text-bolt-elements-button-primary-text"
                    >
                      Open instance
                    </a>
                    <Form reloadDocument method="post">
                      <input type="hidden" name="intent" value="refresh" />
                      <button className="rounded-lg border border-bolt-elements-borderColor px-4 py-2 text-sm text-bolt-elements-textPrimary">
                        Refresh from current build
                      </button>
                    </Form>
                    <Form reloadDocument method="post">
                      <input type="hidden" name="intent" value="suspend" />
                      <button className="rounded-lg border border-red-400/40 px-4 py-2 text-sm text-red-200">
                        Suspend trial
                      </button>
                    </Form>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
