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
  trialEndsAt?: string | null;
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
    maxAge: 60 * 60 * 24 * 365,
    secrets: [getManagedInstanceCookieSecret()],
  });
}

export const meta: MetaFunction = () => [{ title: `Managed Cloudflare Instances | bolt.gives v${APP_VERSION}` }];

export async function loader({ request }: LoaderFunctionArgs) {
  const sessionCookie = createManagedInstanceCookie();
  const session = (await sessionCookie.parse(request.headers.get('Cookie'))) as ManagedInstanceSession | undefined;

  let support: ManagedInstanceSupport = {
    supported: false,
    reason: 'Managed Cloudflare instances are unavailable on this deployment.',
    trialDays: 0,
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
        error instanceof Error ? error.message : 'Managed Cloudflare instances are unavailable on this deployment.',
      trialDays: 0,
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
      if (session.projectName && session.pagesUrl) {
        instance = {
          id: `session:${session.projectName}`,
          name: session.projectName,
          projectName: session.projectName,
          routeHostname: new URL(session.pagesUrl).host,
          email: session.email,
          pagesUrl: session.pagesUrl,
          trialEndsAt: session.trialEndsAt || null,
          plan: support.trialDays > 0 ? `experimental-free-${support.trialDays}d` : 'experimental-free-indefinite',
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
        { error: error instanceof Error ? error.message : 'Unable to provision the managed instance.' },
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
  const panelClass =
    'rounded-2xl border border-slate-200 bg-white/95 p-6 shadow-xl ring-1 ring-slate-950/5 backdrop-blur dark:border-bolt-elements-borderColor dark:bg-bolt-elements-background-depth-2/90 dark:ring-white/5';
  const panelInsetClass =
    'rounded-xl border border-slate-200 bg-slate-50/95 px-4 py-3 shadow-sm dark:border-bolt-elements-borderColor dark:bg-bolt-elements-background-depth-1';
  const kickerClass =
    'text-xs font-semibold uppercase tracking-[0.25em] text-slate-500 dark:text-bolt-elements-textTertiary';
  const titleClass = 'text-slate-950 dark:text-bolt-elements-textPrimary';
  const bodyClass = 'text-sm leading-6 text-slate-700 dark:text-bolt-elements-textSecondary';
  const labelClass = 'grid gap-2 text-sm font-medium text-slate-700 dark:text-bolt-elements-textSecondary';
  const inputClass =
    'rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 placeholder:text-slate-400 dark:border-bolt-elements-borderColor dark:bg-bolt-elements-background-depth-1 dark:text-bolt-elements-textPrimary dark:placeholder:text-bolt-elements-textTertiary';
  const secondaryButtonClass =
    'rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 dark:border-bolt-elements-borderColor dark:bg-transparent dark:text-bolt-elements-textPrimary dark:hover:border-bolt-elements-focus dark:hover:bg-bolt-elements-background-depth-1';
  const primaryButtonClass =
    'rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50';
  const preferredHostname = instance ? `${instance.projectName}.${support.rootDomain}` : '';
  const assignedHostnameDiffers = Boolean(
    instance && instance.routeHostname && instance.routeHostname !== preferredHostname,
  );
  const instanceDetails = instance
    ? [
        { label: 'Live URL', value: instance.pagesUrl },
        { label: 'Assigned hostname', value: instance.routeHostname },
        { label: 'Status', value: instance.status },
        {
          label: 'Availability',
          value: instance.trialEndsAt
            ? `Until ${new Date(instance.trialEndsAt).toLocaleString()}`
            : 'Indefinite for now',
        },
        { label: 'Current git SHA', value: instance.currentGitSha || 'pending first rollout' },
        { label: 'Support email', value: instance.email },
      ]
    : [];

  return (
    <div className="flex h-full w-full flex-col bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary">
      <BackgroundRays />
      <Header />
      <main className="modern-scrollbar flex-1 overflow-y-auto overflow-x-hidden px-4 py-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          <section className={panelClass}>
            <div className={kickerClass}>Experimental Cloudflare managed instances</div>
            <h1 className={`mt-2 text-3xl font-semibold ${titleClass}`}>Spawn one managed bolt.gives instance</h1>
            <p className={`mt-3 max-w-3xl ${bodyClass}`}>
              This control plane provisions one Pages-hosted managed instance per client, keeps it tied to your original
              browser session, and rolls updates forward from the current stable build. Choose your preferred subdomain
              on <span className="font-mono">{support.rootDomain}</span>; the final assigned hostname follows Cloudflare
              availability and is shown below after provisioning.
            </p>
          </section>

          {actionData?.error ? (
            <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-500/10 dark:text-red-200">
              {actionData.error}
            </div>
          ) : null}

          {!support.supported ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-bolt-elements-textPrimary">
              {support.reason}
            </div>
          ) : null}

          <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-4">
              {instance ? (
                <>
                  <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-6 shadow-lg backdrop-blur dark:border-emerald-400/30 dark:bg-emerald-500/10">
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-200">
                      Managed instance ready
                    </div>
                    <h2 className={`mt-2 text-2xl font-semibold ${titleClass}`}>Your bolt.gives server is live</h2>
                    <a
                      href={instance.pagesUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 block break-all rounded-xl border border-emerald-300 bg-white px-4 py-4 text-lg font-semibold text-emerald-800 underline decoration-emerald-600 underline-offset-4 transition hover:text-emerald-900 dark:border-emerald-300/30 dark:bg-bolt-elements-background-depth-1 dark:text-emerald-200 dark:hover:text-white"
                    >
                      {instance.pagesUrl}
                    </a>
                    <p className={`mt-4 ${bodyClass}`}>
                      Bookmark the live URL above. This browser session is already linked to your active managed
                      instance, so you do not need to complete the registration form again.
                    </p>
                    {assignedHostnameDiffers ? (
                      <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-100">
                        Cloudflare assigned <span className="font-mono">{instance.routeHostname}</span> because the
                        preferred hostname <span className="font-mono">{preferredHostname}</span> was not available.
                        Always use the live URL shown above.
                      </div>
                    ) : null}
                  </div>

                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
                    <div className={panelClass}>
                      <div className={`text-xs uppercase tracking-wide ${kickerClass}`}>Server details</div>
                      <dl className="mt-4 grid gap-4 md:grid-cols-2">
                        {instanceDetails.map((detail) => (
                          <div key={detail.label} className={panelInsetClass}>
                            <dt className={`text-xs uppercase tracking-wide ${kickerClass}`}>{detail.label}</dt>
                            <dd className={`mt-2 break-all text-sm font-medium ${titleClass}`}>{detail.value}</dd>
                          </div>
                        ))}
                      </dl>
                      {instance.lastError ? (
                        <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-500/10 dark:text-red-200">
                          Last runtime error: {instance.lastError}
                        </div>
                      ) : null}
                    </div>

                    <div className="space-y-4">
                      <div className={panelClass}>
                        <div className={`text-xs uppercase tracking-wide ${kickerClass}`}>Actions</div>
                        <div className="mt-4 flex flex-col gap-3">
                          <a
                            href={instance.pagesUrl}
                            target="_blank"
                            rel="noreferrer"
                            className={`${primaryButtonClass} text-center`}
                          >
                            Open live instance
                          </a>
                          <Form reloadDocument method="post">
                            <input type="hidden" name="intent" value="refresh" />
                            <button className={`w-full ${secondaryButtonClass}`}>Refresh from current build</button>
                          </Form>
                          <Form reloadDocument method="post">
                            <input type="hidden" name="intent" value="suspend" />
                            <button className="w-full rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 dark:border-red-400/40 dark:bg-transparent dark:text-red-200 dark:hover:bg-red-500/10">
                              Suspend instance
                            </button>
                          </Form>
                        </div>
                      </div>

                      <Form reloadDocument method="post" className={panelClass}>
                        <input type="hidden" name="intent" value="clear-session" />
                        <div className={`text-xs uppercase tracking-wide ${kickerClass}`}>
                          Need a different instance?
                        </div>
                        <p className={`mt-3 ${bodyClass}`}>
                          Clear the local session only if support has told you to restart the managed-instance flow or
                          switch to a different assigned instance.
                        </p>
                        <button type="submit" className={`mt-4 ${secondaryButtonClass}`}>
                          Clear local instance session
                        </button>
                      </Form>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <Form reloadDocument method="post" className={panelClass}>
                    <input type="hidden" name="intent" value="spawn" />
                    <h2 className={`text-xl font-semibold ${titleClass}`}>Request your managed instance</h2>
                    <p className={`mt-2 ${bodyClass}`}>
                      Registration is required before an instance can be provisioned. Your profile is stored in the
                      private admin panel and linked to the Cloudflare instance assigned to you. One client can hold one
                      managed instance. Repeating the request from the same browser session returns the same instance
                      instead of creating a second one.
                    </p>

                    <div className="mt-5 grid gap-4">
                      <label className={labelClass}>
                        Full name
                        <input name="name" required minLength={2} placeholder="Ada Lovelace" className={inputClass} />
                      </label>

                      <label className={labelClass}>
                        Work email
                        <input
                          name="email"
                          type="email"
                          required
                          defaultValue={sessionEmail}
                          placeholder="owner@example.com"
                          className={inputClass}
                        />
                      </label>

                      <div className="grid gap-4 md:grid-cols-2">
                        <label className={labelClass}>
                          Company
                          <input name="company" placeholder="OpenWeb" className={inputClass} />
                        </label>

                        <label className={labelClass}>
                          Role
                          <input name="role" placeholder="Founder / Engineering Lead" className={inputClass} />
                        </label>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <label className={labelClass}>
                          Phone
                          <input name="phone" placeholder="+27 ..." className={inputClass} />
                        </label>

                        <label className={labelClass}>
                          Country
                          <input name="country" placeholder="South Africa" className={inputClass} />
                        </label>
                      </div>

                      <label className={labelClass}>
                        Preferred subdomain
                        <div className="flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 shadow-sm focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-500/20 dark:border-bolt-elements-borderColor dark:bg-bolt-elements-background-depth-1">
                          <input
                            name="subdomain"
                            required
                            minLength={3}
                            defaultValue={sessionProjectName}
                            placeholder="my-team-bolt"
                            className="min-w-0 flex-1 bg-transparent text-slate-950 outline-none placeholder:text-slate-400 dark:text-bolt-elements-textPrimary dark:placeholder:text-bolt-elements-textTertiary"
                          />
                          <span className="pl-3 text-xs font-mono text-slate-500 dark:text-bolt-elements-textSecondary">
                            .{support.rootDomain}
                          </span>
                        </div>
                      </label>

                      <label className={labelClass}>
                        What are you building?
                        <textarea
                          name="useCase"
                          rows={4}
                          placeholder="Describe the product, users, and what you need bolt.gives to help you build."
                          className={inputClass}
                        />
                      </label>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-3">
                      <button type="submit" disabled={!support.supported} className={primaryButtonClass}>
                        Spawn managed instance
                      </button>
                    </div>
                  </Form>

                  <Form reloadDocument method="post" className={panelClass}>
                    <input type="hidden" name="intent" value="clear-session" />
                    <button type="submit" className={secondaryButtonClass}>
                      Clear local instance session
                    </button>
                  </Form>
                </>
              )}
            </div>

            <div className="space-y-4">
              <div className={panelClass}>
                <div className={`text-xs uppercase tracking-wide ${kickerClass}`}>Managed instance policy</div>
                <ul className={`mt-3 space-y-2 ${bodyClass}`}>
                  <li>One client gets one Pages-hosted experimental instance.</li>
                  <li>Instances are currently available indefinitely unless suspended by the operator.</li>
                  <li>Updates follow the current stable branch: {support.sourceBranch}.</li>
                  <li>The FREE provider now boots with DeepSeek V3.2 preselected.</li>
                  <li>
                    Your registration profile, including your email address, is stored in the private admin panel for
                    operator support and messaging.
                  </li>
                </ul>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
