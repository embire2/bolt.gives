import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';

type UpdateLogEntry = {
  step: string;
  status: 'ok' | 'error' | 'retry' | 'rollback';
  command?: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  message?: string;
};

type UpdateCheckResponse = {
  available: boolean;
  currentVersion?: string;
  latestVersion?: string;
  error?: string;
};

type UpdateApplyResponse = {
  updated: boolean;
  rollbackApplied: boolean;
  error?: string;
  logs: UpdateLogEntry[];
  currentVersion?: string;
  latestVersion?: string;
};

const UPDATE_CHECK_INTERVAL_MS = 10 * 60 * 1000;

export function UpdateBanner() {
  const [check, setCheck] = useState<UpdateCheckResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [logs, setLogs] = useState<UpdateLogEntry[]>([]);

  const checkForUpdates = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch('/api/update');
      const payload = (await response.json()) as UpdateCheckResponse;
      setCheck(payload);
    } catch (error) {
      setCheck({
        available: false,
        error: error instanceof Error ? error.message : 'Failed to check updates',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkForUpdates();

    const interval = window.setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [checkForUpdates]);

  const applyUpdate = useCallback(async () => {
    setApplying(true);

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
      const payload = (await response.json()) as UpdateApplyResponse;
      setLogs(payload.logs || []);

      if (!response.ok || !payload.updated) {
        toast.error(payload.error || 'Update failed');
        setCheck((previous) => ({
          ...(previous || { available: true }),
          error: payload.error || 'Update failed',
        }));

        return;
      }

      toast.success(`Updated to ${payload.latestVersion || 'latest version'}. Restart to apply.`);
      setCheck({
        available: false,
        currentVersion: payload.currentVersion,
        latestVersion: payload.latestVersion,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Update failed');
      setCheck((previous) => ({
        ...(previous || { available: true }),
        error: error instanceof Error ? error.message : 'Update failed',
      }));
    } finally {
      setApplying(false);
    }
  }, []);

  if (!check?.available && logs.length === 0 && !check?.error) {
    return null;
  }

  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-xs text-bolt-elements-textSecondary">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-medium text-bolt-elements-textPrimary">Update manager:</span>{' '}
          {check?.available
            ? `v${check.latestVersion || 'latest'} available (current v${check.currentVersion || 'unknown'})`
            : check?.error
              ? check.error
              : 'Up to date'}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="rounded border border-bolt-elements-borderColor px-2 py-1 text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 disabled:opacity-60"
            onClick={() => checkForUpdates()}
            disabled={loading || applying}
          >
            {loading ? 'Checking…' : 'Check'}
          </button>
          {check?.available ? (
            <button
              className="rounded border border-bolt-elements-item-backgroundAccent px-2 py-1 text-bolt-elements-item-contentAccent hover:bg-bolt-elements-item-backgroundActive disabled:opacity-60"
              onClick={() => applyUpdate()}
              disabled={applying || loading}
            >
              {applying ? 'Updating…' : 'One-click update'}
            </button>
          ) : null}
        </div>
      </div>
      {logs.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-bolt-elements-textPrimary">Update logs</summary>
          <div className="mt-2 max-h-36 overflow-y-auto space-y-1 font-mono text-[11px]">
            {logs.map((log, index) => (
              <div key={`${log.step}-${index}`} className="rounded border border-bolt-elements-borderColor px-2 py-1">
                <div className="text-bolt-elements-textPrimary">
                  [{log.status}] {log.step}
                </div>
                {log.command ? <div>{log.command}</div> : null}
                {typeof log.exitCode === 'number' ? <div>exit: {log.exitCode}</div> : null}
                {log.stderr ? <div>stderr: {log.stderr}</div> : null}
                {log.stdout ? <div>stdout: {log.stdout.slice(0, 180)}</div> : null}
                {log.message ? <div>{log.message}</div> : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
