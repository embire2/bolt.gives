import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { buildDismissedUpdateStorageKey } from '~/lib/api/update-policy';

type UpdateLogEntry = {
  step: string;
  status: 'pending' | 'running' | 'ok' | 'error' | 'retry' | 'rollback' | 'skipped';
  command?: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  message?: string;
  progress?: number;
  timestamp?: string;
};

type UpdateOperation = {
  id: string;
  status: 'running' | 'completed' | 'failed';
  progress: number;
  currentStep: string;
  targetVersion?: string;
  startedAt: string;
  finishedAt?: string;
  fromCommit?: string;
  toCommit?: string;
  rollbackApplied?: boolean;
  error?: string;
  logs: UpdateLogEntry[];
};

type UpdateCheckResponse = {
  supported: boolean;
  available: boolean;
  policy: 'optional' | 'mandatory';
  mandatory: boolean;
  currentVersion?: string;
  latestVersion?: string;
  releaseUrl?: string;
  releaseName?: string;
  features: string[];
  error?: string;
  updateInProgress?: boolean;
  operation?: UpdateOperation;
};

type UpdateStartResponse = {
  started: boolean;
  operationId?: string;
  operation?: UpdateOperation;
  currentVersion?: string;
  latestVersion?: string;
  mandatory?: boolean;
  policy?: 'optional' | 'mandatory';
  error?: string;
  reason?: string;
};

function toFriendlyUpdateError(error: string | undefined): string | undefined {
  if (!error) {
    return undefined;
  }

  const normalized = error.toLowerCase();

  if (
    normalized.includes('[unenv]') ||
    normalized.includes('fs.readfile is not implemented') ||
    normalized.includes('node:fs') ||
    normalized.includes('update execution is unavailable') ||
    normalized.includes('update manager:') ||
    normalized.includes('unavailable in this runtime')
  ) {
    return 'Update checks are unavailable in this runtime. Continue updates through your normal Git/Cloudflare deploy flow.';
  }

  return error;
}

function readDismissed(version: string | undefined): boolean {
  if (typeof window === 'undefined' || !version) {
    return false;
  }

  try {
    return window.localStorage.getItem(buildDismissedUpdateStorageKey(version)) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(version: string | undefined) {
  if (typeof window === 'undefined' || !version) {
    return;
  }

  try {
    window.localStorage.setItem(buildDismissedUpdateStorageKey(version), '1');
  } catch {}
}

function getLatestLog(operation?: UpdateOperation): UpdateLogEntry | null {
  return operation?.logs?.slice(-1)[0] || null;
}

export function UpdateBanner() {
  const [check, setCheck] = useState<UpdateCheckResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const latestVersion = check?.latestVersion;
  const isMandatory = Boolean(check?.mandatory);
  const operation = check?.operation;
  const operationRunning = operation?.status === 'running';
  const operationFailed = operation?.status === 'failed';
  const operationCompleted = operation?.status === 'completed';
  const latestLog = getLatestLog(operation);

  const updateOperation = useCallback((operation: UpdateOperation) => {
    setCheck((previous) => ({
      ...(previous || {
        supported: true,
        available: true,
        policy: 'optional',
        mandatory: false,
        features: [],
      }),
      operation,
      updateInProgress: operation.status === 'running',
    }));
  }, []);

  const subscribeToUpdate = useCallback(
    (operationId: string) => {
      if (typeof EventSource === 'undefined') {
        return;
      }

      eventSourceRef.current?.close();

      const source = new EventSource(`/api/update?stream=1&operationId=${encodeURIComponent(operationId)}`);
      eventSourceRef.current = source;

      const handleEvent = (event: MessageEvent) => {
        try {
          const operation = JSON.parse(event.data) as UpdateOperation;
          updateOperation(operation);

          if (operation.status === 'completed') {
            toast.success(`Updated to ${operation.targetVersion || 'latest version'}. The instance may restart now.`);
            source.close();
          }

          if (operation.status === 'failed') {
            toast.error(operation.error || 'Update failed and rollback was attempted.');
            source.close();
          }
        } catch {}
      };

      source.addEventListener('snapshot', handleEvent);
      source.addEventListener('update', handleEvent);
      source.addEventListener('done', handleEvent);
      source.addEventListener('error', handleEvent);
    },
    [updateOperation],
  );

  const checkForUpdates = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch('/api/update');
      const payload = (await response.json()) as UpdateCheckResponse;
      const friendlyError = toFriendlyUpdateError(payload.error);
      const nextPayload = {
        ...payload,
        error: friendlyError,
      };

      setCheck(nextPayload);
      setDismissed(readDismissed(nextPayload.latestVersion));

      if (nextPayload.mandatory && nextPayload.available) {
        setModalOpen(true);
      }

      if (nextPayload.operation?.status === 'running') {
        subscribeToUpdate(nextPayload.operation.id);
        setModalOpen(true);
      }
    } catch (error) {
      setCheck({
        supported: false,
        available: false,
        policy: 'optional',
        mandatory: false,
        features: [],
        error: toFriendlyUpdateError(error instanceof Error ? error.message : 'Failed to check updates'),
      });
    } finally {
      setLoading(false);
    }
  }, [subscribeToUpdate]);

  const applyUpdate = useCallback(async () => {
    setStarting(true);
    setModalOpen(true);

    try {
      const response = await fetch('/api/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          retryCount: 2,
        }),
      });
      const payload = (await response.json()) as UpdateStartResponse;

      if (!response.ok || payload.error) {
        const displayError = toFriendlyUpdateError(payload.error) || 'Update failed to start';
        toast.error(displayError);
        setCheck((previous) => ({
          ...(previous || {
            supported: true,
            available: true,
            policy: 'optional',
            mandatory: false,
            features: [],
          }),
          error: displayError,
        }));

        return;
      }

      if (!payload.started) {
        await checkForUpdates();
        return;
      }

      if (payload.operation) {
        updateOperation(payload.operation);
      }

      if (payload.operationId) {
        subscribeToUpdate(payload.operationId);
      }
    } catch (error) {
      const displayError = toFriendlyUpdateError(error instanceof Error ? error.message : 'Update failed to start');
      toast.error(displayError);
      setCheck((previous) => ({
        ...(previous || {
          supported: true,
          available: true,
          policy: 'optional',
          mandatory: false,
          features: [],
        }),
        error: displayError,
      }));
    } finally {
      setStarting(false);
    }
  }, [checkForUpdates, subscribeToUpdate, updateOperation]);

  const dismissOptional = useCallback(() => {
    if (!latestVersion || isMandatory) {
      return;
    }

    writeDismissed(latestVersion);
    setDismissed(true);
    setModalOpen(false);
  }, [isMandatory, latestVersion]);

  useEffect(() => {
    void checkForUpdates();

    return () => eventSourceRef.current?.close();
  }, [checkForUpdates]);

  useEffect(() => {
    if (isMandatory && check?.available) {
      setModalOpen(true);
    }
  }, [check?.available, isMandatory]);

  const shouldShowBanner = useMemo(() => {
    if (!check?.supported || check.error?.includes('unavailable in this runtime')) {
      return false;
    }

    if (operationRunning || operationFailed || operationCompleted) {
      return true;
    }

    return Boolean(check.available && (!dismissed || isMandatory));
  }, [check, dismissed, isMandatory, operationCompleted, operationFailed, operationRunning]);

  if (!shouldShowBanner && !modalOpen) {
    return null;
  }

  const targetVersion = latestVersion || operation?.targetVersion || 'latest version';
  const progress = Math.max(0, Math.min(100, operation?.progress ?? (starting ? 4 : 0)));

  return (
    <>
      {shouldShowBanner ? (
        <div className="fixed left-0 right-0 top-0 z-[1200] border-b border-amber-300 bg-amber-50/95 px-3 py-2 text-sm text-amber-950 shadow-lg backdrop-blur dark:border-amber-500/40 dark:bg-amber-950/95 dark:text-amber-50">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              <div className="i-ph:arrow-circle-up-bold mt-0.5 text-lg text-amber-700 dark:text-amber-300" />
              <div>
                <div className="font-semibold">
                  {isMandatory ? 'Mandatory update required' : 'Update available'}: v{targetVersion}
                </div>
                <div className="text-xs opacity-85">
                  {operationRunning
                    ? `${operation.currentStep} (${progress}%)`
                    : 'Update safely from this instance. It may disconnect while services restart.'}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {operationRunning ? (
                <div className="h-2 w-44 overflow-hidden rounded-full bg-amber-200 dark:bg-amber-900">
                  <div className="h-full rounded-full bg-amber-600 transition-all" style={{ width: `${progress}%` }} />
                </div>
              ) : null}
              <button
                className="rounded-md bg-amber-700 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white shadow-sm hover:bg-amber-800 disabled:opacity-60"
                onClick={() => {
                  setModalOpen(true);

                  if (!operationRunning && !operationCompleted) {
                    void applyUpdate();
                  }
                }}
                disabled={loading || starting || operationRunning}
              >
                {operationRunning ? 'Updating...' : 'Update Now'}
              </button>
              {!isMandatory && !operationRunning ? (
                <button
                  className="rounded-md border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-50 dark:hover:bg-amber-900"
                  onClick={dismissOptional}
                >
                  Dismiss
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {modalOpen ? (
        <div
          className={`fixed inset-0 z-[1300] flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm ${
            isMandatory ? 'pointer-events-auto' : ''
          }`}
          role="dialog"
          aria-modal={isMandatory ? 'true' : 'false'}
          aria-label={isMandatory ? 'Mandatory update required' : 'Application update'}
        >
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-5 text-bolt-elements-textPrimary shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.26em] text-amber-600">
                  {isMandatory ? 'Mandatory release' : 'Application update'}
                </div>
                <h2 className="mt-1 text-2xl font-black">Update to v{targetVersion}</h2>
                <p className="mt-2 text-sm text-bolt-elements-textSecondary">
                  The system will now automatically update to version {targetVersion}. This instance may disconnect
                  during the update while services restart.
                </p>
              </div>
              {!isMandatory && !operationRunning ? (
                <button
                  className="rounded-full border border-bolt-elements-borderColor p-2 hover:bg-bolt-elements-background-depth-2"
                  onClick={() => setModalOpen(false)}
                  aria-label="Close update dialog"
                >
                  <div className="i-ph:x-bold" />
                </button>
              ) : null}
            </div>

            {check?.features?.length ? (
              <div className="mb-4 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
                <div className="mb-2 text-sm font-bold">New in this release</div>
                <ul className="space-y-2 text-sm text-bolt-elements-textSecondary">
                  {check.features.map((feature, index) => (
                    <li key={`${feature}-${index}`} className="flex gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="font-bold">{operation?.currentStep || (starting ? 'Starting update' : 'Ready')}</span>
                <span className="font-mono text-xs text-bolt-elements-textSecondary">{progress}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-bolt-elements-background-depth-3">
                <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
              {latestLog?.message || latestLog?.stdout || latestLog?.stderr ? (
                <div className="mt-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3 font-mono text-xs text-bolt-elements-textSecondary">
                  {latestLog.message || latestLog.stdout || latestLog.stderr}
                </div>
              ) : null}
            </div>

            {operation?.logs?.length ? (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-semibold">Live update log</summary>
                <div className="modern-scrollbar mt-2 max-h-56 space-y-2 overflow-y-auto font-mono text-[11px]">
                  {operation.logs.slice(-30).map((log, index) => (
                    <div
                      key={`${log.step}-${log.timestamp || index}`}
                      className="rounded border border-bolt-elements-borderColor px-2 py-1"
                    >
                      <div className="text-bolt-elements-textPrimary">
                        [{log.status}] {log.step}
                      </div>
                      {log.command ? <div>{log.command}</div> : null}
                      {typeof log.exitCode === 'number' ? <div>exit: {log.exitCode}</div> : null}
                      {log.stderr ? <div>stderr: {log.stderr}</div> : null}
                      {log.stdout ? <div>stdout: {log.stdout}</div> : null}
                      {log.message ? <div>{log.message}</div> : null}
                    </div>
                  ))}
                </div>
              </details>
            ) : null}

            {operationFailed ? (
              <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-200">
                Update failed.{' '}
                {operation?.rollbackApplied
                  ? 'Rollback was applied automatically.'
                  : 'Rollback could not be confirmed.'}
                {operation.error ? ` ${operation.error}` : ''}
              </div>
            ) : null}

            {operationCompleted ? (
              <div className="mt-4 rounded-xl border border-green-500/40 bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-200">
                Update completed. If the page disconnects, wait for the service restart and refresh this tab.
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              {!operationRunning && !operationCompleted && !operationFailed ? (
                <button
                  className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-60"
                  onClick={() => void applyUpdate()}
                  disabled={starting}
                >
                  {starting ? 'Starting...' : 'Update Now'}
                </button>
              ) : null}
              {!isMandatory && !operationRunning ? (
                <button
                  className="rounded-lg border border-bolt-elements-borderColor px-4 py-2 text-sm font-semibold hover:bg-bolt-elements-background-depth-2"
                  onClick={operationCompleted ? () => setModalOpen(false) : dismissOptional}
                >
                  {operationCompleted ? 'Close' : 'Dismiss'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
