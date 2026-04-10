import type { FileMap } from '~/lib/stores/files';
import type { ActionAlert } from '~/types/actions';

export const STARTER_PLACEHOLDER_TEXT = 'Your fallback starter is ready.';

const STARTER_ENTRY_FILE_RE =
  /(^|\/)(src\/App\.(?:[jt]sx?|vue|svelte)|app\/page\.(?:[jt]sx?)|src\/main\.(?:[jt]sx?))$/i;
const STARTER_IGNORE_FILE_RE = /(^|\/)(readme(\.[a-z0-9]+)?|changelog(\.[a-z0-9]+)?|\.bolt\/prompt)$/i;

export function hasFallbackStarterPlaceholder(fileMap: FileMap | undefined): boolean {
  if (!fileMap) {
    return false;
  }

  return Object.entries(fileMap).some(([filePath, dirent]) => {
    if (dirent?.type !== 'file' || dirent.isBinary || STARTER_IGNORE_FILE_RE.test(filePath)) {
      return false;
    }

    if (!STARTER_ENTRY_FILE_RE.test(filePath)) {
      return false;
    }

    return typeof dirent.content === 'string' && dirent.content.includes(STARTER_PLACEHOLDER_TEXT);
  });
}

export function isStarterPlaceholderAlert(alert: ActionAlert | null | undefined): boolean {
  if (!alert) {
    return false;
  }

  const combined = [alert.title, alert.description, alert.content].filter(Boolean).join('\n');

  return /Starter Placeholder Still Visible/i.test(combined) || combined.includes(STARTER_PLACEHOLDER_TEXT);
}
