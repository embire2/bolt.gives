import type { FileMap } from '@bolt/core/types/files';
import { filterWorkspaceSource } from '@bolt/core/lib/workspace-source.mjs';
import { readBoundedResponse } from '@bolt/core/lib/bounded-response';

export async function readRuntimeSnapshot(url: string): Promise<FileMap> {
  const signal = AbortSignal.timeout(30_000);

  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' }, signal });

    if (response.status === 409 && attempt < 2) {
      await response.body?.cancel();
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(
        `Unable to read current project source (HTTP ${response.status}). Retry after the current command finishes.`,
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
