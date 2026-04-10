import { WORK_DIR } from '~/utils/constants';
import { path as pathUtils } from '~/utils/path';
import type { FileMap } from '~/lib/stores/files';

const SOURCE_EXTENSION_PRIORITY = ['.tsx', '.ts', '.jsx', '.js'] as const;
const SOURCE_PATH_HINT_RE = /(?:^|\/)(?:src|app|components?|pages)(?:\/|$)/i;
const ROOT_ENTRY_FILE_RE = /(?:^|\/)(?:App|main|index|page|layout)\.(?:tsx?|jsx?)$/i;

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

export function resolvePreferredArtifactFilePath(
  filePath: string,
  filesSnapshot?: FileMap,
  workdir: string = WORK_DIR,
): string {
  const normalizedPath = normalizeArtifactFilePath(filePath, workdir);

  if (!filesSnapshot) {
    return normalizedPath;
  }

  const extension = pathUtils.extname(normalizedPath).toLowerCase();

  if (!SOURCE_EXTENSION_PRIORITY.includes(extension as (typeof SOURCE_EXTENSION_PRIORITY)[number])) {
    return normalizedPath;
  }

  if (!SOURCE_PATH_HINT_RE.test(normalizedPath) && !ROOT_ENTRY_FILE_RE.test(normalizedPath)) {
    return normalizedPath;
  }

  const stemPath = normalizedPath.slice(0, -extension.length);
  const existingSibling = SOURCE_EXTENSION_PRIORITY.map(
    (candidateExtension) => `${stemPath}${candidateExtension}`,
  ).find((candidatePath) => filesSnapshot[candidatePath]?.type === 'file');

  return existingSibling || normalizedPath;
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
