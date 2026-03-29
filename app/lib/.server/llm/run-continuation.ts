export interface RunContinuationOptions {
  chatMode: 'build' | 'discuss';
  lastUserContent: string;
  assistantContent: string;
  alreadyAttempted: boolean;
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
    | 'bootstrap-only-shell-actions'
    | 'continuation-not-required';
}

const RUN_INTENT_RE =
  /\b(run|start|preview|launch|serve)\b|dev server|localhost|0\.0\.0\.0|--host|--port|vite\s+\+\s+react/i;
const BUILD_INTENT_RE =
  /\b(create|build|implement|develop|ship|finish)\b.*\b(app|website|dashboard|scheduler|portal|project)\b|\bappointment\b|\bcalendar\b/i;
const SCAFFOLD_RE = /create-vite|npm\s+create\s+vite|pnpm\s+dlx\s+create-vite|create-react-app|scaffold/i;
const STARTER_BOOTSTRAP_RE =
  /Bolt is initializing your project|template import is done|built-in .*starter fallback|fallback starter/i;
const STARTER_PLACEHOLDER_RE = /Your fallback starter is ready\./i;
const START_ACTION_RE = /<boltAction[^>]*type="start"/i;
const BOLT_ACTION_RE = /<boltAction\b/i;
const FILE_ACTION_RE = /<boltAction[^>]*type="file"/i;
const FILE_PATH_RE = /<boltAction[^>]*type="file"[^>]*filePath=(["'])([^"']+)\1[^>]*>/gi;
const SHELL_ACTION_RE = /<boltAction[^>]*type="shell"[^>]*>([\s\S]*?)<\/boltAction>/gi;

const INSPECTION_COMMAND_RE =
  /^\s*(ls(\s|$)|pwd(\s|$)|echo(\s|$)|cat(\s|$)|find(\s|$)|tree(\s|$)|whoami(\s|$)|env(\s|$)|printenv(\s|$)|cd(\s|$))/i;
const INSTALL_COMMAND_RE = /^(npm|pnpm|yarn|bun)\s+(install|i)\b/i;
const START_COMMAND_RE = /^(npm|pnpm|yarn|bun)\s+(run\s+)?(dev|start|preview)\b|^vite\s+--host\b/i;
const BOOTSTRAP_ECHO_RE = /^echo\s+["']?Using built-in .*starter files["']?$/i;
const CD_OR_MKDIR_RE = /^(cd|mkdir\s+-p)\b/i;
const NON_IMPLEMENTATION_FILE_RE =
  /(^|\/)(readme(\.[a-z0-9]+)?|changelog(\.[a-z0-9]+)?|package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb|tsconfig(\.[a-z0-9-]+)?\.json|vite\.config\.[a-z0-9]+|eslint\.config\.[a-z0-9]+|prettier\.config\.[a-z0-9]+|postcss\.config\.[a-z0-9]+|tailwind\.config\.[a-z0-9]+|index\.html|\.gitignore|\.npmrc|\.nvmrc|\.editorconfig|\.env(\.[a-z0-9-]+)?)$/i;

function splitCommandSegments(command: string): string[] {
  return command
    .split(/\s*(?:&&|;|\|\|)\s*/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function extractShellCommands(assistantContent: string): string[] {
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

function normalizeFilePath(filePath: string): string {
  return filePath
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .toLowerCase();
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

  const hasStartAction = START_ACTION_RE.test(assistantContent);
  const shellCommands = extractShellCommands(assistantContent);
  const filePaths = extractFilePaths(assistantContent);
  const hasAnyBoltAction = BOLT_ACTION_RE.test(assistantContent);
  const hasFileAction = FILE_ACTION_RE.test(assistantContent);
  const hasImplementationFile = hasImplementationFileAction(filePaths);
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
    };
  }

  if ((mentionsScaffold || starterBootstrapDetected) && !hasStartAction && !hasImplementationFile) {
    return {
      shouldContinue: true,
      reason: 'scaffold-without-start',
    };
  }

  if (runIntentDetected && !hasStartAction) {
    return {
      shouldContinue: true,
      reason: 'run-intent-without-start',
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
    };
  }

  if (buildIntentDetected && onlyBootstrapCommands && !hasImplementationFile) {
    return {
      shouldContinue: true,
      reason: 'bootstrap-only-shell-actions',
    };
  }

  if (starterPlaceholderDetected) {
    return {
      shouldContinue: true,
      reason: 'starter-without-implementation',
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
