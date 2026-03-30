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

type TenantRecord = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: string;
};

const adminSessionCookie = createCookie('bolt_tenant_admin', {
  httpOnly: true,
  path: '/',
  sameSite: 'lax',
  secure: true,
  maxAge: 60 * 60 * 12,
});

export const meta: MetaFunction = () => [{ title: `Tenant Admin | bolt.gives v${APP_VERSION}` }];

const DEFAULT_ADMIN = { username: 'admin', password: 'admin' };

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
  const session = await adminSessionCookie.parse(request.headers.get('Cookie'));
  const authenticated = session === '1';

  try {
    const status = await fetchRuntimeJson<{ supported: boolean; tenants: TenantRecord[] }>('/tenant-admin/status');

    return json({
      supported: status.supported,
      authenticated,
      defaultAdmin: DEFAULT_ADMIN,
      tenants: authenticated ? status.tenants : [],
    });
  } catch {
    return json({
      supported: false,
      authenticated: false,
      defaultAdmin: DEFAULT_ADMIN,
      tenants: [] as TenantRecord[],
    });
  }
}

export async function action({ request }: ActionFunctionArgs) {
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
      headers: { 'Set-Cookie': await adminSessionCookie.serialize('1') },
    });
  }

  if (intent === 'create-tenant') {
    const session = await adminSessionCookie.parse(request.headers.get('Cookie'));

    if (session !== '1') {
      return json({ error: 'Sign in as tenant admin first.' }, { status: 401 });
    }

    const name = String(formData.get('name') || '').trim();
    const email = String(formData.get('email') || '')
      .trim()
      .toLowerCase();
    const password = String(formData.get('password') || '').trim();

    if (!name || !email || !password) {
      return json({ error: 'Name, email, and password are required.' }, { status: 400 });
    }

    try {
      await fetchRuntimeJson<{ ok: boolean }>('/tenant-admin/tenants', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, email, password }),
      });
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : 'Unable to create tenant right now.' },
        { status: 400 },
      );
    }

    return redirect('/tenant-admin');
  }

  return json({ error: 'Unknown action.' }, { status: 400 });
}

export default function TenantAdminPage() {
  const { supported, authenticated, tenants, defaultAdmin } = useLoaderData<typeof loader>();
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
                  <li>Bootstrap admin account with default credentials that should be changed after first sign-in.</li>
                  <li>Tenant creation for isolated customer workspaces.</li>
                </ul>
              </div>
            </div>
          ) : null}

          {supported && authenticated ? (
            <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
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
                  <label className="grid gap-2 text-sm text-bolt-elements-textSecondary">
                    Admin password
                    <input
                      name="password"
                      type="password"
                      className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-bolt-elements-textPrimary"
                    />
                  </label>
                </div>
                <button className="mt-5 rounded-lg bg-bolt-elements-button-primary-background px-4 py-2 text-sm font-medium text-bolt-elements-button-primary-text">
                  Create tenant
                </button>
              </Form>

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
                        <div className="font-medium text-bolt-elements-textPrimary">{tenant.name}</div>
                        <div className="mt-1 text-sm text-bolt-elements-textSecondary">{tenant.email}</div>
                        <div className="mt-2 text-xs text-bolt-elements-textTertiary">
                          Created {new Date(tenant.createdAt).toLocaleString()}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
