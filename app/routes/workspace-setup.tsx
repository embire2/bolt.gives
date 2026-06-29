import { json, type ActionFunctionArgs, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/cloudflare';
import { Form, useActionData, useLoaderData } from '@remix-run/react';
import { Header } from '~/components/header/Header';
import BackgroundRays from '~/components/ui/BackgroundRays';
import { fetchRuntimeControlJson } from '~/lib/.server/runtime-control';
import { APP_VERSION } from '~/lib/version';

type RuntimeNodeSupport = {
  ok: boolean;
  supported: boolean;
  reason: string | null;
  host: string | null;
  port: number;
  baseDir: string | null;
  authMode: 'ssh-key' | 'password' | 'none';
  summary: {
    total: number;
    active: number;
    provisioning: number;
    failed: number;
    suspended: number;
  };
};

type RuntimeNodeWorkspace = {
  id: string;
  clientName: string;
  clientEmail: string;
  projectName: string;
  projectSlug: string;
  cliUsername: string;
  workspaceDir: string;
  sshHost: string | null;
  sshPort: number;
  sshCommand: string | null;
  databaseName: string;
  databaseUser: string;
  databaseHost: string;
  databasePort: number;
  databaseUrl: string | null;
  oneTimeCliPassword: string | null;
  oneTimeDatabasePassword: string | null;
  status: 'provisioning' | 'active' | 'failed' | 'suspended';
  createdAt: string;
  updatedAt: string;
  provisionedAt: string | null;
  lastError: string | null;
};

type ActionData =
  | {
      error: string;
      workspace?: never;
    }
  | {
      error?: never;
      workspace: RuntimeNodeWorkspace;
    };

export const meta: MetaFunction = () => [
  { title: `Live Workspace Setup | bolt.gives v${APP_VERSION}` },
  {
    name: 'description',
    content:
      'Create isolated Linux CLI workspaces and PostgreSQL databases for bolt.gives projects on a dedicated Ubuntu runtime node.',
  },
];

export async function loader(_args: LoaderFunctionArgs) {
  try {
    const support = await fetchRuntimeControlJson<RuntimeNodeSupport>('/runtime-node/config');
    return json({ support });
  } catch (error) {
    return json({
      support: {
        ok: false,
        supported: false,
        reason: error instanceof Error ? error.message : 'Dedicated runtime-node workspaces are unavailable.',
        host: null,
        port: 22,
        baseDir: null,
        authMode: 'none' as const,
        summary: {
          total: 0,
          active: 0,
          provisioning: 0,
          failed: 0,
          suspended: 0,
        },
      },
    });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const clientName = String(formData.get('clientName') || '').trim();
  const clientEmail = String(formData.get('clientEmail') || '')
    .trim()
    .toLowerCase();
  const projectName = String(formData.get('projectName') || '').trim();
  const cliUsername = String(formData.get('cliUsername') || '').trim();
  const cliPassword = String(formData.get('cliPassword') || '');

  try {
    const payload = await fetchRuntimeControlJson<{ ok: true; workspace: RuntimeNodeWorkspace }>(
      '/runtime-node/workspaces',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName,
          clientEmail,
          projectName,
          cliUsername,
          cliPassword,
        }),
      },
    );

    return json<ActionData>({ workspace: payload.workspace });
  } catch (error) {
    return json<ActionData>(
      { error: error instanceof Error ? error.message : 'Unable to provision the live workspace.' },
      { status: 400 },
    );
  }
}

export default function WorkspaceSetupPage() {
  const { support } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const workspace = actionData && 'workspace' in actionData ? actionData.workspace : null;
  const error = actionData && 'error' in actionData ? actionData.error : null;
  const panelClass =
    'rounded-[2rem] border border-slate-200 bg-white/95 p-6 shadow-2xl ring-1 ring-slate-950/5 backdrop-blur dark:border-bolt-elements-borderColor dark:bg-bolt-elements-background-depth-2/90 dark:ring-white/5';
  const inputClass =
    'rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 dark:border-bolt-elements-borderColor dark:bg-bolt-elements-background-depth-1 dark:text-bolt-elements-textPrimary dark:placeholder:text-bolt-elements-textTertiary';
  const labelClass = 'grid gap-2 text-sm font-semibold text-slate-700 dark:text-bolt-elements-textSecondary';
  const statCards = [
    { label: 'Live projects', value: support.summary.active },
    { label: 'Provisioning', value: support.summary.provisioning },
    { label: 'Failed', value: support.summary.failed },
    { label: 'Total records', value: support.summary.total },
  ];

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#f4f1e8] text-slate-950 dark:bg-bolt-elements-background-depth-1 dark:text-bolt-elements-textPrimary">
      <BackgroundRays />
      <Header />
      <main className="modern-scrollbar relative z-1 flex-1 overflow-y-auto overflow-x-hidden">
        <section className="relative isolate overflow-hidden border-b border-slate-200 px-4 py-10 dark:border-bolt-elements-borderColor">
          <div className="absolute inset-0 -z-1 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.28),transparent_30rem),radial-gradient(circle_at_80%_0%,rgba(14,165,233,0.22),transparent_28rem),linear-gradient(135deg,#fffaf0,#eefaf4_52%,#e9f2ff)] dark:bg-none" />
          <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div>
              <div className="inline-flex rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-black uppercase tracking-[0.28em] text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-500/10 dark:text-emerald-100">
                Dedicated Runtime Node
              </div>
              <h1 className="mt-5 max-w-4xl text-4xl font-black tracking-[-0.05em] text-slate-950 sm:text-6xl dark:text-white">
                Launch a real Ubuntu workspace with CLI, files, and Postgres.
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-8 text-slate-700 dark:text-bolt-elements-textSecondary">
                This wizard creates a per-project Linux user, a locked project directory, a PostgreSQL database and
                role, and a ready-to-use SSH command. It is built for real client workspaces rather than shared
                scratchpads.
              </p>
            </div>

            <div className={panelClass}>
              <div className="text-xs font-black uppercase tracking-[0.24em] text-slate-500 dark:text-bolt-elements-textTertiary">
                Node status
              </div>
              <div className="mt-4 rounded-2xl bg-slate-950 p-5 text-white shadow-xl">
                <div className="text-sm text-slate-300">Runtime host</div>
                <div className="mt-2 break-all font-mono text-lg">{support.host || 'Not configured'}</div>
                <div className="mt-4 flex gap-2 text-xs">
                  <span className="rounded-full bg-emerald-400/20 px-3 py-1 text-emerald-100">
                    {support.supported ? 'Ready' : 'Needs setup'}
                  </span>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-slate-200">SSH {support.port}</span>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-slate-200">{support.authMode}</span>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {statCards.map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-bolt-elements-borderColor dark:bg-bolt-elements-background-depth-1"
                  >
                    <div className="text-2xl font-black text-slate-950 dark:text-white">{stat.value}</div>
                    <div className="mt-1 text-xs uppercase tracking-wide text-slate-500 dark:text-bolt-elements-textTertiary">
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className={panelClass}>
            <div className="text-xs font-black uppercase tracking-[0.24em] text-slate-500 dark:text-bolt-elements-textTertiary">
              Setup wizard
            </div>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.03em] text-slate-950 dark:text-white">
              Create an isolated project workspace
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-700 dark:text-bolt-elements-textSecondary">
              The username and password below become the client CLI login for this project. Passwords are sent only to
              the server-side provisioner and are not stored in the registry as plaintext.
            </p>

            {!support.supported ? (
              <div className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-100">
                {support.reason}
              </div>
            ) : null}

            {error ? (
              <div className="mt-5 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-500/10 dark:text-red-100">
                {error}
              </div>
            ) : null}

            <Form method="post" className="mt-6 grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className={labelClass}>
                  Client name
                  <input name="clientName" required minLength={2} placeholder="Ada Lovelace" className={inputClass} />
                </label>
                <label className={labelClass}>
                  Client email
                  <input
                    name="clientEmail"
                    type="email"
                    required
                    placeholder="client@example.com"
                    className={inputClass}
                  />
                </label>
              </div>

              <label className={labelClass}>
                Project name
                <input
                  name="projectName"
                  required
                  minLength={3}
                  placeholder="calendar-command-center"
                  className={inputClass}
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className={labelClass}>
                  CLI username
                  <input
                    name="cliUsername"
                    required
                    minLength={3}
                    pattern="[a-zA-Z][a-zA-Z0-9_-]{2,27}"
                    placeholder="ada_calendar"
                    className={inputClass}
                  />
                </label>
                <label className={labelClass}>
                  CLI password
                  <input
                    name="cliPassword"
                    type="password"
                    required
                    minLength={12}
                    autoComplete="new-password"
                    placeholder="12+ chars, upper/lower/number"
                    className={inputClass}
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={!support.supported}
                className="mt-2 rounded-2xl bg-slate-950 px-6 py-4 text-sm font-black uppercase tracking-[0.18em] text-white shadow-xl transition hover:-translate-y-0.5 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-300"
              >
                Create live workspace
              </button>
            </Form>
          </section>

          <aside className="space-y-6">
            <div className={panelClass}>
              <h2 className="text-xl font-black text-slate-950 dark:text-white">Isolation model</h2>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-700 dark:text-bolt-elements-textSecondary">
                <li>One Unix user per project, with a private home/workspace directory.</li>
                <li>One PostgreSQL role and database per project.</li>
                <li>Default shell limits reduce runaway process count and open-file abuse.</li>
                <li>Provisioning events are written into the runtime-node registry and node audit log.</li>
                <li>Root SSH credentials never go to the browser.</li>
              </ul>
            </div>

            <div className={panelClass}>
              <h2 className="text-xl font-black text-slate-950 dark:text-white">CLI experience</h2>
              <p className="mt-3 text-sm leading-6 text-slate-700 dark:text-bolt-elements-textSecondary">
                After provisioning, the client receives an SSH command, workspace directory, database name, database
                username, and one-time passwords. The project starts with a README and `.env` file inside the workspace.
              </p>
            </div>
          </aside>
        </div>

        {workspace ? (
          <section className="mx-auto max-w-6xl px-4 pb-10">
            <div className="rounded-[2rem] border border-emerald-300 bg-emerald-50 p-6 shadow-2xl dark:border-emerald-400/40 dark:bg-emerald-500/10">
              <div className="text-xs font-black uppercase tracking-[0.24em] text-emerald-800 dark:text-emerald-100">
                Workspace ready
              </div>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-slate-950 dark:text-white">
                Save these one-time credentials now
              </h2>
              <p className="mt-3 text-sm text-emerald-900 dark:text-emerald-100">
                Passwords are shown only in this response. They are not stored in plaintext in the bolt.gives registry.
              </p>

              <dl className="mt-6 grid gap-4 md:grid-cols-2">
                {[
                  ['SSH command', workspace.sshCommand || 'Unavailable'],
                  ['Workspace directory', workspace.workspaceDir],
                  ['CLI username', workspace.cliUsername],
                  ['CLI password', workspace.oneTimeCliPassword || 'Shown only at creation'],
                  ['Database', workspace.databaseName],
                  ['Database user', workspace.databaseUser],
                  ['Database password', workspace.oneTimeDatabasePassword || 'Shown only at creation'],
                  ['Database URL', workspace.databaseUrl || 'Stored in project .env'],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm dark:border-emerald-400/30 dark:bg-bolt-elements-background-depth-1"
                  >
                    <dt className="text-xs font-black uppercase tracking-[0.18em] text-emerald-800 dark:text-emerald-200">
                      {label}
                    </dt>
                    <dd className="mt-2 break-all font-mono text-sm text-slate-950 dark:text-white">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
