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
import { APP_VERSION } from '~/lib/version';

type TenantAccount = {
  id: string;
  name: string;
  email: string;
  slug?: string;
  workspaceDir?: string;
  createdAt: string;
  updatedAt?: string;
  passwordUpdatedAt?: string;
  status?: 'pending' | 'active' | 'disabled';
  lastLoginAt?: string | null;
  mustChangePassword?: boolean;
  inviteExpiresAt?: string | null;
  invitePurpose?: 'onboarding' | 'password-reset' | null;
};

type TenantSession = {
  tenantId: string;
  email: string;
  issuedAt: string;
};

export const meta: MetaFunction = () => [{ title: `Tenant Portal | bolt.gives v${APP_VERSION}` }];

function getTenantCookieSecret() {
  if (typeof process !== 'undefined' && process.env?.BOLT_TENANT_COOKIE_SECRET?.trim()) {
    return process.env.BOLT_TENANT_COOKIE_SECRET.trim();
  }

  return 'bolt-tenant-dev-secret-change-me';
}

function createTenantCookie() {
  return createCookie('bolt_tenant_session', {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: typeof process !== 'undefined' ? process.env.NODE_ENV === 'production' : true,
    maxAge: 60 * 60 * 12,
    secrets: [getTenantCookieSecret()],
  });
}

function getRuntimeControlBaseUrl() {
  if (typeof process !== 'undefined' && process.env?.BOLT_RUNTIME_CONTROL_URL) {
    return process.env.BOLT_RUNTIME_CONTROL_URL.replace(/\/$/, '');
  }

  return 'http://127.0.0.1:4321/runtime';
}

async function fetchRuntimeJson<T>(pathname: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getRuntimeControlBaseUrl()}${pathname}`, init);

  if (!response.ok) {
    throw new Error((await response.text()) || `Runtime request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const inviteToken = new URL(request.url).searchParams.get('invite')?.trim() || '';
  const tenantCookie = createTenantCookie();
  const session = (await tenantCookie.parse(request.headers.get('Cookie'))) as TenantSession | undefined;
  let invite: {
    token: string;
    tenant: Pick<TenantAccount, 'name' | 'email' | 'status' | 'inviteExpiresAt' | 'invitePurpose'>;
  } | null = null;

  if (inviteToken) {
    try {
      const payload = await fetchRuntimeJson<{
        ok: boolean;
        tenant: Pick<TenantAccount, 'name' | 'email' | 'status' | 'inviteExpiresAt' | 'invitePurpose'>;
      }>(`/tenant-auth/invite?token=${encodeURIComponent(inviteToken)}`);
      invite = { token: inviteToken, tenant: payload.tenant };
    } catch {
      invite = null;
    }
  }

  if (!session?.tenantId) {
    return json({ authenticated: false, tenant: null as TenantAccount | null, invite });
  }

  try {
    const payload = await fetchRuntimeJson<{ ok: boolean; tenant: TenantAccount }>(
      `/tenant-auth/me?tenantId=${encodeURIComponent(session.tenantId)}`,
    );

    if (payload.tenant.email !== session.email) {
      return json(
        { authenticated: false, tenant: null as TenantAccount | null, invite },
        { headers: { 'Set-Cookie': await tenantCookie.serialize('', { maxAge: 0 }) } },
      );
    }

    return json({ authenticated: true, tenant: payload.tenant, invite });
  } catch {
    return json(
      { authenticated: false, tenant: null as TenantAccount | null, invite },
      { headers: { 'Set-Cookie': await tenantCookie.serialize('', { maxAge: 0 }) } },
    );
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const tenantCookie = createTenantCookie();
  const formData = await request.formData();
  const intent = String(formData.get('intent') || '');

  if (intent === 'logout') {
    return redirect('/tenant', {
      headers: { 'Set-Cookie': await tenantCookie.serialize('', { maxAge: 0 }) },
    });
  }

  if (intent === 'login') {
    const email = String(formData.get('email') || '')
      .trim()
      .toLowerCase();
    const password = String(formData.get('password') || '');

    try {
      const payload = await fetchRuntimeJson<{ ok: boolean; tenant: TenantAccount }>('/tenant-auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      return redirect('/tenant', {
        headers: {
          'Set-Cookie': await tenantCookie.serialize({
            tenantId: payload.tenant.id,
            email: payload.tenant.email,
            issuedAt: new Date().toISOString(),
          } satisfies TenantSession),
        },
      });
    } catch {
      return json({ error: 'Invalid tenant credentials.' }, { status: 400 });
    }
  }

  if (intent === 'change-password') {
    const session = (await tenantCookie.parse(request.headers.get('Cookie'))) as TenantSession | undefined;

    if (!session?.tenantId) {
      return json({ error: 'Sign in first.' }, { status: 401 });
    }

    const currentPassword = String(formData.get('currentPassword') || '');
    const nextPassword = String(formData.get('nextPassword') || '').trim();

    try {
      await fetchRuntimeJson<{ ok: boolean; tenant: TenantAccount }>('/tenant-auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: session.tenantId, currentPassword, nextPassword }),
      });
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : 'Unable to update the tenant password right now.' },
        { status: 400 },
      );
    }

    return redirect('/tenant');
  }

  if (intent === 'accept-invite') {
    const token = String(formData.get('token') || '').trim();
    const nextPassword = String(formData.get('nextPassword') || '').trim();

    try {
      const payload = await fetchRuntimeJson<{ ok: boolean; tenant: TenantAccount }>('/tenant-auth/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, nextPassword }),
      });

      return redirect('/tenant', {
        headers: {
          'Set-Cookie': await tenantCookie.serialize({
            tenantId: payload.tenant.id,
            email: payload.tenant.email,
            issuedAt: new Date().toISOString(),
          } satisfies TenantSession),
        },
      });
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : 'Unable to accept the invite right now.' },
        { status: 400 },
      );
    }
  }

  return json({ error: 'Unknown action.' }, { status: 400 });
}

export default function TenantPortalPage() {
  const { authenticated, tenant, invite } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary">
      <BackgroundRays />
      <Header />
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">
        <section className="rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2/90 p-6 shadow-xl backdrop-blur">
          <div className="flex flex-col gap-2">
            <div className="text-xs font-semibold uppercase tracking-[0.25em] text-bolt-elements-textTertiary">
              Tenant Portal
            </div>
            <h1 className="text-3xl font-semibold text-bolt-elements-textPrimary">Tenant account access</h1>
            <p className="max-w-2xl text-sm text-bolt-elements-textSecondary">
              Tenant users can sign in here, rotate bootstrap passwords, and confirm their isolated workspace details
              without using the admin dashboard.
            </p>
          </div>
        </section>

        {actionData?.error ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            {actionData.error}
          </div>
        ) : null}

        {!authenticated || !tenant ? (
          <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2/90 p-6 shadow-lg backdrop-blur">
              {invite ? (
                <>
                  <h2 className="text-xl font-semibold text-bolt-elements-textPrimary">Accept tenant invite</h2>
                  <p className="mt-2 text-sm text-bolt-elements-textSecondary">
                    {invite.tenant.invitePurpose === 'password-reset'
                      ? 'Set a new password to complete the forced reset for this tenant account.'
                      : 'Set the first password for this tenant account to complete onboarding.'}
                  </p>
                  <div className="mt-4 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4 text-sm text-bolt-elements-textSecondary">
                    <div className="font-medium text-bolt-elements-textPrimary">{invite.tenant.name}</div>
                    <div className="mt-1">{invite.tenant.email}</div>
                    <div className="mt-1 text-xs text-bolt-elements-textTertiary">
                      Invite valid until {invite.tenant.inviteExpiresAt || 'unknown'}
                    </div>
                  </div>
                  <Form method="post" className="mt-5 space-y-4">
                    <input type="hidden" name="intent" value="accept-invite" />
                    <input type="hidden" name="token" value={invite.token} />
                    <label className="block text-sm text-bolt-elements-textSecondary">
                      New password
                      <input
                        name="nextPassword"
                        type="password"
                        autoComplete="new-password"
                        minLength={10}
                        required
                        className="mt-1 w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary"
                      />
                    </label>
                    <button
                      type="submit"
                      className="rounded-lg bg-bolt-elements-item-backgroundAccent px-4 py-2 text-sm font-medium text-bolt-elements-item-contentAccent"
                    >
                      Accept invite
                    </button>
                  </Form>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-semibold text-bolt-elements-textPrimary">Tenant sign in</h2>
                  <p className="mt-2 text-sm text-bolt-elements-textSecondary">
                    Use the tenant email and password issued by your server operator.
                  </p>
                  <Form method="post" className="mt-5 space-y-4">
                    <input type="hidden" name="intent" value="login" />
                    <label className="block text-sm text-bolt-elements-textSecondary">
                      Email
                      <input
                        name="email"
                        type="email"
                        autoComplete="username"
                        required
                        className="mt-1 w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary"
                      />
                    </label>
                    <label className="block text-sm text-bolt-elements-textSecondary">
                      Password
                      <input
                        name="password"
                        type="password"
                        autoComplete="current-password"
                        required
                        className="mt-1 w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary"
                      />
                    </label>
                    <button
                      type="submit"
                      className="rounded-lg bg-bolt-elements-item-backgroundAccent px-4 py-2 text-sm font-medium text-bolt-elements-item-contentAccent"
                    >
                      Sign in
                    </button>
                  </Form>
                </>
              )}
            </div>

            <div className="rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2/80 p-6 shadow-lg backdrop-blur">
              <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">How this is used</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-bolt-elements-textSecondary">
                <li>New tenant accounts move through pending, approved, and disabled lifecycle states.</li>
                <li>Onboarding and forced password resets now use time-limited invite links.</li>
                <li>Each tenant keeps its own isolated workspace directory.</li>
                <li>Tenant lifecycle events are written into the shared audit trail.</li>
              </ul>
            </div>
          </section>
        ) : (
          <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2/90 p-6 shadow-lg backdrop-blur">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold text-bolt-elements-textPrimary">{tenant.name}</h2>
                  <p className="mt-1 text-sm text-bolt-elements-textSecondary">{tenant.email}</p>
                </div>
                <Form method="post">
                  <input type="hidden" name="intent" value="logout" />
                  <button
                    type="submit"
                    className="rounded-lg border border-bolt-elements-borderColor px-3 py-2 text-sm text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
                  >
                    Sign out
                  </button>
                </Form>
              </div>

              <dl className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
                  <dt className="text-xs uppercase tracking-wide text-bolt-elements-textTertiary">Workspace slug</dt>
                  <dd className="mt-2 text-sm text-bolt-elements-textPrimary">{tenant.slug || 'Not assigned yet'}</dd>
                </div>
                <div className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
                  <dt className="text-xs uppercase tracking-wide text-bolt-elements-textTertiary">Status</dt>
                  <dd className="mt-2 text-sm text-bolt-elements-textPrimary">{tenant.status || 'active'}</dd>
                </div>
                <div className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
                  <dt className="text-xs uppercase tracking-wide text-bolt-elements-textTertiary">Last sign-in</dt>
                  <dd className="mt-2 text-sm text-bolt-elements-textPrimary">{tenant.lastLoginAt || 'First login'}</dd>
                </div>
                <div className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
                  <dt className="text-xs uppercase tracking-wide text-bolt-elements-textTertiary">Password status</dt>
                  <dd className="mt-2 text-sm text-bolt-elements-textPrimary">
                    {tenant.mustChangePassword ? 'Rotation required' : 'Current'}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2/90 p-6 shadow-lg backdrop-blur">
              <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">Rotate password</h2>
              <p className="mt-2 text-sm text-bolt-elements-textSecondary">
                Tenant passwords must be at least 10 characters long.
              </p>
              <Form method="post" className="mt-5 space-y-4">
                <input type="hidden" name="intent" value="change-password" />
                <label className="block text-sm text-bolt-elements-textSecondary">
                  Current password
                  <input
                    name="currentPassword"
                    type="password"
                    autoComplete="current-password"
                    required
                    className="mt-1 w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary"
                  />
                </label>
                <label className="block text-sm text-bolt-elements-textSecondary">
                  New password
                  <input
                    name="nextPassword"
                    type="password"
                    autoComplete="new-password"
                    minLength={10}
                    required
                    className="mt-1 w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary"
                  />
                </label>
                <button
                  type="submit"
                  className="rounded-lg bg-bolt-elements-item-backgroundAccent px-4 py-2 text-sm font-medium text-bolt-elements-item-contentAccent"
                >
                  Update password
                </button>
              </Form>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
