import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { toast } from 'react-toastify';
import { classNames } from '@bolt/core/utils/classNames';
import { useSupabaseConnection } from '@bolt/project/lib/hooks/useSupabaseConnection';
import { projectDatabaseConnection } from '@bolt/project/lib/stores/project-database';
import { updateSupabaseConnection } from '@bolt/project/lib/stores/supabase';
import { workbenchStore } from '@bolt/project/lib/stores/workbench';
import {
  deleteHostedProjectConnection,
  fetchHostedProjectConnection,
  saveHostedProjectConnection,
} from '@bolt/runtime/lib/runtime/hosted-runtime-client';
import { Dialog, DialogButton, DialogClose, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';

type DatabaseTab = 'supabase' | 'postgresql';

const inputClasses = classNames(
  'w-full rounded-lg border border-bolt-elements-borderColor px-3 py-2.5 text-sm',
  'bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary',
  'placeholder:text-bolt-elements-textTertiary focus:border-[#18a66a] focus:outline-none focus:ring-2 focus:ring-[#18a66a]/20',
);

export function SupabaseConnection() {
  const {
    connection: supabaseAccount,
    connecting: connectingAccount,
    fetchingStats,
    fetchingApiKeys,
    handleConnect: connectSupabaseAccount,
    selectProject,
    handleCreateProject,
    updateToken,
    isConnected: accountConnected,
  } = useSupabaseConnection();
  const connection = useStore(projectDatabaseConnection);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [tab, setTab] = useState<DatabaseTab>('supabase');
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseAnonKey, setSupabaseAnonKey] = useState('');
  const [databaseUrl, setDatabaseUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const runtimeSessionId = workbenchStore.hostedRuntimeSessionId;

  useEffect(() => {
    const handleOpenConnectionDialog = () => setIsDialogOpen(true);
    document.addEventListener('open-supabase-connection', handleOpenConnectionDialog);

    return () => document.removeEventListener('open-supabase-connection', handleOpenConnectionDialog);
  }, []);

  useEffect(() => {
    let active = true;
    projectDatabaseConnection.set(null);

    void fetchHostedProjectConnection(runtimeSessionId)
      .then((currentConnection) => {
        if (active) {
          projectDatabaseConnection.set(currentConnection);
        }
      })
      .catch(() => {
        // A disconnected local runtime should not block the prompt surface.
      });

    return () => {
      active = false;
    };
  }, [runtimeSessionId]);

  const connectSupabase = async () => {
    setSaving(true);

    try {
      const nextConnection = await saveHostedProjectConnection(runtimeSessionId, {
        provider: 'supabase',
        supabaseUrl,
        anonKey: supabaseAnonKey,
      });
      projectDatabaseConnection.set(nextConnection);
      updateSupabaseConnection({
        credentials: { supabaseUrl: supabaseUrl.trim(), anonKey: supabaseAnonKey.trim() },
        isConnected: true,
      });
      setSupabaseAnonKey('');
      toast.success('Supabase is connected to this project');
      setIsDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not connect Supabase');
    } finally {
      setSaving(false);
    }
  };

  const importSupabaseProject = async (projectId: string) => {
    setSaving(true);

    try {
      const credentials = await selectProject(projectId);

      if (!credentials?.supabaseUrl || !credentials.anonKey) {
        throw new Error('Supabase did not return a publishable key for this project.');
      }

      const nextConnection = await saveHostedProjectConnection(runtimeSessionId, {
        provider: 'supabase',
        supabaseUrl: credentials.supabaseUrl,
        anonKey: credentials.anonKey,
      });
      projectDatabaseConnection.set(nextConnection);
      setSupabaseAnonKey('');
      toast.success('Supabase is connected to this project');
      setIsDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not connect this Supabase project');
    } finally {
      setSaving(false);
    }
  };

  const connectPostgresql = async () => {
    setSaving(true);

    try {
      const nextConnection = await saveHostedProjectConnection(runtimeSessionId, {
        provider: 'postgresql',
        databaseUrl,
      });
      projectDatabaseConnection.set(nextConnection);
      setDatabaseUrl('');
      toast.success('PostgreSQL is connected to this project');
      setIsDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not connect PostgreSQL');
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async () => {
    setSaving(true);

    try {
      await deleteHostedProjectConnection(runtimeSessionId);
      projectDatabaseConnection.set(null);
      updateSupabaseConnection({
        credentials: undefined,
        selectedProjectId: '',
        project: undefined,
        isConnected: false,
      });
      toast.success('Database disconnected from this project');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not disconnect the database');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative mr-2">
      <button
        type="button"
        onClick={() => setIsDialogOpen(true)}
        className={classNames(
          'flex min-h-8 items-center gap-2 rounded-md border border-bolt-elements-borderColor px-2.5 py-1.5 text-xs font-medium',
          'bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive',
        )}
        title="Connect a database to this project"
        aria-label="Open database connection"
      >
        <span className="i-ph:database h-4 w-4 text-[#18a66a]" aria-hidden="true" />
        <span>{connection ? connection.label : 'Database'}</span>
        {connection ? <span className="h-1.5 w-1.5 rounded-full bg-[#18a66a]" aria-label="Connected" /> : null}
      </button>

      <DialogRoot open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        {isDialogOpen ? (
          <Dialog className="max-h-[85vh] max-w-[620px] overflow-y-auto p-6">
            <DialogTitle>
              <span className="i-ph:database h-5 w-5 text-[#18a66a]" />
              Project database
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm leading-6 text-bolt-elements-textSecondary">
              Projects start without a database. Connect only what this app needs; credentials stay in the private
              runtime and are not written into generated files.
            </DialogDescription>

            {connection ? (
              <div className="mt-5 space-y-4">
                <div className="rounded-xl border border-[#18a66a]/40 bg-[#18a66a]/10 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-bolt-elements-textPrimary">
                    <span className="h-2 w-2 rounded-full bg-[#18a66a]" />
                    {connection.provider === 'supabase' ? 'Supabase' : 'PostgreSQL'} connected
                  </div>
                  <p className="mt-1 text-sm text-bolt-elements-textSecondary">{connection.label}</p>
                  <p className="mt-2 text-xs text-bolt-elements-textTertiary">
                    The connection is available to the next command and Preview start for this project.
                  </p>
                </div>
                <div className="flex justify-end gap-2">
                  <DialogClose asChild>
                    <DialogButton type="secondary">Close</DialogButton>
                  </DialogClose>
                  <DialogButton type="danger" onClick={disconnect} disabled={saving}>
                    {saving ? 'Disconnecting...' : 'Disconnect'}
                  </DialogButton>
                </div>
              </div>
            ) : (
              <div className="mt-5">
                <div className="grid grid-cols-2 gap-2 rounded-lg bg-bolt-elements-background-depth-2 p-1">
                  {(['supabase', 'postgresql'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTab(value)}
                      className={classNames(
                        'rounded-md px-3 py-2 text-sm font-semibold transition-colors',
                        tab === value
                          ? 'bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary shadow-sm'
                          : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
                      )}
                    >
                      {value === 'supabase' ? 'Supabase' : 'PostgreSQL'}
                    </button>
                  ))}
                </div>

                {tab === 'supabase' ? (
                  <div className="mt-5 space-y-4">
                    <div className="rounded-lg border border-bolt-elements-borderColor p-4">
                      <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Quick connect</h3>
                      <p className="mt-1 text-xs leading-5 text-bolt-elements-textSecondary">
                        Copy both values from Supabase: Project Settings, then API.
                      </p>
                      <label
                        className="mt-4 block text-sm font-medium text-bolt-elements-textPrimary"
                        htmlFor="supabase-url"
                      >
                        Project URL
                      </label>
                      <input
                        id="supabase-url"
                        type="url"
                        value={supabaseUrl}
                        onChange={(event) => setSupabaseUrl(event.target.value)}
                        placeholder="https://your-project.supabase.co"
                        className={classNames(inputClasses, 'mt-1.5')}
                      />
                      <label
                        className="mt-4 block text-sm font-medium text-bolt-elements-textPrimary"
                        htmlFor="supabase-key"
                      >
                        Publishable or anon key
                      </label>
                      <input
                        id="supabase-key"
                        type="password"
                        value={supabaseAnonKey}
                        onChange={(event) => setSupabaseAnonKey(event.target.value)}
                        placeholder="sb_publishable_... or eyJ..."
                        className={classNames(inputClasses, 'mt-1.5')}
                      />
                      <div className="mt-4 flex items-center justify-between gap-3">
                        <a
                          href="https://supabase.com/dashboard/projects"
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-[#148456] hover:underline dark:text-[#5ee2a6]"
                        >
                          Open Supabase dashboard
                        </a>
                        <button
                          type="button"
                          onClick={connectSupabase}
                          disabled={saving || !supabaseUrl.trim() || !supabaseAnonKey.trim()}
                          className="rounded-lg bg-[#148456] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0f6f48] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {saving ? 'Connecting...' : 'Connect Supabase'}
                        </button>
                      </div>
                    </div>

                    <details className="rounded-lg border border-bolt-elements-borderColor p-4">
                      <summary className="cursor-pointer text-sm font-semibold text-bolt-elements-textPrimary">
                        Choose from my Supabase account
                      </summary>
                      <p className="mt-2 text-xs leading-5 text-bolt-elements-textSecondary">
                        Optional: use a personal access token once to list your projects. It is kept in memory only for
                        this browser session.
                      </p>
                      {!accountConnected ? (
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                          <input
                            type="password"
                            value={supabaseAccount.token}
                            onChange={(event) => updateToken(event.target.value)}
                            placeholder="Supabase personal access token"
                            className={classNames(inputClasses, 'flex-1')}
                          />
                          <button
                            type="button"
                            onClick={() => void connectSupabaseAccount()}
                            disabled={connectingAccount || !supabaseAccount.token.trim()}
                            className="rounded-lg border border-bolt-elements-borderColor px-4 py-2 text-sm font-semibold text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive disabled:opacity-50"
                          >
                            {connectingAccount ? 'Loading...' : 'List projects'}
                          </button>
                        </div>
                      ) : fetchingStats ? (
                        <p className="mt-3 text-sm text-bolt-elements-textSecondary">Loading projects...</p>
                      ) : (
                        <div className="mt-3 max-h-52 space-y-2 overflow-y-auto">
                          {supabaseAccount.stats?.projects?.map((project) => (
                            <button
                              key={project.id}
                              type="button"
                              onClick={() => void importSupabaseProject(project.id)}
                              disabled={saving || fetchingApiKeys}
                              className="flex w-full items-center justify-between rounded-lg border border-bolt-elements-borderColor px-3 py-2 text-left hover:border-[#18a66a] disabled:opacity-50"
                            >
                              <span>
                                <span className="block text-sm font-medium text-bolt-elements-textPrimary">
                                  {project.name}
                                </span>
                                <span className="block text-xs text-bolt-elements-textSecondary">{project.region}</span>
                              </span>
                              <span className="text-xs font-semibold text-[#148456] dark:text-[#5ee2a6]">Connect</span>
                            </button>
                          ))}
                          {!supabaseAccount.stats?.projects?.length ? (
                            <button
                              type="button"
                              onClick={() => void handleCreateProject()}
                              className="text-sm font-medium text-[#148456] hover:underline dark:text-[#5ee2a6]"
                            >
                              Create a Supabase project
                            </button>
                          ) : null}
                        </div>
                      )}
                    </details>
                  </div>
                ) : (
                  <div className="mt-5 rounded-lg border border-bolt-elements-borderColor p-4">
                    <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">
                      Connect your PostgreSQL server
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-bolt-elements-textSecondary">
                      The runtime verifies the connection before saving it. The URL is injected as DATABASE_URL and
                      never returned to the browser.
                    </p>
                    <label
                      className="mt-4 block text-sm font-medium text-bolt-elements-textPrimary"
                      htmlFor="postgres-url"
                    >
                      Connection string
                    </label>
                    <input
                      id="postgres-url"
                      type="password"
                      value={databaseUrl}
                      onChange={(event) => setDatabaseUrl(event.target.value)}
                      placeholder="postgresql://user:password@host:5432/database?sslmode=require"
                      className={classNames(inputClasses, 'mt-1.5')}
                    />
                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={connectPostgresql}
                        disabled={saving || !databaseUrl.trim()}
                        className="rounded-lg bg-[#173f5f] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0f304b] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {saving ? 'Verifying...' : 'Verify and connect'}
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-5 flex justify-end">
                  <DialogClose asChild>
                    <DialogButton type="secondary">Cancel</DialogButton>
                  </DialogClose>
                </div>
              </div>
            )}
          </Dialog>
        ) : null}
      </DialogRoot>
    </div>
  );
}
