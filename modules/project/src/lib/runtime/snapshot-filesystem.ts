import type { WebContainer } from '@webcontainer/api';
import type { FileMap } from '@bolt/core/types/files';
import { path } from '@bolt/core/utils/path';

/** Explicit history restore only. A runtime snapshot pull must never invoke these writes. */
export async function restoreSnapshotFilesystem(webcontainer: WebContainer, currentFiles: FileMap, nextFiles: FileMap) {
  const existingPaths = Object.entries(currentFiles)
    .filter(([, dirent]) => dirent !== undefined)
    .sort(([left], [right]) => right.length - left.length);

  for (const [absolutePath, dirent] of existingPaths) {
    const relativePath = path.relative(webcontainer.workdir, absolutePath);

    if (nextFiles[absolutePath] !== undefined || !relativePath || relativePath.startsWith('..')) {
      continue;
    }

    try {
      if (dirent?.type === 'folder') {
        await webcontainer.fs.rm(relativePath, { recursive: true });
      } else {
        await webcontainer.fs.rm(relativePath);
      }
    } catch {
      // Preserve the existing best-effort deletion behavior for explicit history restore.
    }
  }

  const entries = Object.entries(nextFiles).sort(([left], [right]) => left.length - right.length);

  for (const [absolutePath, dirent] of entries) {
    const relativePath = path.relative(webcontainer.workdir, absolutePath);

    if (!relativePath || relativePath.startsWith('..') || !dirent) {
      continue;
    }

    if (dirent.type === 'folder') {
      await webcontainer.fs.mkdir(relativePath, { recursive: true });
      continue;
    }

    const parentPath = path.dirname(relativePath);

    if (parentPath && parentPath !== '.') {
      await webcontainer.fs.mkdir(parentPath, { recursive: true });
    }

    const content = dirent.content ?? '';
    const normalized = content.includes(',') ? content.slice(content.indexOf(',') + 1) : content;
    await webcontainer.fs.writeFile(
      relativePath,
      dirent.isBinary ? Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0)) : content,
    );
  }
}
