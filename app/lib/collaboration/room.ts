const MAX_SCOPE_LENGTH = 160;
const MAX_FILE_PATH_LENGTH = 500;

export function buildCollaborationRoomName(projectScope: string, filePath: string): string {
  const normalizedScope = projectScope.trim().slice(0, MAX_SCOPE_LENGTH) || 'unscoped-project';
  const normalizedFilePath = filePath.trim().replace(/\\/g, '/').slice(0, MAX_FILE_PATH_LENGTH) || 'untitled';

  return encodeURIComponent(`${normalizedScope}:${normalizedFilePath}`);
}

export function resolveCollaborationProjectScope(options: {
  hostedRuntimeSessionId?: string | null;
  host?: string;
  pathname?: string;
}): string {
  const runtimeSessionId = options.hostedRuntimeSessionId?.trim();

  if (runtimeSessionId) {
    return `runtime:${runtimeSessionId}`;
  }

  return `route:${options.host?.trim() || 'local'}:${options.pathname?.trim() || '/'}`;
}
