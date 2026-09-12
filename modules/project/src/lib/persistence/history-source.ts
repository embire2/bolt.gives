import type { FileMap } from '@bolt/core/types/files';
import { fetchHostedRuntimeSnapshot } from '@bolt/runtime/lib/runtime/hosted-runtime-client';
import { RuntimeSnapshotError } from '@bolt/runtime/lib/runtime/snapshot-transport';

/** Cached history is a recovery source, not permission to overwrite an existing runtime. */
export async function resolveHistorySource(
  cachedFiles: FileMap,
  sessionId?: string,
  fetchSnapshot: (id: string) => Promise<FileMap> = fetchHostedRuntimeSnapshot,
) {
  if (sessionId) {
    try {
      return { files: await fetchSnapshot(sessionId), fromRuntime: true };
    } catch (error) {
      if (!(error instanceof RuntimeSnapshotError) || !error.sessionMissing) {
        throw error;
      }
    }
  }

  return { files: cachedFiles, fromRuntime: false };
}
