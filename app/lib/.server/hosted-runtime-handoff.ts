import type { FileMap } from '~/lib/.server/llm/constants';
import {
  extractFileActions,
  sanitizeShellCommand,
  type SynthesizedRunHandoff,
  type ExtractedFileAction,
} from '~/lib/.server/llm/run-continuation';
import { normalizeArtifactFilePath, resolvePreferredArtifactFilePath } from '~/lib/runtime/file-paths';
import { sanitizeHostedRuntimeFileMap } from '~/lib/runtime/hosted-runtime-sanitize';
import { detectProjectCommands } from '~/utils/projectCommands';
import { fetchHostedRuntimeSnapshotForRequest, resolveHostedRuntimeBaseUrlForRequest } from './hosted-runtime-snapshot';

export interface HostedRuntimeCommandReplayResult {
  exitCode: number;
  output: string;
  previewBaseUrl: string | null;
}

export interface HostedRuntimeServerHandoffResult {
  appliedFilePaths: string[];
  setup?: HostedRuntimeCommandReplayResult;
  start: HostedRuntimeCommandReplayResult;
}

const STARTER_ENTRY_FILE_RE =
  /(^|\/)(src\/App\.(?:[jt]sx?|vue|svelte)|app\/page\.(?:[jt]sx?)|src\/main\.(?:[jt]sx?))$/i;
const STARTER_PLACEHOLDER_RE = /Your fallback starter is ready\./i;

function normalizeHostedRuntimeCommand(command: string, kind: 'shell' | 'start') {
  const sanitized = sanitizeShellCommand(command);

  if (kind === 'shell') {
    return sanitized.replace(/(^|&&\s*)(?:npm)\s+(?:install|i)\b/gi, '$1pnpm install --no-frozen-lockfile');
  }

  if (kind === 'start') {
    return sanitized
      .replace(/(^|&&\s*)(?:npm)\s+(?:run\s+)?(dev|start|preview)\b/gi, '$1pnpm run $2')
      .replace(/(^|&&\s*)(?:pnpm|bun)\s+(dev|start|preview)\b/gi, '$1pnpm run $2');
  }

  return sanitized;
}

function buildPartialFileMap(fileActions: ReturnType<typeof extractFileActions>): FileMap {
  const nextFiles: FileMap = {};

  for (const fileAction of fileActions) {
    nextFiles[fileAction.path] = {
      type: 'file',
      content: fileAction.content,
      isBinary: false,
    };
  }

  return nextFiles;
}

const SOURCE_EXTENSION_PRIORITY = ['.tsx', '.ts', '.jsx', '.js'] as const;

function rewriteHostedRuntimeFileActions(
  fileActions: ExtractedFileAction[],
  currentFiles: FileMap,
): ExtractedFileAction[] {
  return fileActions.map((fileAction) => {
    const normalizedPath = normalizeArtifactFilePath(fileAction.path);
    const preferredPath = resolvePreferredArtifactFilePath(normalizedPath, currentFiles);

    if (preferredPath === normalizedPath) {
      return {
        ...fileAction,
        path: normalizedPath,
      };
    }

    return {
      ...fileAction,
      path: preferredPath,
    };
  });
}

function stripConflictingSourceVariants(currentFiles: FileMap, fileActions: ExtractedFileAction[]): FileMap {
  const nextFiles: FileMap = { ...currentFiles };

  for (const fileAction of fileActions) {
    const normalizedPath = normalizeArtifactFilePath(fileAction.path);
    const extension = normalizedPath.slice(normalizedPath.lastIndexOf('.')).toLowerCase();

    if (!SOURCE_EXTENSION_PRIORITY.includes(extension as (typeof SOURCE_EXTENSION_PRIORITY)[number])) {
      continue;
    }

    const stemPath = normalizedPath.slice(0, -extension.length);

    for (const candidateExtension of SOURCE_EXTENSION_PRIORITY) {
      const candidatePath = `${stemPath}${candidateExtension}`;

      if (candidatePath !== normalizedPath) {
        delete nextFiles[candidatePath];
      }
    }
  }

  return nextFiles;
}

function mergeHostedRuntimeFiles(currentFiles: FileMap, nextFiles: FileMap): FileMap {
  const mergedFiles: FileMap = {};

  for (const [filePath, dirent] of Object.entries(currentFiles)) {
    mergedFiles[normalizeArtifactFilePath(filePath)] = dirent;
  }

  for (const [filePath, dirent] of Object.entries(nextFiles)) {
    mergedFiles[normalizeArtifactFilePath(filePath)] = dirent;
  }

  return mergedFiles;
}

function toProjectCommandFiles(files: FileMap) {
  return Object.entries(files)
    .filter(([, entry]) => entry?.type === 'file' && typeof entry.content === 'string')
    .map(([path, entry]) => ({
      path,
      content: (entry as Extract<FileMap[string], { type: 'file' }>).content,
    }));
}

function getFileEntry(files: FileMap, filePath: string) {
  const normalizedPath = normalizeArtifactFilePath(filePath);

  return files[normalizedPath] ?? files[filePath];
}

function parseJsonObject(content: string): Record<string, any> | null {
  try {
    const parsed = JSON.parse(content);

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, any>;
    }
  } catch {
    return null;
  }

  return null;
}

function hasFile(currentFiles: FileMap, path: string) {
  const entry = getFileEntry(currentFiles, path);

  return Boolean(entry && entry.type === 'file');
}

function reconcilePackageJsonAction(fileActions: ExtractedFileAction[], currentFiles: FileMap): ExtractedFileAction[] {
  const packageJsonIndex = fileActions.findIndex((fileAction) => fileAction.path.endsWith('package.json'));

  if (packageJsonIndex === -1) {
    return fileActions;
  }

  const currentPackageEntry = getFileEntry(currentFiles, 'package.json');

  if (!currentPackageEntry || currentPackageEntry.type !== 'file') {
    return fileActions;
  }

  const currentPackage = parseJsonObject(currentPackageEntry.content);
  const generatedPackage = parseJsonObject(fileActions[packageJsonIndex].content);

  if (!currentPackage || !generatedPackage) {
    return fileActions;
  }

  const currentScripts =
    currentPackage.scripts && typeof currentPackage.scripts === 'object' ? currentPackage.scripts : {};
  const generatedScripts =
    generatedPackage.scripts && typeof generatedPackage.scripts === 'object' ? generatedPackage.scripts : {};
  const currentDependencies =
    currentPackage.dependencies && typeof currentPackage.dependencies === 'object' ? currentPackage.dependencies : {};
  const currentDevDependencies =
    currentPackage.devDependencies && typeof currentPackage.devDependencies === 'object'
      ? currentPackage.devDependencies
      : {};
  const generatedDependencies =
    generatedPackage.dependencies && typeof generatedPackage.dependencies === 'object'
      ? generatedPackage.dependencies
      : {};
  const generatedDevDependencies =
    generatedPackage.devDependencies && typeof generatedPackage.devDependencies === 'object'
      ? generatedPackage.devDependencies
      : {};

  const currentLooksLikeVite =
    typeof currentScripts.dev === 'string' &&
    (typeof currentDependencies.vite === 'string' ||
      typeof currentDevDependencies.vite === 'string' ||
      hasFile(currentFiles, 'vite.config.ts') ||
      hasFile(currentFiles, 'vite.config.js') ||
      hasFile(currentFiles, 'src/main.tsx') ||
      hasFile(currentFiles, 'src/main.jsx'));
  const generatedMissingDevScript = typeof generatedScripts.dev !== 'string';
  const generatedLooksLikeCra =
    typeof generatedScripts.start === 'string' &&
    /react-scripts\s+start/i.test(generatedScripts.start as string) &&
    typeof generatedDependencies['react-scripts'] === 'string';

  if (!currentLooksLikeVite || !generatedMissingDevScript || !generatedLooksLikeCra) {
    return fileActions;
  }

  const reconciledPackage = {
    ...generatedPackage,
    dependencies: {
      ...currentDependencies,
      ...Object.fromEntries(Object.entries(generatedDependencies).filter(([name]) => name !== 'react-scripts')),
    },
    devDependencies: {
      ...currentDevDependencies,
      ...generatedDevDependencies,
    },
    scripts: {
      ...currentScripts,
    },
  };

  const nextFileActions = [...fileActions];
  nextFileActions[packageJsonIndex] = {
    ...nextFileActions[packageJsonIndex],
    content: `${JSON.stringify(reconciledPackage, null, 2)}\n`,
  };

  return nextFileActions;
}

async function syncHostedRuntimeWorkspaceServer(options: { requestUrl: string; sessionId: string; files: FileMap }) {
  const runtimeBaseUrl = resolveHostedRuntimeBaseUrlForRequest(options.requestUrl);
  const response = await fetch(`${runtimeBaseUrl}/sessions/${encodeURIComponent(options.sessionId)}/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      files: options.files,
      prune: true,
    }),
  });

  if (!response.ok) {
    throw new Error((await response.text()) || `Hosted runtime sync failed with status ${response.status}`);
  }
}

function isStarterEntryFile(filePath: string) {
  return STARTER_ENTRY_FILE_RE.test(normalizeArtifactFilePath(filePath));
}

function hasStarterPlaceholder(content: string) {
  return STARTER_PLACEHOLDER_RE.test(content);
}

function shouldVerifyStarterReplacement(currentSnapshot: FileMap, fileActions: ExtractedFileAction[]) {
  const currentStarterPaths = new Set(
    Object.entries(currentSnapshot)
      .filter(
        ([filePath, dirent]) =>
          dirent?.type === 'file' &&
          !dirent.isBinary &&
          typeof dirent.content === 'string' &&
          isStarterEntryFile(filePath) &&
          hasStarterPlaceholder(dirent.content),
      )
      .map(([filePath]) => normalizeArtifactFilePath(filePath)),
  );

  if (currentStarterPaths.size === 0) {
    return false;
  }

  return fileActions.some(
    (fileAction) =>
      currentStarterPaths.has(normalizeArtifactFilePath(fileAction.path)) && !hasStarterPlaceholder(fileAction.content),
  );
}

async function ensureHostedRuntimeFilesApplied(options: {
  requestUrl: string;
  sessionId: string;
  expectedFiles: ExtractedFileAction[];
  shouldVerifyStarter: boolean;
}) {
  if (!options.shouldVerifyStarter) {
    return;
  }

  const snapshot = await fetchHostedRuntimeSnapshotForRequest({
    requestUrl: options.requestUrl,
    sessionId: options.sessionId,
  });

  if (!snapshot) {
    throw new Error('Hosted runtime snapshot could not be loaded after sync.');
  }

  for (const expectedFile of options.expectedFiles) {
    const normalizedPath = normalizeArtifactFilePath(expectedFile.path);
    const snapshotEntry = snapshot[normalizedPath];

    if (!snapshotEntry || snapshotEntry.type !== 'file' || snapshotEntry.isBinary) {
      throw new Error(`Hosted runtime did not retain ${normalizedPath} after sync.`);
    }

    if (isStarterEntryFile(normalizedPath) && !hasStarterPlaceholder(expectedFile.content)) {
      if (hasStarterPlaceholder(snapshotEntry.content || '')) {
        throw new Error(`Hosted runtime kept the fallback starter in ${normalizedPath} after sync.`);
      }
    }
  }
}

async function runHostedRuntimeCommandServer(options: {
  requestUrl: string;
  sessionId: string;
  kind: 'shell' | 'start';
  command: string;
}): Promise<HostedRuntimeCommandReplayResult> {
  const runtimeBaseUrl = resolveHostedRuntimeBaseUrlForRequest(options.requestUrl);
  const response = await fetch(`${runtimeBaseUrl}/sessions/${encodeURIComponent(options.sessionId)}/command`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      kind: options.kind,
      command: options.command,
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error((await response.text()) || `Hosted runtime command failed with status ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let output = '';
  let exitCode = 1;
  let previewBaseUrl: string | null = null;
  let sawExit = false;

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed) {
        continue;
      }

      let event: Record<string, unknown>;

      try {
        event = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        continue;
      }

      if (event.type === 'stdout' || event.type === 'stderr') {
        output += String(event.chunk || '');
      }

      if (event.type === 'ready' && event.preview && typeof event.preview === 'object') {
        const baseUrl = (event.preview as { baseUrl?: unknown }).baseUrl;

        if (typeof baseUrl === 'string' && baseUrl.trim()) {
          previewBaseUrl = baseUrl;
        }
      }

      if (event.type === 'exit') {
        exitCode = Number(event.exitCode ?? 1);
        sawExit = true;
      }

      if (event.type === 'error') {
        throw new Error(String(event.error || 'Hosted runtime command reported an error'));
      }
    }

    if (sawExit) {
      await reader.cancel().catch(() => undefined);
      break;
    }
  }

  return {
    exitCode,
    output,
    previewBaseUrl,
  };
}

export async function applyHostedRuntimeAssistantActions(options: {
  requestUrl: string;
  sessionId: string;
  assistantContent: string;
  synthesizedRunHandoff: SynthesizedRunHandoff;
}): Promise<HostedRuntimeServerHandoffResult | null> {
  const sessionId = options.sessionId.trim();

  if (!sessionId) {
    return null;
  }

  const currentSnapshot = await fetchHostedRuntimeSnapshotForRequest({
    requestUrl: options.requestUrl,
    sessionId,
  }).catch(() => null);
  const fileActions = rewriteHostedRuntimeFileActions(
    reconcilePackageJsonAction(extractFileActions(options.assistantContent), currentSnapshot || {}),
    currentSnapshot || {},
  );
  const partialFiles = buildPartialFileMap(fileActions);

  if (fileActions.length === 0) {
    return null;
  }

  const normalizedCurrentSnapshot = stripConflictingSourceVariants(currentSnapshot || {}, fileActions);
  const mergedFiles = sanitizeHostedRuntimeFileMap(mergeHostedRuntimeFiles(normalizedCurrentSnapshot, partialFiles));
  const projectCommandFiles = toProjectCommandFiles(mergedFiles);
  const inferredCommands = await detectProjectCommands(projectCommandFiles);
  const hasPackageJson = projectCommandFiles.some(({ path }) =>
    normalizeArtifactFilePath(path).endsWith('package.json'),
  );

  const shouldVerifyStarter = shouldVerifyStarterReplacement(currentSnapshot || {}, fileActions);

  await syncHostedRuntimeWorkspaceServer({
    requestUrl: options.requestUrl,
    sessionId,
    files: mergedFiles,
  });

  try {
    await ensureHostedRuntimeFilesApplied({
      requestUrl: options.requestUrl,
      sessionId,
      expectedFiles: fileActions,
      shouldVerifyStarter,
    });
  } catch {
    await syncHostedRuntimeWorkspaceServer({
      requestUrl: options.requestUrl,
      sessionId,
      files: mergedFiles,
    });

    await ensureHostedRuntimeFilesApplied({
      requestUrl: options.requestUrl,
      sessionId,
      expectedFiles: fileActions,
      shouldVerifyStarter,
    });
  }

  const preferSynthesizedStartCommand =
    !hasPackageJson &&
    Boolean(options.synthesizedRunHandoff.startCommand) &&
    inferredCommands.type === 'Static' &&
    normalizeHostedRuntimeCommand(inferredCommands.startCommand || '', 'start') === 'npx --yes serve';
  const startCommand = preferSynthesizedStartCommand
    ? normalizeHostedRuntimeCommand(options.synthesizedRunHandoff.startCommand, 'start')
    : inferredCommands.startCommand
      ? normalizeHostedRuntimeCommand(inferredCommands.startCommand, 'start')
      : normalizeHostedRuntimeCommand(options.synthesizedRunHandoff.startCommand, 'start');
  const startResult = await runHostedRuntimeCommandServer({
    requestUrl: options.requestUrl,
    sessionId,
    kind: 'start',
    command: startCommand,
  });

  if (startResult.exitCode !== 0) {
    throw new Error(`Hosted runtime start command failed with exit code ${startResult.exitCode}`);
  }

  return {
    appliedFilePaths: fileActions.map((fileAction) => fileAction.path),
    start: startResult,
  };
}
