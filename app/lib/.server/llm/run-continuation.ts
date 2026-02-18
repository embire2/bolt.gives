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

export function shouldForceRunContinuation(options: RunContinuationOptions): boolean {
  const { chatMode, lastUserContent, assistantContent, alreadyAttempted } = options;

  if (alreadyAttempted || chatMode !== 'build') {
    return false;
  }

  if (!RUN_INTENT_RE.test(lastUserContent)) {
    return false;
  }

  if (!SCAFFOLD_RE.test(assistantContent)) {
    return false;
  }

  if (START_ACTION_RE.test(assistantContent)) {
    return false;
  }

  return true;
}
