export interface RunContinuationOptions {
  chatMode: 'build' | 'discuss';
  lastUserContent: string;
  assistantContent: string;
  alreadyAttempted: boolean;
}

const RUN_INTENT_RE =
  /\b(run|start|preview|launch|serve)\b|dev server|localhost|0\.0\.0\.0|--host|--port|vite\s+\+\s+react/i;
const SCAFFOLD_RE = /create-vite|npm\s+create\s+vite|pnpm\s+dlx\s+create-vite|create-react-app|scaffold/i;
const START_ACTION_RE = /<boltAction[^>]*type="start"/i;
const BOLT_ACTION_RE = /<boltAction\b/i;
const SHELL_ACTION_RE = /<boltAction[^>]*type="shell"[^>]*>([\s\S]*?)<\/boltAction>/gi;

const INSPECTION_COMMAND_RE =
  /^\s*(ls(\s|$)|pwd(\s|$)|echo(\s|$)|cat(\s|$)|find(\s|$)|tree(\s|$)|whoami(\s|$)|env(\s|$)|printenv(\s|$)|cd(\s|$))/i;

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

function hasOnlyInspectionCommands(commands: string[]): boolean {
  return commands.length > 0 && commands.every((command) => INSPECTION_COMMAND_RE.test(command));
}

export function shouldForceRunContinuation(options: RunContinuationOptions): boolean {
  const { chatMode, lastUserContent, assistantContent, alreadyAttempted } = options;

  if (alreadyAttempted || chatMode !== 'build') {
    return false;
  }

  if (!RUN_INTENT_RE.test(lastUserContent)) {
    return false;
  }

  if (START_ACTION_RE.test(assistantContent)) {
    return false;
  }

  const shellCommands = extractShellCommands(assistantContent);
  const hasAnyBoltAction = BOLT_ACTION_RE.test(assistantContent);
  const mentionsScaffold = SCAFFOLD_RE.test(assistantContent);

  /*
   * Run/preview was requested, but there is still no explicit start action.
   * Continue automatically when output is scaffold-only, action-free, or only inspection commands.
   */
  if (mentionsScaffold) {
    return true;
  }

  if (!hasAnyBoltAction) {
    return true;
  }

  if (hasOnlyInspectionCommands(shellCommands)) {
    return true;
  }

  return false;
}
