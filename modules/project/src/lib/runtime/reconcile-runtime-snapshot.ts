import type { FileMap } from '@bolt/core/types/files';
import { fetchHostedRuntimeSnapshot } from '@bolt/runtime/lib/runtime/hosted-runtime-client';

interface SnapshotTarget {
  files: { get(): FileMap };
  hostedRuntimeSessionId: string | undefined;
  restoreSnapshot(files: FileMap, fromRuntime: boolean): Promise<void>;
  unsavedFiles?: { get(): Set<string> };
  artifacts?: {
    get(): Record<string, { runner: { actions: { get(): Record<string, { type: string; status?: string }> } } }>;
  };
}

function hasPendingSource(target: SnapshotTarget) {
  return (
    Boolean(target.unsavedFiles?.get().size) ||
    Object.values(target.artifacts?.get() || {}).some((artifact) =>
      Object.values(artifact.runner.actions.get()).some(
        (action) => action.type === 'file' && (action.status === 'pending' || action.status === 'running'),
      ),
    )
  );
}

export async function reconcileRuntimeSnapshot(
  target: SnapshotTarget,
  sessionId: string,
  fetchSnapshot: (id: string) => Promise<FileMap> = fetchHostedRuntimeSnapshot,
) {
  if (hasPendingSource(target)) {
    return false;
  }

  const baseline = target.files.get();
  const snapshot = await fetchSnapshot(sessionId);

  // A slow health event cannot overwrite a new prompt's edits or another project's files.
  if (target.files.get() !== baseline || target.hostedRuntimeSessionId !== sessionId || hasPendingSource(target)) {
    return false;
  }

  await target.restoreSnapshot(snapshot, true);

  return true;
}
