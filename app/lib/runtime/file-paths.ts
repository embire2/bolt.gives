import { WORK_DIR } from '~/utils/constants';
import { path as pathUtils } from '~/utils/path';

function normalizeSlashes(filePath: string): string {
  return filePath.replace(/\\/g, '/').trim();
}

export function normalizeArtifactFilePath(filePath: string, workdir: string = WORK_DIR): string {
  const normalizedWorkdir = pathUtils.normalize(workdir);
  let normalizedPath = normalizeSlashes(filePath);

  if (!normalizedPath) {
    return normalizedWorkdir;
  }

  if (normalizedPath.startsWith('./')) {
    normalizedPath = normalizedPath.slice(2);
  }

  if (normalizedPath === normalizedWorkdir || normalizedPath.startsWith(`${normalizedWorkdir}/`)) {
    return pathUtils.normalize(normalizedPath);
  }

  if (pathUtils.isAbsolute(normalizedPath)) {
    return pathUtils.normalize(pathUtils.join(normalizedWorkdir, normalizedPath.slice(1)));
  }

  return pathUtils.normalize(pathUtils.join(normalizedWorkdir, normalizedPath));
}

export function toWorkbenchRelativeFilePath(filePath: string, workdir: string = WORK_DIR): string {
  const normalized = normalizeArtifactFilePath(filePath, workdir);
  const normalizedWorkdir = pathUtils.normalize(workdir);

  if (normalized === normalizedWorkdir) {
    return '';
  }

  return normalized.startsWith(`${normalizedWorkdir}/`) ? normalized.slice(normalizedWorkdir.length + 1) : normalized;
}

export function toWorkbenchAbsoluteFilePath(filePath: string, workdir: string = WORK_DIR): string {
  return normalizeArtifactFilePath(filePath, workdir);
}
