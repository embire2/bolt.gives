import {
  decodeHtmlCommandDelimiters,
  makeInstallCommandsLowNoise,
  makeStartCommandsForeground,
  normalizeShellCommandSurface,
  rewriteAllPackageManagersToPnpm,
  unwrapCommandJsonEnvelope,
} from '~/lib/runtime/shell-command-utils';
import { normalizeArtifactFilePath } from '~/lib/runtime/file-paths';
import { detectProjectCommands } from '~/utils/projectCommands';
import type { FileMap } from '~/lib/stores/files';
import { WORK_DIR } from '~/utils/constants';

export interface RunContinuationOptions {
  chatMode: 'build' | 'discuss';
  lastUserContent: string;
  assistantContent: string;
  alreadyAttempted: boolean;
  currentFiles?: FileMap;
}

export interface RunContinuationDecision {
  shouldContinue: boolean;
  reason:
    | 'already-attempted'
    | 'chat-mode-discuss'
    | 'no-run-or-build-intent'
    | 'no-bolt-actions'
    | 'inspection-only-shell-actions'
    | 'scaffold-without-start'
    | 'run-intent-without-start'
    | 'starter-without-implementation'
    | 'starter-entry-unchanged'
    | 'bootstrap-only-shell-actions'
    | 'continuation-not-required';
  starterEntryFilePath?: string;
}

export interface SynthesizedRunHandoff {
  assistantContent: string;
  followupMessage: string;
  reason: 'inferred-project-commands';
  setupCommand?: string;
  startCommand: string;
}

export interface ExtractedFileAction {
  content: string;
  path: string;
}

const RUN_INTENT_RE =
  /\b(run|start|preview|launch|serve)\b|dev server|localhost|0\.0\.0\.0|--host|--port|vite\s+\+\s+react/i;
const BUILD_INTENT_RE =
  /\b(create|build|implement|develop|ship|finish)\b.*\b(app|website|dashboard|scheduler|portal|project)\b|\bappointment\b|\bcalendar\b/i;
const SCAFFOLD_RE = /create-vite|npm\s+create\s+vite|pnpm\s+dlx\s+create-vite|create-react-app|scaffold/i;
const STARTER_BOOTSTRAP_RE =
  /Bolt is initializing your project|template import is done|built-in .*starter fallback|fallback starter/i;
const STARTER_PLACEHOLDER_RE = /Your fallback starter is ready\./i;
const VITE_REACT_STARTER_RE =
  /Vite \+ React|vite\.svg|react\.svg|Click on the Vite and React logos|count is|setCount\(\(count\) => count \+ 1\)|Learn React/i;
const STARTER_ENTRY_FILE_RE =
  /(^|\/)(src\/App\.(?:[jt]sx?|vue|svelte)|app\/page\.(?:[jt]sx?)|src\/main\.(?:[jt]sx?))$/i;
const PRIMARY_ENTRY_FILE_RE =
  /(^|\/)(src\/App\.(?:[jt]sx?|vue|svelte)|app\/page\.(?:[jt]sx?)|pages\/index\.(?:[jt]sx?)|src\/pages\/index\.(?:[jt]sx?)|app\/routes\/(?:index|_index)\.(?:[jt]sx?)|src\/routes\/(?:index|\+page)\.(?:[jt]sx?|vue|svelte))$/i;
const SOURCE_EXTENSION_PRIORITY = ['.tsx', '.ts', '.jsx', '.js'] as const;
const SOURCE_PATH_HINT_RE = /(?:^|\/)(?:src|app|components?|pages)(?:\/|$)/i;
const START_ACTION_WITH_CONTENT_RE = /<boltAction[^>]*type="start"[^>]*>([\s\S]*?)<\/boltAction>/gi;
const BOLT_ACTION_RE = /<boltAction\b/i;
const FILE_ACTION_RE = /<boltAction[^>]*type="file"/i;
const FILE_PATH_RE = /<boltAction[^>]*type="file"[^>]*filePath=(["'])([^"']+)\1[^>]*>/gi;
const FILE_ACTION_WITH_CONTENT_RE =
  /<boltAction[^>]*type="file"[^>]*filePath=(["'])([^"']+)\1[^>]*>([\s\S]*?)<\/boltAction>/gi;
const SHELL_ACTION_RE = /<boltAction[^>]*type="shell"[^>]*>([\s\S]*?)<\/boltAction>/gi;

const INSPECTION_COMMAND_RE =
  /^\s*(ls(\s|$)|pwd(\s|$)|echo(\s|$)|cat(\s|$)|find(\s|$)|tree(\s|$)|whoami(\s|$)|env(\s|$)|printenv(\s|$)|cd(\s|$))/i;
const INSTALL_COMMAND_RE = /^(npm|pnpm|yarn|bun)\s+(install|i)\b/i;
const START_COMMAND_RE =
  /^(npm|pnpm|yarn|bun)\s+(run\s+)?(dev|start|preview)\b|^vite(?:\s|$)|^next\s+dev\b|^react-scripts\s+start\b|^astro\s+dev\b|^nuxt\s+dev\b|^ng\s+serve\b|^serve\b/i;
const BOOTSTRAP_ECHO_RE = /^echo\s+["']?Using built-in .*starter files["']?$/i;
const CD_OR_MKDIR_RE = /^(cd|mkdir\s+-p)\b/i;
const START_AUXILIARY_SEGMENT_RE = /^(cd\b|mkdir\s+-p\b|export\b|set\s+-[a-z-]+\b|source\b|[A-Z_][A-Z0-9_]*=)/i;
const NON_IMPLEMENTATION_FILE_RE =
  /(^|\/)(readme(\.[a-z0-9]+)?|changelog(\.[a-z0-9]+)?|package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb|tsconfig(\.[a-z0-9-]+)?\.json|vite\.config\.[a-z0-9]+|eslint\.config\.[a-z0-9]+|prettier\.config\.[a-z0-9]+|postcss\.config\.[a-z0-9]+|tailwind\.config\.[a-z0-9]+|index\.html|\.gitignore|\.npmrc|\.nvmrc|\.editorconfig|\.env(\.[a-z0-9-]+)?)$/i;
const PNPM_LOCKFILE_RE = /(^|\/)pnpm-lock\.ya?ml$/i;
const YARN_LOCKFILE_RE = /(^|\/)yarn\.lock$/i;
const BUN_LOCKFILE_RE = /(^|\/)bun\.lockb?$/i;
const IRRELEVANT_WORKSPACE_PATH_RE =
  /(^|\/)(node_modules|\.pnpm|\.vite|dist|build|coverage|\.next|out|\.turbo|\.cache)(\/|$)/i;

function isProjectOwnedPath(filePath: string): boolean {
  return !IRRELEVANT_WORKSPACE_PATH_RE.test(normalizeFilePath(filePath));
}

function sortFilesByProjectPriority(fileActions: ExtractedFileAction[]): ExtractedFileAction[] {
  return [...fileActions]
    .filter((fileAction) => isProjectOwnedPath(fileAction.path))
    .sort((left, right) => {
      const normalizedLeft = normalizeFilePath(left.path);
      const normalizedRight = normalizeFilePath(right.path);
      const leftDepth = normalizedLeft.split('/').filter(Boolean).length;
      const rightDepth = normalizedRight.split('/').filter(Boolean).length;

      if (leftDepth !== rightDepth) {
        return leftDepth - rightDepth;
      }

      return normalizedLeft.localeCompare(normalizedRight);
    });
}

function splitCommandSegments(command: string): string[] {
  return command
    .split(/\s*(?:&&|;|\|\|)\s*/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

export function extractShellCommands(assistantContent: string): string[] {
  const commands: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = SHELL_ACTION_RE.exec(assistantContent)) !== null) {
    const command = match[1]?.trim();

    if (command) {
      commands.push(command);
    }
  }

  return commands;
}

export function extractStartCommands(assistantContent: string): string[] {
  const commands: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = START_ACTION_WITH_CONTENT_RE.exec(assistantContent)) !== null) {
    const command = match[1]?.trim();

    if (command) {
      commands.push(command);
    }
  }

  return commands;
}

export function sanitizeShellCommand(command: string): string {
  let sanitized = command.trim();

  const applyRewrite = (nextCommand?: string) => {
    if (nextCommand && nextCommand.trim().length > 0 && nextCommand !== sanitized) {
      sanitized = nextCommand.trim();
    }
  };

  applyRewrite(unwrapCommandJsonEnvelope(sanitized).modifiedCommand);
  applyRewrite(normalizeShellCommandSurface(sanitized).modifiedCommand);
  applyRewrite(decodeHtmlCommandDelimiters(sanitized).modifiedCommand);

  return sanitized;
}

function isRunnableStartCommand(command: string): boolean {
  const sanitized = sanitizeShellCommand(command);
  const segments = splitCommandSegments(sanitized);

  if (segments.length === 0) {
    return false;
  }

  let sawRunnableStartSegment = false;

  for (const segment of segments) {
    if (START_COMMAND_RE.test(segment) || INSTALL_COMMAND_RE.test(segment)) {
      if (START_COMMAND_RE.test(segment)) {
        sawRunnableStartSegment = true;
      }

      continue;
    }

    if (START_AUXILIARY_SEGMENT_RE.test(segment)) {
      continue;
    }

    return false;
  }

  return sawRunnableStartSegment;
}

function extractRunnableStartCommand(assistantContent: string): string | undefined {
  for (const command of extractStartCommands(assistantContent)) {
    const sanitized = sanitizeShellCommand(command);
    const foregroundStart = makeStartCommandsForeground(sanitized).modifiedCommand || sanitized;

    if (isRunnableStartCommand(foregroundStart)) {
      return foregroundStart;
    }
  }

  for (const command of extractShellCommands(assistantContent)) {
    const sanitized = sanitizeShellCommand(command);
    const foregroundStart = makeStartCommandsForeground(sanitized).modifiedCommand || sanitized;
    const startSegment = splitCommandSegments(foregroundStart).find((segment) => START_COMMAND_RE.test(segment));

    if (startSegment && isRunnableStartCommand(foregroundStart)) {
      return foregroundStart;
    }
  }

  return undefined;
}

function extractPackageJsonContent(fileActions: ExtractedFileAction[]): string | undefined {
  const packageJsonAction = sortFilesByProjectPriority(fileActions).find((fileAction) =>
    normalizeFilePath(fileAction.path).endsWith('package.json'),
  );

  return packageJsonAction?.content;
}

function detectPackageManagerForFiles(fileActions: ExtractedFileAction[]): 'npm' | 'pnpm' | 'yarn' | 'bun' {
  const packageJsonContent = extractPackageJsonContent(fileActions);

  if (packageJsonContent) {
    const packageManagerMatch = packageJsonContent.match(/"packageManager"\s*:\s*"(pnpm|yarn|bun|npm)@/i);

    if (packageManagerMatch?.[1]) {
      return packageManagerMatch[1].toLowerCase() as 'npm' | 'pnpm' | 'yarn' | 'bun';
    }
  }

  if (fileActions.some((fileAction) => PNPM_LOCKFILE_RE.test(normalizeFilePath(fileAction.path)))) {
    if (
      !fileActions.some(
        (fileAction) =>
          isProjectOwnedPath(fileAction.path) && PNPM_LOCKFILE_RE.test(normalizeFilePath(fileAction.path)),
      )
    ) {
      return 'npm';
    }

    return 'pnpm';
  }

  if (
    fileActions.some(
      (fileAction) => isProjectOwnedPath(fileAction.path) && YARN_LOCKFILE_RE.test(normalizeFilePath(fileAction.path)),
    )
  ) {
    return 'yarn';
  }

  if (
    fileActions.some(
      (fileAction) => isProjectOwnedPath(fileAction.path) && BUN_LOCKFILE_RE.test(normalizeFilePath(fileAction.path)),
    )
  ) {
    return 'bun';
  }

  return 'npm';
}

function alignCommandToProjectPackageManager(
  command: string | undefined,
  fileActions: ExtractedFileAction[],
): string | undefined {
  if (!command) {
    return undefined;
  }

  const preferredPackageManager = detectPackageManagerForFiles(fileActions);
  let aligned = sanitizeShellCommand(command);

  if (preferredPackageManager === 'pnpm') {
    const pnpmRewrite = rewriteAllPackageManagersToPnpm(aligned);
    aligned = pnpmRewrite.modifiedCommand || aligned;
  }

  const lowNoiseRewrite = makeInstallCommandsLowNoise(aligned);
  aligned = lowNoiseRewrite.modifiedCommand || aligned;

  return aligned;
}

function extractPackageScriptNames(fileActions: ExtractedFileAction[]): Set<string> {
  const packageJsonContent = extractPackageJsonContent(fileActions);

  if (!packageJsonContent) {
    return new Set();
  }

  try {
    const parsed = JSON.parse(packageJsonContent) as { scripts?: Record<string, unknown> };

    if (parsed?.scripts && typeof parsed.scripts === 'object') {
      return new Set(Object.keys(parsed.scripts));
    }
  } catch {
    const scriptNames = new Set<string>();
    const scriptRegex = /"(dev|start|preview|build|test)"\s*:/g;
    let match: RegExpExecArray | null;

    while ((match = scriptRegex.exec(packageJsonContent)) !== null) {
      scriptNames.add(match[1]);
    }

    return scriptNames;
  }

  return new Set();
}

function extractPackageScriptNameFromCommand(command: string): string | undefined {
  const sanitized = sanitizeShellCommand(command);
  const segments = splitCommandSegments(sanitized);

  for (const segment of segments) {
    const npmRunMatch = segment.match(/^(npm|pnpm|yarn|bun)\s+(?:run\s+)?([a-z0-9:_-]+)\b/i);

    if (npmRunMatch) {
      return npmRunMatch[2];
    }
  }

  return undefined;
}

function extractLeadingPackageManager(command: string | undefined): 'npm' | 'pnpm' | 'yarn' | 'bun' | undefined {
  if (!command) {
    return undefined;
  }

  const leadingPackageManagerMatch = sanitizeShellCommand(command).match(/^(npm|pnpm|yarn|bun)\b/i);

  if (!leadingPackageManagerMatch?.[1]) {
    return undefined;
  }

  return leadingPackageManagerMatch[1].toLowerCase() as 'npm' | 'pnpm' | 'yarn' | 'bun';
}

function extractFilePaths(assistantContent: string): string[] {
  const filePaths: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = FILE_PATH_RE.exec(assistantContent)) !== null) {
    const filePath = match[2]?.trim();

    if (filePath) {
      filePaths.push(filePath);
    }
  }

  return filePaths;
}

function normalizeGeneratedFileContent(filePath: string, content: string): string {
  let normalized = content.trim();

  if (!filePath.endsWith('.md')) {
    const codeBlockMatch = normalized.match(/^\s*```[\w-]*\n([\s\S]*?)\n?```\s*$/);

    if (codeBlockMatch) {
      normalized = codeBlockMatch[1];
    }

    normalized = normalized.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  }

  return normalized.endsWith('\n') ? normalized : `${normalized}\n`;
}

export function extractFileActions(assistantContent: string): ExtractedFileAction[] {
  const files: ExtractedFileAction[] = [];
  let match: RegExpExecArray | null;

  while ((match = FILE_ACTION_WITH_CONTENT_RE.exec(assistantContent)) !== null) {
    const filePath = match[2]?.trim();
    const rawContent = match[3] ?? '';

    if (!filePath) {
      continue;
    }

    files.push({
      path: filePath,
      content: normalizeGeneratedFileContent(filePath, rawContent),
    });
  }

  return files;
}

function normalizeFilePath(filePath: string): string {
  return filePath
    .replace(/\\/g, '/')
    .replace(new RegExp(`^${WORK_DIR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?`, 'i'), '')
    .replace(/^\/home\/project\/?/i, '')
    .replace(/^\.?\//, '')
    .toLowerCase();
}

function findStarterEntryFiles(filesSnapshot?: FileMap): string[] {
  if (!filesSnapshot) {
    return [];
  }

  return Object.entries(filesSnapshot)
    .filter(([filePath, dirent]) => {
      if (dirent?.type !== 'file' || dirent.isBinary) {
        return false;
      }

      return STARTER_ENTRY_FILE_RE.test(filePath) && STARTER_PLACEHOLDER_RE.test(dirent.content || '');
    })
    .map(([filePath]) => filePath);
}

function resolveWorkspacePreferredPath(filePath: string, filesSnapshot?: FileMap): string {
  const normalizedArtifactPath = normalizeArtifactFilePath(filePath, WORK_DIR);

  if (!filesSnapshot) {
    return normalizedArtifactPath;
  }

  const normalizedRelativePath = normalizeFilePath(filePath);
  const extensionMatch = normalizedRelativePath.match(/\.[^.\\/]+$/);
  const extension = extensionMatch?.[0]?.toLowerCase();

  if (!extension || !SOURCE_EXTENSION_PRIORITY.includes(extension as (typeof SOURCE_EXTENSION_PRIORITY)[number])) {
    return normalizedArtifactPath;
  }

  if (!SOURCE_PATH_HINT_RE.test(normalizedRelativePath) && !STARTER_ENTRY_FILE_RE.test(normalizedRelativePath)) {
    return normalizedArtifactPath;
  }

  const stemPath = normalizedRelativePath.slice(0, -extension.length);
  const snapshotPathByNormalizedPath = new Map(
    Object.keys(filesSnapshot).map((snapshotPath) => [normalizeFilePath(snapshotPath), snapshotPath]),
  );

  for (const candidateExtension of SOURCE_EXTENSION_PRIORITY) {
    const existingPath = snapshotPathByNormalizedPath.get(`${stemPath}${candidateExtension}`);

    if (existingPath) {
      return existingPath;
    }
  }

  return normalizedArtifactPath;
}

function touchesStarterEntryFile(filePaths: string[], starterEntryFiles: string[], filesSnapshot?: FileMap): boolean {
  if (filePaths.length === 0 || starterEntryFiles.length === 0) {
    return false;
  }

  const normalizedStarterEntries = new Set(starterEntryFiles.map((filePath) => normalizeFilePath(filePath)));

  return filePaths.some((filePath) =>
    normalizedStarterEntries.has(normalizeFilePath(resolveWorkspacePreferredPath(filePath, filesSnapshot))),
  );
}

function replacesStarterEntryFile(
  fileActions: ExtractedFileAction[],
  starterEntryFiles: string[],
  filesSnapshot?: FileMap,
): boolean {
  if (fileActions.length === 0 || starterEntryFiles.length === 0) {
    return false;
  }

  const normalizedStarterEntries = new Set(starterEntryFiles.map((filePath) => normalizeFilePath(filePath)));

  return fileActions.some((fileAction) => {
    const preferredPath = resolveWorkspacePreferredPath(fileAction.path, filesSnapshot);

    if (!normalizedStarterEntries.has(normalizeFilePath(preferredPath))) {
      return false;
    }

    return !STARTER_PLACEHOLDER_RE.test(fileAction.content);
  });
}

function hasStarterPlaceholderInFiles(files: ExtractedFileAction[]): boolean {
  return files.some((file) => STARTER_ENTRY_FILE_RE.test(file.path) && hasKnownStarterContent(file.content));
}

function hasKnownStarterContent(content: string): boolean {
  return STARTER_PLACEHOLDER_RE.test(content) || VITE_REACT_STARTER_RE.test(content);
}

function hasConcretePrimaryEntryFile(files: ExtractedFileAction[]): boolean {
  return files.some(
    (file) => PRIMARY_ENTRY_FILE_RE.test(normalizeFilePath(file.path)) && !hasKnownStarterContent(file.content),
  );
}

function hasImplementationFileAction(filePaths: string[]): boolean {
  if (filePaths.length === 0) {
    return false;
  }

  return filePaths.some((filePath) => {
    const normalizedPath = normalizeFilePath(filePath);

    if (!normalizedPath || normalizedPath.startsWith('node_modules/')) {
      return false;
    }

    return !NON_IMPLEMENTATION_FILE_RE.test(normalizedPath);
  });
}

function hasConcreteImplementationFile(files: ExtractedFileAction[]): boolean {
  return files.some((file) => {
    const normalizedPath = normalizeFilePath(file.path);

    if (
      !normalizedPath ||
      normalizedPath.startsWith('node_modules/') ||
      NON_IMPLEMENTATION_FILE_RE.test(normalizedPath)
    ) {
      return false;
    }

    return !hasKnownStarterContent(file.content);
  });
}

function hasOnlyInspectionCommands(commands: string[]): boolean {
  if (commands.length === 0) {
    return false;
  }

  return commands.every((command) => {
    const segments = splitCommandSegments(command);
    return segments.length > 0 && segments.every((segment) => INSPECTION_COMMAND_RE.test(segment));
  });
}

function hasOnlyBootstrapShellCommands(commands: string[]): boolean {
  if (commands.length === 0) {
    return false;
  }

  let foundBootstrapSignal = false;

  for (const command of commands) {
    const segments = splitCommandSegments(command);

    if (segments.length === 0) {
      return false;
    }

    for (const segment of segments) {
      const isBootstrapSegment =
        SCAFFOLD_RE.test(segment) ||
        INSTALL_COMMAND_RE.test(segment) ||
        START_COMMAND_RE.test(segment) ||
        BOOTSTRAP_ECHO_RE.test(segment) ||
        CD_OR_MKDIR_RE.test(segment);

      if (!isBootstrapSegment) {
        return false;
      }

      if (
        SCAFFOLD_RE.test(segment) ||
        INSTALL_COMMAND_RE.test(segment) ||
        START_COMMAND_RE.test(segment) ||
        BOOTSTRAP_ECHO_RE.test(segment)
      ) {
        foundBootstrapSignal = true;
      }
    }
  }

  return foundBootstrapSignal;
}

function extractProjectFilesFromSnapshot(filesSnapshot?: FileMap): ExtractedFileAction[] {
  if (!filesSnapshot) {
    return [];
  }

  return Object.entries(filesSnapshot)
    .filter(([path, dirent]) => dirent?.type === 'file' && !dirent.isBinary && isProjectOwnedPath(path))
    .map(([path, dirent]) => ({
      path,
      content: dirent && dirent.type === 'file' ? dirent.content || '' : '',
    }));
}

function mergeWorkspaceFiles(
  filesSnapshot: FileMap | undefined,
  fileActions: ExtractedFileAction[],
): ExtractedFileAction[] {
  const mergedFiles = new Map<string, ExtractedFileAction>();

  for (const fileAction of extractProjectFilesFromSnapshot(filesSnapshot)) {
    mergedFiles.set(normalizeFilePath(fileAction.path), fileAction);
  }

  for (const fileAction of fileActions) {
    const preferredPath = resolveWorkspacePreferredPath(fileAction.path, filesSnapshot);

    mergedFiles.set(normalizeFilePath(preferredPath), {
      ...fileAction,
      path: preferredPath,
    });
  }

  return Array.from(mergedFiles.values());
}

function isFullProjectInstallSegment(segment: string, fileActions: ExtractedFileAction[]): boolean {
  const normalizedSegment = segment.trim();

  if (
    /^npx\s+update-browserslist-db@latest\b/i.test(normalizedSegment) ||
    /^corepack\s+enable\b/i.test(normalizedSegment)
  ) {
    return true;
  }

  if (!INSTALL_COMMAND_RE.test(normalizedSegment)) {
    return false;
  }

  const hasPackageJson = extractPackageJsonContent(fileActions) !== undefined;
  const packageScriptNames = extractPackageScriptNames(fileActions);

  if (!hasPackageJson || packageScriptNames.size === 0) {
    return true;
  }

  return /^(npm|pnpm|yarn|bun)\s+(install|i)(?:\s+--?[a-z0-9-]+(?:=(?:"[^"]*"|'[^']*'|[^\s]+))?)*\s*$/i.test(
    normalizedSegment,
  );
}

function extractSetupCommandFromShellCommandsUsingFiles(
  commands: string[],
  fileActions: ExtractedFileAction[],
): string | undefined {
  for (const command of commands) {
    const setupSegments = splitCommandSegments(command).filter((segment) =>
      isFullProjectInstallSegment(segment, fileActions),
    );

    if (setupSegments.length > 0) {
      return setupSegments.join(' && ');
    }
  }

  return undefined;
}

export async function synthesizeRunHandoff(options: {
  assistantContent: string;
  currentFiles?: FileMap;
}): Promise<SynthesizedRunHandoff | null> {
  const { assistantContent, currentFiles } = options;

  const shellCommands = extractShellCommands(assistantContent);
  const fileActions = extractFileActions(assistantContent);
  const mergedFiles = mergeWorkspaceFiles(currentFiles, fileActions);
  const fileActionPaths = fileActions.map((file) => file.path);
  const hasNewImplementationFileAction = hasImplementationFileAction(fileActionPaths);

  if (!hasNewImplementationFileAction || !hasConcreteImplementationFile(fileActions)) {
    return null;
  }

  if (!hasConcreteImplementationFile(mergedFiles)) {
    return null;
  }

  if (hasStarterPlaceholderInFiles(mergedFiles)) {
    return null;
  }

  if (!hasConcretePrimaryEntryFile(mergedFiles)) {
    return null;
  }

  const projectPackageManager = detectPackageManagerForFiles(mergedFiles);
  const rawExplicitStartCommand = extractRunnableStartCommand(assistantContent);
  const rawExplicitSetupCommand = extractSetupCommandFromShellCommandsUsingFiles(shellCommands, mergedFiles);
  const explicitStartCommand =
    projectPackageManager === 'npm'
      ? rawExplicitStartCommand
      : alignCommandToProjectPackageManager(rawExplicitStartCommand, mergedFiles);
  const explicitSetupCommand =
    projectPackageManager === 'npm'
      ? rawExplicitSetupCommand
      : alignCommandToProjectPackageManager(rawExplicitSetupCommand, mergedFiles);
  const inferredCommands = await detectProjectCommands(mergedFiles);
  const packageScriptNames = extractPackageScriptNames(mergedFiles);
  const explicitScriptName = explicitStartCommand
    ? extractPackageScriptNameFromCommand(explicitStartCommand)
    : undefined;
  const explicitScriptExists = explicitScriptName ? packageScriptNames.has(explicitScriptName) : true;
  const explicitStartPackageManager = extractLeadingPackageManager(explicitStartCommand);
  const explicitSetupPackageManager = extractLeadingPackageManager(explicitSetupCommand);
  const explicitStartMatchesProject =
    !explicitStartPackageManager ||
    projectPackageManager === 'npm' ||
    explicitStartPackageManager === projectPackageManager;
  const explicitSetupMatchesProject =
    !explicitSetupPackageManager ||
    projectPackageManager === 'npm' ||
    explicitSetupPackageManager === projectPackageManager;
  const shouldUseExplicitStartCommand = explicitStartCommand && explicitScriptExists && explicitStartMatchesProject;

  if (shouldUseExplicitStartCommand) {
    const setupCommandForExplicitStart =
      explicitSetupCommand && explicitSetupMatchesProject ? explicitSetupCommand : inferredCommands.setupCommand;
    const actionBlocks = [
      setupCommandForExplicitStart ? `<boltAction type="shell">${setupCommandForExplicitStart}</boltAction>` : null,
      `<boltAction type="start">${explicitStartCommand}</boltAction>`,
    ]
      .filter(Boolean)
      .join('\n');

    return {
      reason: 'inferred-project-commands',
      setupCommand: setupCommandForExplicitStart,
      startCommand: explicitStartCommand,
      followupMessage:
        'The generated project already includes runtime commands. I am replaying them through the workspace runner so preview can start now.',
      assistantContent: `The generated project already includes runtime commands. I am replaying them through the workspace runner so preview can start now.

<boltArtifact id="runtime-handoff" title="Runtime Handoff">
${actionBlocks}
</boltArtifact>`,
    };
  }

  const commands = inferredCommands;

  if (!commands.startCommand) {
    return null;
  }

  const setupCommand = commands.setupCommand;
  const actionBlocks = [
    setupCommand ? `<boltAction type="shell">${setupCommand}</boltAction>` : null,
    `<boltAction type="start">${commands.startCommand}</boltAction>`,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    reason: 'inferred-project-commands',
    setupCommand,
    startCommand: commands.startCommand,
    followupMessage:
      'I inferred the missing runtime commands from the generated project files and I am launching the preview now.',
    assistantContent: `I inferred the missing runtime commands from the generated project files and I am launching the preview now.

<boltArtifact id="runtime-handoff" title="Runtime Handoff">
${actionBlocks}
</boltArtifact>`,
  };
}

export function analyzeRunContinuation(options: RunContinuationOptions): RunContinuationDecision {
  const { chatMode, lastUserContent, assistantContent, alreadyAttempted } = options;

  if (alreadyAttempted) {
    return {
      shouldContinue: false,
      reason: 'already-attempted',
    };
  }

  if (chatMode !== 'build') {
    return {
      shouldContinue: false,
      reason: 'chat-mode-discuss',
    };
  }

  const runIntentDetected = RUN_INTENT_RE.test(lastUserContent);
  const buildIntentDetected = BUILD_INTENT_RE.test(lastUserContent);
  const starterBootstrapDetected = STARTER_BOOTSTRAP_RE.test(assistantContent);

  if (!runIntentDetected && !buildIntentDetected && !starterBootstrapDetected) {
    return {
      shouldContinue: false,
      reason: 'no-run-or-build-intent',
    };
  }

  const hasRunnableStartAction = Boolean(extractRunnableStartCommand(assistantContent));
  const shellCommands = extractShellCommands(assistantContent);
  const filePaths = extractFilePaths(assistantContent);
  const fileActions = extractFileActions(assistantContent);
  const mergedFiles = mergeWorkspaceFiles(options.currentFiles, fileActions);
  const starterEntryFiles = findStarterEntryFiles(options.currentFiles);
  const starterEntryFilePath = starterEntryFiles[0];
  const hasAnyBoltAction = BOLT_ACTION_RE.test(assistantContent);
  const hasFileAction = FILE_ACTION_RE.test(assistantContent);
  const hasImplementationFile = hasImplementationFileAction(filePaths);
  const hasConcreteImplementationAction = hasConcreteImplementationFile(fileActions);
  const hasConcretePrimaryEntry = hasConcretePrimaryEntryFile(mergedFiles);
  const touchedStarterEntry = touchesStarterEntryFile(filePaths, starterEntryFiles, options.currentFiles);
  const replacedStarterEntry = replacesStarterEntryFile(fileActions, starterEntryFiles, options.currentFiles);
  const mentionsScaffold = SCAFFOLD_RE.test(assistantContent);
  const starterPlaceholderDetected = STARTER_PLACEHOLDER_RE.test(assistantContent);
  const onlyInspectionCommands = hasOnlyInspectionCommands(shellCommands);
  const onlyBootstrapCommands = hasOnlyBootstrapShellCommands(shellCommands);

  if (!hasAnyBoltAction) {
    return {
      shouldContinue: true,
      reason: 'no-bolt-actions',
    };
  }

  if (onlyInspectionCommands) {
    return {
      shouldContinue: true,
      reason: 'inspection-only-shell-actions',
      starterEntryFilePath,
    };
  }

  if (starterEntryFilePath && !replacedStarterEntry) {
    return {
      shouldContinue: true,
      reason: touchedStarterEntry ? 'starter-without-implementation' : 'starter-entry-unchanged',
      starterEntryFilePath,
    };
  }

  if (buildIntentDetected && onlyBootstrapCommands && !hasConcreteImplementationAction) {
    return {
      shouldContinue: true,
      reason: 'bootstrap-only-shell-actions',
      starterEntryFilePath,
    };
  }

  if ((mentionsScaffold || starterBootstrapDetected) && !hasRunnableStartAction && !hasImplementationFile) {
    return {
      shouldContinue: true,
      reason: 'scaffold-without-start',
      starterEntryFilePath,
    };
  }

  if (runIntentDetected && !hasRunnableStartAction) {
    return {
      shouldContinue: true,
      reason: 'run-intent-without-start',
      starterEntryFilePath,
    };
  }

  if (buildIntentDetected && hasImplementationFile && !hasRunnableStartAction) {
    return {
      shouldContinue: true,
      reason: 'run-intent-without-start',
      starterEntryFilePath,
    };
  }

  if (
    buildIntentDetected &&
    (mentionsScaffold || starterBootstrapDetected || starterPlaceholderDetected) &&
    (!hasFileAction || !hasImplementationFile)
  ) {
    return {
      shouldContinue: true,
      reason: 'starter-without-implementation',
      starterEntryFilePath,
    };
  }

  if (buildIntentDetected && onlyBootstrapCommands && !hasImplementationFile) {
    return {
      shouldContinue: true,
      reason: 'bootstrap-only-shell-actions',
      starterEntryFilePath,
    };
  }

  if (buildIntentDetected && hasImplementationFile && !hasConcretePrimaryEntry) {
    return {
      shouldContinue: true,
      reason: 'starter-without-implementation',
      starterEntryFilePath,
    };
  }

  if (starterPlaceholderDetected) {
    return {
      shouldContinue: true,
      reason: 'starter-without-implementation',
      starterEntryFilePath,
    };
  }

  return {
    shouldContinue: false,
    reason: 'continuation-not-required',
  };
}

export function shouldForceRunContinuation(options: RunContinuationOptions): boolean {
  return analyzeRunContinuation(options).shouldContinue;
}
