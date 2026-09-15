export const GENERATED_WORKSPACE_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.cache',
  '.local',
  '.next',
  'dist',
  'build',
  'coverage',
]);

export function isWorkspaceSourcePath(value) {
  if (typeof value !== 'string' || value.includes('\0')) {
    return false;
  }

  const segments = value.replace(/\\/g, '/').split('/').filter(Boolean);

  return (
    segments.length > 0 &&
    !segments.some(
      (part) =>
        part === '..' || GENERATED_WORKSPACE_DIRECTORIES.has(part) || /\.bolt-sync-\d+-\d+-[a-z0-9]+\.tmp$/.test(part),
    )
  );
}

/** @template T @param {Record<string, T>} files @returns {Record<string, T>} */
export function filterWorkspaceSource(files) {
  return Object.fromEntries(Object.entries(files || {}).filter(([filePath]) => isWorkspaceSourcePath(filePath)));
}
