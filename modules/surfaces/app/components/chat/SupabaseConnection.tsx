import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { toast } from 'react-toastify';
import { classNames } from '@bolt/core/utils/classNames';
import { projectDatabaseConnection } from '@bolt/project/lib/stores/project-database';
import { updateSupabaseConnection } from '@bolt/project/lib/stores/supabase';
import { workbenchStore } from '@bolt/project/lib/stores/workbench';
import {
  deleteHostedProjectConnection,
  fetchHostedProjectConnection,
  saveHostedProjectConnection,
} from '@bolt/runtime/lib/runtime/hosted-runtime-client';
import { Dialog, DialogButton, DialogClose, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { useProfile } from '~/lib/profile-context';

type WizardStep = 'welcome' | 'credentials' | 'connected';

const SUPABASE_SIGN_UP_URL = 'https://supabase.com/dashboard/sign-up';
const SUPABASE_PROJECTS_URL = 'https://supabase.com/dashboard/projects';

const inputClasses = classNames(
  'w-full rounded-lg border border-bolt-elements-borderColor px-3 py-2.5 text-sm',
  'bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary',
  'placeholder:text-bolt-elements-textTertiary focus:border-[#18a66a] focus:outline-none focus:ring-2 focus:ring-[#18a66a]/20',
);

export function SupabaseConnection() {
  const profileId = useProfile()?.id;
  const connection = useStore(projectDatabaseConnection);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>('welcome');
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [publishableKey, setPublishableKey] = useState('');
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
    setStep('welcome');
    setPublishableKey('');

    if (!profileId) {
      return undefined;
    }

    void fetchHostedProjectConnection(runtimeSessionId)
      .then((currentConnection) => {
        if (active) {
          projectDatabaseConnection.set(currentConnection);
          setStep(currentConnection ? 'connected' : 'welcome');
        }
      })
      .catch(() => {
        // A disconnected local runtime should not block the prompt surface.
      });

    return () => {
      active = false;
    };
  }, [runtimeSessionId, profileId]);

  const openDialog = () => {
    setStep(connection ? 'connected' : 'welcome');
    setIsDialogOpen(true);
  };

  const connectSupabase = async () => {
    setSaving(true);

    try {
      const nextConnection = await saveHostedProjectConnection(runtimeSessionId, {
        provider: 'supabase',
        supabaseUrl,
        anonKey: publishableKey,
      });
      projectDatabaseConnection.set(nextConnection);
      updateSupabaseConnection({
        credentials: { supabaseUrl: supabaseUrl.trim(), anonKey: publishableKey.trim() },
        isConnected: true,
      });
      setPublishableKey('');
      setStep('connected');
      toast.success('Supabase verified and connected. Restart Preview to apply it to a running app.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not connect Supabase');
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
      setSupabaseUrl('');
      setPublishableKey('');
      setStep('welcome');
      toast.success('Database settings removed. Restart Preview to clear the old runtime environment.');
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
        onClick={openDialog}
        className={classNames(
          'flex min-h-8 items-center gap-2 rounded-md border border-bolt-elements-borderColor px-2.5 py-1.5 text-xs font-medium',
          'bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive',
        )}
        title="Connect Supabase to this project"
        aria-label="Open database connection"
      >
        <span className="i-ph:database h-4 w-4 text-[#18a66a]" aria-hidden="true" />
        <span>{connection?.provider === 'supabase' ? connection.label : 'Supabase'}</span>
        {connection ? (
          <span
            className={classNames(
              'h-1.5 w-1.5 rounded-full',
              connection.provider === 'supabase' && connection.status === 'verified' ? 'bg-[#18a66a]' : 'bg-amber-500',
            )}
            aria-label={connection.status === 'verified' ? 'Verified' : 'Migration required'}
          />
        ) : null}
      </button>

      <DialogRoot open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        {isDialogOpen ? (
          <Dialog className="max-h-[85vh] max-w-[620px] overflow-y-auto p-6">
            <DialogTitle>
              <span className="i-ph:database h-5 w-5 text-[#18a66a]" />
              Connect Supabase
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm leading-6 text-bolt-elements-textSecondary">
              Projects start without a database. Use your own Supabase project; credentials stay in the private runtime
              and are never written into generated source.
            </DialogDescription>

            <div className="mt-5 flex items-center gap-2" aria-label="Supabase setup progress">
              {(['welcome', 'credentials', 'connected'] as const).map((wizardStep, index) => (
                <div
                  key={wizardStep}
                  className={classNames(
                    'h-1.5 flex-1 rounded-full',
                    index <= ['welcome', 'credentials', 'connected'].indexOf(step)
                      ? 'bg-[#18a66a]'
                      : 'bg-bolt-elements-background-depth-3',
                  )}
                />
              ))}
            </div>

            {step === 'welcome' ? (
              <div className="mt-6 space-y-4">
                <div className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5">
                  <p className="text-sm font-semibold text-bolt-elements-textPrimary">
                    Step 1: use your Supabase account
                  </p>
                  <p className="mt-2 text-sm leading-6 text-bolt-elements-textSecondary">
                    Supabase provides the hosted database and dashboard. bolt.gives connects only the project you
                    choose.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <a
                      href={SUPABASE_SIGN_UP_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-[#148456] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0f6f48]"
                    >
                      Register Supabase for Free
                    </a>
                    <button
                      type="button"
                      onClick={() => setStep('credentials')}
                      className="rounded-lg border border-bolt-elements-borderColor px-4 py-2.5 text-sm font-semibold text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive"
                    >
                      I have a Supabase account
                    </button>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-bolt-elements-textTertiary">
                    Registration opens in a new tab. Return here after creating a project.
                  </p>
                </div>
                <div className="flex justify-end">
                  <DialogClose asChild>
                    <DialogButton type="secondary">Close</DialogButton>
                  </DialogClose>
                </div>
              </div>
            ) : null}

            {step === 'credentials' ? (
              <div className="mt-6 rounded-xl border border-bolt-elements-borderColor p-5">
                <p className="text-sm font-semibold text-bolt-elements-textPrimary">Step 2: connect your project</p>
                <p className="mt-2 text-xs leading-5 text-bolt-elements-textSecondary">
                  Open the Supabase project Connect dialog and copy its Project URL and publishable key. Secret and
                  service-role keys are rejected.
                </p>
                <label className="mt-5 block text-sm font-medium text-bolt-elements-textPrimary" htmlFor="supabase-url">
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
                <label className="mt-4 block text-sm font-medium text-bolt-elements-textPrimary" htmlFor="supabase-key">
                  Publishable or anon key
                </label>
                <input
                  id="supabase-key"
                  type="password"
                  value={publishableKey}
                  onChange={(event) => setPublishableKey(event.target.value)}
                  placeholder="sb_publishable_... or eyJ..."
                  className={classNames(inputClasses, 'mt-1.5')}
                  autoComplete="off"
                />
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <a
                    href={SUPABASE_PROJECTS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold text-[#148456] hover:underline dark:text-[#5ee2a6]"
                  >
                    Open Supabase dashboard
                  </a>
                  <div className="flex gap-2">
                    <DialogButton
                      type="secondary"
                      onClick={() => setStep(connection ? 'connected' : 'welcome')}
                      disabled={saving}
                    >
                      Back
                    </DialogButton>
                    <button
                      type="button"
                      onClick={connectSupabase}
                      disabled={saving || !supabaseUrl.trim() || !publishableKey.trim()}
                      className="rounded-lg bg-[#148456] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0f6f48] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving ? 'Verifying...' : 'Verify and connect'}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {step === 'connected' && connection ? (
              <div className="mt-6 space-y-4">
                <div
                  className={classNames(
                    'rounded-xl border p-5',
                    connection.provider === 'supabase'
                      ? 'border-[#18a66a]/40 bg-[#18a66a]/10'
                      : 'border-amber-500/40 bg-amber-500/10',
                  )}
                >
                  <p className="text-sm font-semibold text-bolt-elements-textPrimary">
                    {connection.provider === 'supabase' ? 'Step 3: Supabase is verified' : 'Legacy database connected'}
                  </p>
                  <p className="mt-2 text-sm text-bolt-elements-textSecondary">{connection.label}</p>
                  <p className="mt-3 text-xs leading-5 text-bolt-elements-textTertiary">
                    {connection.provider === 'supabase'
                      ? 'Restart Preview after changing credentials so the generated app receives the new environment.'
                      : 'New database connections are Supabase-only. Move this project to Supabase to replace the legacy connection.'}
                  </p>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setStep('credentials')}
                    className="rounded-lg border border-bolt-elements-borderColor px-4 py-2 text-sm font-semibold text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive"
                    disabled={saving}
                  >
                    {connection.provider === 'supabase' ? 'Replace credentials' : 'Move to Supabase'}
                  </button>
                  <DialogClose asChild>
                    <DialogButton type="secondary">Close</DialogButton>
                  </DialogClose>
                  <DialogButton type="danger" onClick={disconnect} disabled={saving}>
                    {saving ? 'Disconnecting...' : 'Disconnect'}
                  </DialogButton>
                </div>
              </div>
            ) : null}
          </Dialog>
        ) : null}
      </DialogRoot>
    </div>
  );
}
