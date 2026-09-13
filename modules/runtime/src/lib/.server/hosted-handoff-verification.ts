import type { FileMap } from '@bolt/core/types/files';
import { normalizeArtifactFilePath } from '@bolt/core/lib/runtime/file-paths';
import {
  fetchHostedRuntimeSnapshotForRequest,
  type HostedRuntimePreviewStatus,
  type HostedRuntimeRequestOptions,
} from './hosted-runtime-snapshot';

const PERSISTENCE_FILE_RE =
  /(^|\/)(?:src|app|components?|pages|routes)(?:\/|$)|(^|\/)(?:index\.html|App\.(?:tsx?|jsx?)|main\.(?:tsx?|jsx?))$/i;
const comparable = (content?: string) =>
  String(content || '')
    .replace(/\r\n/g, '\n')
    .trimEnd();

type HandoffOptions = {
  status?: HostedRuntimePreviewStatus | null;
  snapshot?: FileMap | null;
  appliedFiles?: Array<{ path: string; content: string }> | null;
};

export function detectRestoredHostedRuntimeHandoffMismatch(options: HandoffOptions): string | null {
  if (options.status?.recovery?.state !== 'restored' || !options.appliedFiles?.length) {
    return null;
  }

  if (!options.snapshot || Object.keys(options.snapshot).length === 0) {
    return 'The hosted preview recovered by restoring a prior workspace, but the runtime snapshot could not be loaded to confirm the latest generated files were retained.';
  }

  const critical = options.appliedFiles.filter((file) => PERSISTENCE_FILE_RE.test(file.path));

  for (const file of critical.length ? critical : options.appliedFiles) {
    const normalized = normalizeArtifactFilePath(file.path);
    const entry = options.snapshot[normalized] ?? options.snapshot[file.path];
    const relative = normalized.replace(/^\/home\/project\/?/i, '');

    if (!entry || entry.type !== 'file' || entry.isBinary) {
      return `The hosted runtime restored the last known working snapshot, and the latest generated update to ${relative} is no longer present. Continue from the restored workspace and reapply the requested change with a compiling fix.`;
    }

    if (comparable(entry.content) !== comparable(file.content)) {
      return `The hosted runtime restored the last known working snapshot, and the latest generated update to ${relative} was not retained. Continue from the restored workspace and reapply the requested change with a compiling fix.`;
    }
  }

  return null;
}

export async function summarizeRestoredHostedRuntimeHandoffMismatchForRequest(
  options: HostedRuntimeRequestOptions & HandoffOptions,
) {
  if (options.status?.recovery?.state !== 'restored') {
    return null;
  }

  const snapshot = await fetchHostedRuntimeSnapshotForRequest(options).catch(() => null);

  return detectRestoredHostedRuntimeHandoffMismatch({ ...options, snapshot });
}
