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
import type { ManagedInstanceOperatorRecord, ManagedInstanceSupport } from '~/lib/managed-instances';
import { APP_VERSION } from '~/lib/version';

type TenantRecord = {
  id: string;
  name: string;
  email: string;
  slug?: string;
  workspaceDir?: string;
  passwordHash: string;
  createdAt: string;
  updatedAt?: string;
  passwordUpdatedAt?: string;
  status?: 'pending' | 'active' | 'disabled';
  lastLoginAt?: string | null;
  mustChangePassword?: boolean;
  inviteToken?: string | null;
  inviteExpiresAt?: string | null;
  inviteIssuedAt?: string | null;
  invitePurpose?: 'onboarding' | 'password-reset' | null;
  approvedAt?: string | null;
  approvedBy?: string | null;
  disabledAt?: string | null;
  disabledBy?: string | null;
};

type TenantAdminRecord = {
  username: string;
  mustChangePassword: boolean;
  updatedAt: string | null;
  passwordUpdatedAt?: string | null;
  lastLoginAt: string | null;
};

export const meta: MetaFunction = () => [{ title: `Tenant Admin | bolt.gives v${APP_VERSION}` }];

const DEFAULT_ADMIN = { username: 'admin', password: 'admin' };

function getTenantAdminCookieSecret() {
  if (typeof process !== 'undefined' && process.env?.BOLT_TENANT_ADMIN_COOKIE_SECRET?.trim()) {
    return process.env.BOLT_TENANT_ADMIN_COOKIE_SECRET.trim();
  }

  return 'bolt-tenant-admin-dev-secret-change-me';
}

function createAdminSessionCookie() {
  return createCookie('bolt_tenant_admin', {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: typeof process !== 'undefined' ? process.env.NODE_ENV === 'production' : true,
    maxAge: 60 * 60 * 12,
    secrets: [getTenantAdminCookieSecret()],
  });
}

type TenantAdminSession = {
  username: string;
  issuedAt: string;
};

function isAuthenticatedAdminSession(
  session: TenantAdminSession | null | undefined,
  admin: TenantAdminRecord | undefined,
) {
  return Boolean(session?.username && admin?.username && session.username === admin.username);
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
  const adminSessionCookie = createAdminSessionCookie();
  const session = (await adminSessionCookie.parse(request.headers.get('Cookie'))) as TenantAdminSession | undefined;

  try {
    const status = await fetchRuntimeJson<{
      supported: boolean;
      tenants: TenantRecord[];
      managedSupport?: ManagedInstanceSupport;
      managedInstances?: ManagedInstanceOperatorRecord[];
      admin?: TenantAdminRecord;
      auditTrail?: Array<{
        id: string;
        timestamp: string;
        actor: string;
        action: string;
        target: string;
        details?: Record<string, string>;
      }>;
    }>('/tenant-admin/status');
    const authenticated = isAuthenticatedAdminSession(session, status.admin);

    return json({
      supported: status.supported,
      authenticated,
      defaultAdmin: DEFAULT_ADMIN,
      admin: status.admin || {
        username: DEFAULT_ADMIN.username,
        mustChangePassword: true,
        updatedAt: null,
        lastLoginAt: null,
      },
      tenants: authenticated ? status.tenants : [],
      managedSupport: status.managedSupport || {
        supported: false,
        reason: 'Managed Cloudflare trials are unavailable on this deployment.',
        trialDays: 15,
        rootDomain: 'pages.dev',
        sourceBranch: 'main',
      },
      managedInstances: authenticated ? status.managedInstances || [] : [],
      auditTrail: authenticated ? status.auditTrail || [] : [],
    });
  } catch {
    return json({
      supported: false,
      authenticated: false,
      defaultAdmin: DEFAULT_ADMIN,
      admin: {
        username: DEFAULT_ADMIN.username,
        mustChangePassword: true,
        updatedAt: null,
        lastLoginAt: null,
      } as TenantAdminRecord,
      tenants: [] as TenantRecord[],
      managedSupport: {
        supported: false,
        reason: 'Managed Cloudflare trials are unavailable on this deployment.',
        trialDays: 15,
        rootDomain: 'pages.dev',
        sourceBranch: 'main',
      } satisfies ManagedInstanceSupport,
      managedInstances: [] as ManagedInstanceOperatorRecord[],
      auditTrail: [] as Array<{
        id: string;
        timestamp: string;
        actor: string;
        action: string;
        target: string;
        details?: Record<string, string>;
      }>,
    });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const adminSessionCookie = createAdminSessionCookie();
  const formData = await request.formData();
  const intent = String(formData.get('intent') || '');

  if (intent === 'logout') {
    return redirect('/tenant-admin', {
      headers: { 'Set-Cookie': await adminSessionCookie.serialize('', { maxAge: 0 }) },
    });
  }

  if (intent === 'login') {
    const username = String(formData.get('username') || '');
    const password = String(formData.get('password') || '');

    try {
      await fetchRuntimeJson<{ ok: boolean }>('/tenant-admin/verify-admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });
    } catch {
      return json({ error: 'Invalid tenant admin credentials.' }, { status: 400 });
    }

    return redirect('/tenant-admin', {
      headers: {
        'Set-Cookie': await adminSessionCookie.serialize({
          username,
          issuedAt: new Date().toISOString(),
        } satisfies TenantAdminSession),
      },
    });
  }

  if (intent === 'create-tenant') {
    const status = await fetchRuntimeJson<{
      supported: boolean;
      admin?: TenantAdminRecord;
    }>('/tenant-admin/status');
    const session = (await adminSessionCookie.parse(request.headers.get('Cookie'))) as TenantAdminSession | undefined;

    if (!isAuthenticatedAdminSession(session, status.admin)) {
      return json({ error: 'Sign in as tenant admin first.' }, { status: 401 });
    }

    const name = String(formData.get('name') || '').trim();
    const email = String(formData.get('email') || '')
      .trim()
      .toLowerCase();

    if (!name || !email) {
      return json({ error: 'Name and email are required.' }, { status: 400 });
    }

    try {
      await fetchRuntimeJson<{ ok: boolean }>('/tenant-admin/tenants', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, email }),
      });
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : 'Unable to create tenant right now.' },
        { status: 400 },
      );
    }

    return redirect('/tenant-admin');
  }

  if (intent === 'change-admin-password') {
    const status = await fetchRuntimeJson<{
      supported: boolean;
      admin?: TenantAdminRecord;
    }>('/tenant-admin/status');
    const session = (await adminSessionCookie.parse(request.headers.get('Cookie'))) as TenantAdminSession | undefined;

    if (!isAuthenticatedAdminSession(session, status.admin)) {
      return json({ error: 'Sign in as tenant admin first.' }, { status: 401 });
    }

    const currentPassword = String(formData.get('currentPassword') || '');
    const nextPassword = String(formData.get('nextPassword') || '').trim();

    try {
      await fetchRuntimeJson<{ ok: boolean }>('/tenant-admin/admin/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ currentPassword, nextPassword }),
      });
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : 'Unable to update the admin password right now.' },
        { status: 400 },
      );
    }

    return redirect('/tenant-admin');
  }

  if (intent === 'toggle-tenant-status') {
    const statusPayload = await fetchRuntimeJson<{
      supported: boolean;
      admin?: TenantAdminRecord;
    }>('/tenant-admin/status');
    const session = (await adminSessionCookie.parse(request.headers.get('Cookie'))) as TenantAdminSession | undefined;

    if (!isAuthenticatedAdminSession(session, statusPayload.admin)) {
      return json({ error: 'Sign in as tenant admin first.' }, { status: 401 });
    }

    const tenantId = String(formData.get('tenantId') || '').trim();
    const status = String(formData.get('status') || '').trim() === 'disabled' ? 'disabled' : 'active';

    try {
      await fetchRuntimeJson<{ ok: boolean }>(`/tenant-admin/tenants/${encodeURIComponent(tenantId)}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : 'Unable to update tenant status right now.' },
        { status: 400 },
      );
    }

    return redirect('/tenant-admin');
  }

  if (intent === 'approve-tenant') {
    const statusPayload = await fetchRuntimeJson<{
      supported: boolean;
      admin?: TenantAdminRecord;
    }>('/tenant-admin/status');
    const session = (await adminSessionCookie.parse(request.headers.get('Cookie'))) as TenantAdminSession | undefined;

    if (!isAuthenticatedAdminSession(session, statusPayload.admin)) {
      return json({ error: 'Sign in as tenant admin first.' }, { status: 401 });
    }

    const tenantId = String(formData.get('tenantId') || '').trim();

    try {
      await fetchRuntimeJson<{ ok: boolean }>(`/tenant-admin/tenants/${encodeURIComponent(tenantId)}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : 'Unable to approve the tenant right now.' },
        { status: 400 },
      );
    }

    return redirect('/tenant-admin');
  }

  if (intent === 'issue-tenant-invite') {
    const statusPayload = await fetchRuntimeJson<{
      supported: boolean;
      admin?: TenantAdminRecord;
    }>('/tenant-admin/status');
    const session = (await adminSessionCookie.parse(request.headers.get('Cookie'))) as TenantAdminSession | undefined;

    if (!isAuthenticatedAdminSession(session, statusPayload.admin)) {
      return json({ error: 'Sign in as tenant admin first.' }, { status: 401 });
    }

    const tenantId = String(formData.get('tenantId') || '').trim();
    const purpose = String(formData.get('purpose') || '').trim() === 'password-reset' ? 'password-reset' : 'onboarding';

    try {
      await fetchRuntimeJson<{ ok: boolean }>(`/tenant-admin/tenants/${encodeURIComponent(tenantId)}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ purpose }),
      });
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : 'Unable to issue the tenant invite right now.' },
        { status: 400 },
      );
    }

    return redirect('/tenant-admin');
  }

  if (intent === 'reset-tenant-password') {
    const statusPayload = await fetchRuntimeJson<{
      supported: boolean;
      admin?: TenantAdminRecord;
    }>('/tenant-admin/status');
    const session = (await adminSessionCookie.parse(request.headers.get('Cookie'))) as TenantAdminSession | undefined;

    if (!isAuthenticatedAdminSession(session, statusPayload.admin)) {
      return json({ error: 'Sign in as tenant admin first.' }, { status: 401 });
    }

    const tenantId = String(formData.get('tenantId') || '').trim();
    const password = String(formData.get('password') || '').trim();

    try {
      await fetchRuntimeJson<{ ok: boolean }>(`/tenant-admin/tenants/${encodeURIComponent(tenantId)}/password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : 'Unable to reset the tenant password right now.' },
        { status: 400 },
      );
    }

    return redirect('/tenant-admin');
  }

  if (intent === 'refresh-managed-instance' || intent === 'suspend-managed-instance') {
    const statusPayload = await fetchRuntimeJson<{
      supported: boolean;
      admin?: TenantAdminRecord;
    }>('/tenant-admin/status');
    const session = (await adminSessionCookie.parse(request.headers.get('Cookie'))) as TenantAdminSession | undefined;

    if (!isAuthenticatedAdminSession(session, statusPayload.admin)) {
      return json({ error: 'Sign in as tenant admin first.' }, { status: 401 });
    }

    const slug = String(formData.get('slug') || '').trim();

    if (!slug) {
      return json({ error: 'Managed instance slug is required.' }, { status: 400 });
    }

    const pathname =
      intent === 'refresh-managed-instance'
        ? `/tenant-admin/managed-instances/${encodeURIComponent(slug)}/refresh`
        : `/tenant-admin/managed-instances/${encodeURIComponent(slug)}/suspend`;

    try {
      await fetchRuntimeJson<{ ok: boolean }>(pathname, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
    } catch (error) {
      return json(
        {
          error:
            error instanceof Error
              ? error.message
              : intent === 'refresh-managed-instance'
                ? 'Unable to refresh the managed instance right now.'
                : 'Unable to suspend the managed instance right now.',
        },
        { status: 400 },
      );
    }

    return redirect('/tenant-admin');
  }

  return json({ error: 'Unknown action.' }, { status: 400 });
}

export default function TenantAdminPage() {
  const { supported, authenticated, tenants, managedSupport, managedInstances, defaultAdmin, admin, auditTrail } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="flex h-full w-full flex-col bg-bolt-elements-background-depth-1">
      <BackgroundRays />
      <Header />
      <main className="flex-1 overflow-auto px-4 py-8">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          <div className="rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6 shadow-sm">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-bolt-elements-textPrimary">Tenant Admin</h1>
                <p className="mt-2 text-sm text-bolt-elements-textSecondary">
                  Manage self-hosted tenant accounts for this server instance. Default bootstrap login:{' '}
                  <span className="font-mono">admin / admin</span>.
                </p>
                {admin.mustChangePassword ? (
                  <p className="mt-2 text-sm text-amber-300">
                    The bootstrap admin password is still active. Rotate it before onboarding production tenants.
                  </p>
                ) : null}
              </div>
              {authenticated ? (
                <Form method="post">
                  <input type="hidden" name="intent" value="logout" />
                  <button className="rounded-lg border border-bolt-elements-borderColor px-4 py-2 text-sm text-bolt-elements-textPrimary hover:border-bolt-elements-focus">
                    Sign out
                  </button>
                </Form>
              ) : null}
            </div>
          </div>

          {!supported ? (
            <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-5 text-sm text-bolt-elements-textPrimary">
              Tenant admin requires a server-hosted deployment with filesystem persistence. This Cloudflare/static
              runtime does not expose that control plane.
            </div>
          ) : null}

          {actionData?.error ? (
            <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-200">
              {actionData.error}
            </div>
          ) : null}

          {supported && !authenticated ? (
            <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <Form
                method="post"
                className="rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6 shadow-sm"
              >
                <input type="hidden" name="intent" value="login" />
                <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">Tenant Admin Sign In</h2>
                <div className="mt-4 grid gap-4">
                  <label className="grid gap-2 text-sm text-bolt-elements-textSecondary">
                    Username
                    <input
                      name="username"
                      defaultValue={defaultAdmin.username}
                      className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-bolt-elements-textPrimary"
                    />
                  </label>
                  <label className="grid gap-2 text-sm text-bolt-elements-textSecondary">
                    Password
                    <input
                      name="password"
                      type="password"
                      defaultValue={defaultAdmin.password}
                      className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-bolt-elements-textPrimary"
                    />
                  </label>
                </div>
                <button className="mt-5 rounded-lg bg-bolt-elements-button-primary-background px-4 py-2 text-sm font-medium text-bolt-elements-button-primary-text">
                  Sign in
                </button>
              </Form>

              <div className="rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">What this dashboard controls</h2>
                <ul className="mt-4 space-y-2 text-sm text-bolt-elements-textSecondary">
                  <li>One server-local tenant registry for this instance.</li>
                  <li>Bootstrap admin account with required password rotation after first sign-in.</li>
                  <li>Tenant creation plus enable/disable lifecycle controls for isolated customer workspaces.</li>
                </ul>
              </div>
            </div>
          ) : null}

          {supported && authenticated ? (
            <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-sm">
                    <div className="text-xs uppercase tracking-wide text-bolt-elements-textTertiary">
                      Admin password
                    </div>
                    <div className="mt-2 text-sm font-medium text-bolt-elements-textPrimary">
                      {admin.mustChangePassword ? 'Rotation required' : 'Rotated'}
                    </div>
                    <div className="mt-1 text-xs text-bolt-elements-textSecondary">
                      {admin.passwordUpdatedAt
                        ? `Updated ${new Date(admin.passwordUpdatedAt).toLocaleString()}`
                        : 'Still using the bootstrap password.'}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-sm">
                    <div className="text-xs uppercase tracking-wide text-bolt-elements-textTertiary">Tenants</div>
                    <div className="mt-2 text-sm font-medium text-bolt-elements-textPrimary">{tenants.length}</div>
                    <div className="mt-1 text-xs text-bolt-elements-textSecondary">
                      {tenants.filter((tenant) => tenant.status === 'active').length} active ·{' '}
                      {tenants.filter((tenant) => tenant.status === 'pending').length} pending ·{' '}
                      {tenants.filter((tenant) => tenant.status === 'disabled').length} disabled
                    </div>
                  </div>
                  <div className="rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-sm">
                    <div className="text-xs uppercase tracking-wide text-bolt-elements-textTertiary">Audit trail</div>
                    <div className="mt-2 text-sm font-medium text-bolt-elements-textPrimary">{auditTrail.length}</div>
                    <div className="mt-1 text-xs text-bolt-elements-textSecondary">
                      Latest server-side tenant lifecycle events for this instance.
                    </div>
                  </div>
                  <div className="rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-sm">
                    <div className="text-xs uppercase tracking-wide text-bolt-elements-textTertiary">
                      Managed trials
                    </div>
                    <div className="mt-2 text-sm font-medium text-bolt-elements-textPrimary">
                      {managedInstances.length}
                    </div>
                    <div className="mt-1 text-xs text-bolt-elements-textSecondary">
                      {managedSupport.supported
                        ? `${managedInstances.filter((instance) => ['active', 'updating', 'provisioning', 'failed'].includes(instance.status)).length} currently live on ${managedSupport.rootDomain}.`
                        : managedSupport.reason}
                    </div>
                  </div>
                </div>

                <Form
                  method="post"
                  className="rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6 shadow-sm"
                >
                  <input type="hidden" name="intent" value="create-tenant" />
                  <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">Create Tenant</h2>
                  <div className="mt-4 grid gap-4">
                    <label className="grid gap-2 text-sm text-bolt-elements-textSecondary">
                      Tenant name
                      <input
                        name="name"
                        className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-bolt-elements-textPrimary"
                      />
                    </label>
                    <label className="grid gap-2 text-sm text-bolt-elements-textSecondary">
                      Admin email
                      <input
                        name="email"
                        type="email"
                        className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-bolt-elements-textPrimary"
                      />
                    </label>
                  </div>
                  <p className="mt-3 text-xs text-bolt-elements-textTertiary">
                    Each tenant starts in <span className="font-medium">pending</span>. Approve the tenant, then issue
                    an onboarding invite so the tenant admin can set a password and access the isolated workspace.
                  </p>
                  {admin.mustChangePassword ? (
                    <p className="mt-4 text-sm text-amber-300">
                      Rotate the bootstrap admin password first. Tenant creation stays locked until the shared default
                      login is replaced.
                    </p>
                  ) : null}
                  <button
                    disabled={admin.mustChangePassword}
                    className="mt-5 rounded-lg bg-bolt-elements-button-primary-background px-4 py-2 text-sm font-medium text-bolt-elements-button-primary-text disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Create tenant
                  </button>
                </Form>

                <Form
                  method="post"
                  className="rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6 shadow-sm"
                >
                  <input type="hidden" name="intent" value="change-admin-password" />
                  <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">Rotate Admin Password</h2>
                  <p className="mt-2 text-sm text-bolt-elements-textSecondary">
                    Current admin: <span className="font-mono">{admin.username}</span>
                    {admin.lastLoginAt ? (
                      <>
                        {' '}
                        · Last sign-in <span className="font-mono">{admin.lastLoginAt}</span>
                      </>
                    ) : null}
                  </p>
                  <div className="mt-4 grid gap-4">
                    <label className="grid gap-2 text-sm text-bolt-elements-textSecondary">
                      Current password
                      <input
                        name="currentPassword"
                        type="password"
                        defaultValue={admin.mustChangePassword ? defaultAdmin.password : ''}
                        className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-bolt-elements-textPrimary"
                      />
                    </label>
                    <label className="grid gap-2 text-sm text-bolt-elements-textSecondary">
                      New password
                      <input
                        name="nextPassword"
                        type="password"
                        minLength={10}
                        className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-bolt-elements-textPrimary"
                      />
                    </label>
                  </div>
                  <button className="mt-5 rounded-lg border border-bolt-elements-focus px-4 py-2 text-sm font-medium text-bolt-elements-textPrimary">
                    Update admin password
                  </button>
                </Form>
              </div>

              <div className="rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">Registered Tenants</h2>
                  <span className="rounded-full border border-bolt-elements-borderColor px-3 py-1 text-xs text-bolt-elements-textSecondary">
                    {tenants.length} total
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  {tenants.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-bolt-elements-borderColor p-4 text-sm text-bolt-elements-textSecondary">
                      No tenants created yet.
                    </div>
                  ) : (
                    tenants.map((tenant) => (
                      <div
                        key={tenant.id}
                        className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <div className="font-medium text-bolt-elements-textPrimary">{tenant.name}</div>
                            <div className="mt-1 text-sm text-bolt-elements-textSecondary">{tenant.email}</div>
                            {tenant.slug ? (
                              <div className="mt-1 text-xs text-bolt-elements-textTertiary">
                                Slug <span className="font-mono">{tenant.slug}</span>
                              </div>
                            ) : null}
                            {tenant.workspaceDir ? (
                              <div className="mt-1 text-xs text-bolt-elements-textTertiary">
                                Workspace <span className="font-mono">{tenant.workspaceDir}</span>
                              </div>
                            ) : null}
                            <div className="mt-2 text-xs text-bolt-elements-textTertiary">
                              Created {new Date(tenant.createdAt).toLocaleString()}
                              {tenant.updatedAt ? ` · Updated ${new Date(tenant.updatedAt).toLocaleString()}` : ''}
                            </div>
                            {tenant.passwordUpdatedAt ? (
                              <div className="mt-1 text-xs text-bolt-elements-textTertiary">
                                Password updated {new Date(tenant.passwordUpdatedAt).toLocaleString()}
                              </div>
                            ) : null}
                            {tenant.lastLoginAt ? (
                              <div className="mt-1 text-xs text-bolt-elements-textTertiary">
                                Last tenant login {new Date(tenant.lastLoginAt).toLocaleString()}
                              </div>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[11px] ${
                                tenant.status === 'pending'
                                  ? 'border-sky-500/40 bg-sky-500/10 text-sky-200'
                                  : tenant.status === 'disabled'
                                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                                    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                              }`}
                            >
                              {tenant.status === 'pending'
                                ? 'pending'
                                : tenant.status === 'disabled'
                                  ? 'disabled'
                                  : 'active'}
                            </span>
                            {tenant.mustChangePassword ? (
                              <span className="rounded-full border border-bolt-elements-borderColor px-2 py-0.5 text-[11px] text-bolt-elements-textSecondary">
                                password action required
                              </span>
                            ) : null}
                            {tenant.inviteExpiresAt ? (
                              <span className="rounded-full border border-bolt-elements-borderColor px-2 py-0.5 text-[11px] text-bolt-elements-textSecondary">
                                invite live until {new Date(tenant.inviteExpiresAt).toLocaleString()}
                              </span>
                            ) : null}
                            {tenant.status === 'pending' ? (
                              <Form method="post">
                                <input type="hidden" name="intent" value="approve-tenant" />
                                <input type="hidden" name="tenantId" value={tenant.id} />
                                <button className="rounded-lg border border-bolt-elements-borderColor px-3 py-1.5 text-xs text-bolt-elements-textPrimary hover:border-bolt-elements-focus">
                                  Approve tenant
                                </button>
                              </Form>
                            ) : null}
                            {tenant.status !== 'pending' ? (
                              <Form method="post">
                                <input type="hidden" name="intent" value="toggle-tenant-status" />
                                <input type="hidden" name="tenantId" value={tenant.id} />
                                <input
                                  type="hidden"
                                  name="status"
                                  value={tenant.status === 'disabled' ? 'active' : 'disabled'}
                                />
                                <button className="rounded-lg border border-bolt-elements-borderColor px-3 py-1.5 text-xs text-bolt-elements-textPrimary hover:border-bolt-elements-focus">
                                  {tenant.status === 'disabled' ? 'Re-enable tenant' : 'Disable tenant'}
                                </button>
                              </Form>
                            ) : null}
                            {tenant.status === 'active' ? (
                              <Form method="post">
                                <input type="hidden" name="intent" value="issue-tenant-invite" />
                                <input type="hidden" name="tenantId" value={tenant.id} />
                                <input
                                  type="hidden"
                                  name="purpose"
                                  value={tenant.lastLoginAt ? 'password-reset' : 'onboarding'}
                                />
                                <button className="rounded-lg border border-bolt-elements-borderColor px-3 py-1.5 text-xs text-bolt-elements-textPrimary hover:border-bolt-elements-focus">
                                  {tenant.lastLoginAt ? 'Force reset via invite' : 'Issue onboarding invite'}
                                </button>
                              </Form>
                            ) : null}
                          </div>
                        </div>
                        {tenant.inviteToken ? (
                          <div className="mt-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-xs text-bolt-elements-textSecondary">
                            Invite URL{' '}
                            <span className="font-mono text-bolt-elements-textPrimary">{`/tenant?invite=${tenant.inviteToken}`}</span>
                          </div>
                        ) : null}
                        {tenant.approvedAt ? (
                          <div className="mt-2 text-xs text-bolt-elements-textTertiary">
                            Approved {new Date(tenant.approvedAt).toLocaleString()}
                            {tenant.approvedBy ? ` by ${tenant.approvedBy}` : ''}
                          </div>
                        ) : null}
                        {tenant.disabledAt ? (
                          <div className="mt-1 text-xs text-bolt-elements-textTertiary">
                            Disabled {new Date(tenant.disabledAt).toLocaleString()}
                            {tenant.disabledBy ? ` by ${tenant.disabledBy}` : ''}
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
                {auditTrail.length > 0 ? (
                  <div className="mt-6 border-t border-bolt-elements-borderColor pt-4">
                    <div className="mb-2 text-sm font-medium text-bolt-elements-textPrimary">Recent admin activity</div>
                    <div className="space-y-2">
                      {auditTrail
                        .slice(-8)
                        .reverse()
                        .map((event) => (
                          <div
                            key={event.id}
                            className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-xs text-bolt-elements-textSecondary"
                          >
                            <div className="font-medium text-bolt-elements-textPrimary">
                              {event.action} · {event.target}
                            </div>
                            <div className="mt-1">
                              {new Date(event.timestamp).toLocaleString()} · actor {event.actor}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {supported && authenticated ? (
            <section className="rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6 shadow-sm">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">Managed Cloudflare Trials</h2>
                  <p className="mt-2 text-sm text-bolt-elements-textSecondary">
                    Operator view of live trial instances. Actions run server-side through the managed control plane.
                    Cloudflare credentials remain on the runtime service and are never sent to the browser.
                  </p>
                </div>
                <span className="rounded-full border border-bolt-elements-borderColor px-3 py-1 text-xs text-bolt-elements-textSecondary">
                  {managedSupport.supported
                    ? `${managedSupport.trialDays}-day trials on ${managedSupport.rootDomain}`
                    : 'Trials unavailable'}
                </span>
              </div>

              {!managedSupport.supported ? (
                <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-500/10 p-4 text-sm text-bolt-elements-textPrimary">
                  {managedSupport.reason}
                </div>
              ) : managedInstances.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-bolt-elements-borderColor p-4 text-sm text-bolt-elements-textSecondary">
                  No managed trial instances have been provisioned yet.
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  {managedInstances.map((instance) => {
                    const isLive = ['active', 'updating', 'provisioning', 'failed'].includes(instance.status);

                    return (
                      <div
                        key={instance.id}
                        className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4"
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="font-medium text-bolt-elements-textPrimary">{instance.name}</div>
                            <div className="mt-1 text-sm text-bolt-elements-textSecondary">{instance.email}</div>
                            <div className="mt-1 text-xs text-bolt-elements-textTertiary">
                              Project <span className="font-mono">{instance.projectName}</span> · Host{' '}
                              <span className="font-mono">{instance.routeHostname}</span>
                            </div>
                            <div className="mt-2 text-xs text-bolt-elements-textTertiary">
                              Trial ends {new Date(instance.trialEndsAt).toLocaleString()} · Updated{' '}
                              {new Date(instance.updatedAt).toLocaleString()}
                            </div>
                            {instance.lastDeploymentUrl ? (
                              <div className="mt-1 text-xs text-bolt-elements-textTertiary">
                                Last deploy <span className="font-mono">{instance.lastDeploymentUrl}</span>
                              </div>
                            ) : null}
                            {instance.lastError ? (
                              <div className="mt-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                                {instance.lastError}
                              </div>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[11px] ${
                                instance.status === 'active'
                                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                                  : instance.status === 'failed'
                                    ? 'border-red-400/40 bg-red-500/10 text-red-200'
                                    : instance.status === 'suspended'
                                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                                      : instance.status === 'expired'
                                        ? 'border-slate-500/40 bg-slate-500/10 text-slate-200'
                                        : 'border-sky-500/40 bg-sky-500/10 text-sky-200'
                              }`}
                            >
                              {instance.status}
                            </span>
                            <span className="rounded-full border border-bolt-elements-borderColor px-2 py-0.5 text-[11px] text-bolt-elements-textSecondary">
                              {instance.sourceBranch}
                            </span>
                            <Form method="post">
                              <input type="hidden" name="intent" value="refresh-managed-instance" />
                              <input type="hidden" name="slug" value={instance.projectName} />
                              <button
                                disabled={instance.status === 'expired'}
                                className="rounded-lg border border-bolt-elements-borderColor px-3 py-1.5 text-xs text-bolt-elements-textPrimary hover:border-bolt-elements-focus disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Refresh deployment
                              </button>
                            </Form>
                            {isLive ? (
                              <Form method="post">
                                <input type="hidden" name="intent" value="suspend-managed-instance" />
                                <input type="hidden" name="slug" value={instance.projectName} />
                                <button className="rounded-lg border border-bolt-elements-borderColor px-3 py-1.5 text-xs text-bolt-elements-textPrimary hover:border-bolt-elements-focus">
                                  Suspend trial
                                </button>
                              </Form>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ) : null}
        </div>
      </main>
    </div>
  );
}
