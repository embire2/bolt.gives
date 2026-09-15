import type { FileMap } from '@bolt/core/types/files';
import { filterWorkspaceSource } from '@bolt/core/lib/workspace-source.mjs';
import { readBoundedResponse } from '@bolt/core/lib/bounded-response';

export class RuntimeSnapshotError extends Error {
  constructor(
    readonly status: number,
    readonly sessionMissing = false,
  ) {
    super(`Unable to read current project source (HTTP ${status}). Retry after the current command finishes.`);
  }
}

export async function readRuntimeSnapshot(url: string, headers: HeadersInit = {}): Promise<FileMap> {
  const signal = AbortSignal.timeout(30_000);
  const requestHeaders = new Headers(headers);
  requestHeaders.set('Accept', 'application/json');

  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, { method: 'GET', headers: requestHeaders, signal });

    if (response.status === 409 && attempt < 2) {
      await response.body?.cancel();
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
      continue;
    }

    if (!response.ok) {
      const detail = await readBoundedResponse(response, 1024).catch(() => '');
      throw new RuntimeSnapshotError(
        response.status,
        response.status === 404 && detail.trim() === 'Unknown runtime session',
      );
    }

    const payload = JSON.parse(await readBoundedResponse(response, 16 * 1024 * 1024 + 1024)) as { files?: FileMap };

    if (!payload.files || typeof payload.files !== 'object' || Array.isArray(payload.files)) {
      throw new Error('The runtime did not return a valid source snapshot.');
    }

    return filterWorkspaceSource(payload.files);
  }
  throw new Error('The project is still changing. Retry after the current command finishes.');
}
