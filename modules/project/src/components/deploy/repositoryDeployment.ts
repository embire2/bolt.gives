import type { FileMap } from '@bolt/core/types/files';
import { fetchHostedRuntimeSnapshot, runHostedRuntimeCommand } from '@bolt/runtime/lib/runtime/hosted-runtime-client';

const EXCLUDED_DIRECTORY_NAMES = new Set(['.cache', '.git', '.next', 'build', 'dist', 'node_modules', 'out', 'output']);

function normalizeRepositoryPath(filePath: string) {
  return filePath.replace(/\\/g, '/').replace(/^\/?(?:home\/project\/)?/, '');
}

function shouldIncludeRepositoryFile(filePath: string) {
  const normalizedPath = normalizeRepositoryPath(filePath);
  const pathParts = normalizedPath.split('/').filter(Boolean);
  const fileName = pathParts.at(-1) || '';

  return (
    Boolean(normalizedPath) &&
    !pathParts.some((part, index) => index < pathParts.length - 1 && EXCLUDED_DIRECTORY_NAMES.has(part)) &&
    fileName !== '.DS_Store' &&
    !fileName.endsWith('.log') &&
    !fileName.startsWith('.env')
  );
}

export function repositoryFilesFromSnapshot(snapshot: FileMap): Record<string, string> {
  return Object.fromEntries(
    Object.entries(snapshot).flatMap(([filePath, entry]) => {
      if (
        entry?.type !== 'file' ||
        entry.isBinary ||
        typeof entry.content !== 'string' ||
        !shouldIncludeRepositoryFile(filePath)
      ) {
        return [];
      }

      return [[normalizeRepositoryPath(filePath), entry.content]];
    }),
  );
}

interface HostedRepositoryDependencies {
  runCommand?: typeof runHostedRuntimeCommand;
  fetchSnapshot?: typeof fetchHostedRuntimeSnapshot;
}

export async function buildAndSnapshotHostedRepository(
  sessionId: string,
  dependencies: HostedRepositoryDependencies = {},
) {
  if (!sessionId) {
    throw new Error('The hosted project session is unavailable. Reload the project and try again.');
  }

  const runCommand = dependencies.runCommand || runHostedRuntimeCommand;
  const fetchSnapshot = dependencies.fetchSnapshot || fetchHostedRuntimeSnapshot;
  const buildOutput = await runCommand({
    sessionId,
    command: 'pnpm run build',
    kind: 'shell',
  });

  if (buildOutput.exitCode !== 0) {
    return {
      buildOutput,
      files: {} as Record<string, string>,
    };
  }

  const files = repositoryFilesFromSnapshot(await fetchSnapshot(sessionId));

  if (Object.keys(files).length === 0) {
    throw new Error('The hosted project snapshot did not contain deployable source files.');
  }

  return {
    buildOutput,
    files,
  };
}
