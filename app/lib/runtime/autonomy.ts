import type { BoltAction } from '~/types/actions';

export type AutonomyMode = 'read-only' | 'review-required' | 'auto-apply-safe' | 'full-auto';

export const DEFAULT_AUTONOMY_MODE: AutonomyMode = 'auto-apply-safe';
export const AUTONOMY_MODE_STORAGE_KEY = 'bolt_autonomy_mode_v1';

const TOOL_MUTATION_HINTS = /(write|delete|update|create|deploy|exec|run|command|mutation|insert|drop)/i;
const TOOL_READ_HINTS = /(search|browse|read|get|list|fetch|inspect|query|status|find|lookup)/i;

const SHELL_MUTATING_TOKENS = /[;&|]/;
const READ_ONLY_SHELL_PREFIXES = [
  /^ls(\s|$)/i,
  /^pwd(\s|$)/i,
  /^cat(\s|$)/i,
  /^grep(\s|$)/i,
  /^rg(\s|$)/i,
  /^find(\s|$)/i,
  /^which(\s|$)/i,
  /^echo(\s|$)/i,
  /^git\s+(status|diff|log)(\s|$)/i,
  /^pnpm\s+(test|run\s+test|run\s+lint)(\s|$)/i,
  /^npm\s+run\s+(test|lint)(\s|$)/i,
];
const SAFE_AUTO_SHELL_PREFIXES = [
  ...READ_ONLY_SHELL_PREFIXES,
  /^(pnpm|npm)\s+(install|ci|add)(\s|$)/i,
  /^pnpm\s+dlx\s+create-vite(?:@[^\s]+)?(\s|$)/i,
  /^npm\s+create\s+vite(?:@[^\s]+)?(\s|$)/i,
  /^npx\s+--yes\s+create-[a-z0-9@/_\-.]+(\s|$)/i,
  /^npx\s+--yes\s+sv\s+create(\s|$)/i,
  /^npx\s+--yes\s+@angular\/cli(?:@[^\s]+)?\s+new(\s|$)/i,
  /^npm\s+pkg\s+set(\s|$)/i,
  /^(pnpm|npm)\s+run\s+(dev|start|build|test|lint)(\s|$)/i,
];

function splitShellSegments(command: string): string[] {
  return command
    .split(/\s*&&\s*/g)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function stripShellRedirections(segment: string): string {
  // Treat redirection as neutral for safety classification.
  return segment
    .replace(/\s+\d?>&\d+/g, '')
    .replace(/\s+[<>]\s*[^&\s]+/g, '')
    .trim();
}

function isCommandChainSafe(segments: string[], allowPrefixes: RegExp[]): boolean {
  return segments.every((segment) => {
    const normalized = stripShellRedirections(segment);

    if (!normalized) {
      return false;
    }

    if (SHELL_MUTATING_TOKENS.test(normalized)) {
      return false;
    }

    return allowPrefixes.some((pattern) => pattern.test(normalized));
  });
}

export function getAutonomyModeLabel(mode: AutonomyMode): string {
  switch (mode) {
    case 'read-only':
      return 'Read-Only';
    case 'review-required':
      return 'Review';
    case 'auto-apply-safe':
      return 'Safe Auto';
    case 'full-auto':
      return 'Full Auto';
    default:
      return 'Safe Auto';
  }
}

export function isSafeToolCall(toolName: string): boolean {
  const normalized = toolName.trim();

  if (!normalized) {
    return false;
  }

  if (TOOL_MUTATION_HINTS.test(normalized)) {
    return false;
  }

  return TOOL_READ_HINTS.test(normalized);
}

export function isReadOnlyShellCommand(command: string): boolean {
  const normalized = command.trim();

  if (!normalized) {
    return false;
  }

  if (/[;|]/.test(normalized)) {
    return false;
  }

  const segments = splitShellSegments(normalized);

  return isCommandChainSafe(segments, READ_ONLY_SHELL_PREFIXES);
}

export function isSafeAutoShellCommand(command: string): boolean {
  const normalized = command.trim();

  if (!normalized) {
    return false;
  }

  if (/[;|]/.test(normalized)) {
    return false;
  }

  const segments = splitShellSegments(normalized);

  return isCommandChainSafe(segments, SAFE_AUTO_SHELL_PREFIXES);
}

export function isActionAutoAllowed(action: BoltAction, mode: AutonomyMode): boolean {
  if (mode === 'full-auto') {
    return true;
  }

  if (mode === 'review-required') {
    return false;
  }

  if (mode === 'auto-apply-safe') {
    if (action.type === 'file') {
      return true;
    }

    if (action.type === 'shell' || action.type === 'start') {
      return isSafeAutoShellCommand(action.content);
    }

    return false;
  }

  // read-only
  if (action.type === 'shell') {
    return isReadOnlyShellCommand(action.content);
  }

  return false;
}

export function getNextAutonomyMode(mode: AutonomyMode): AutonomyMode {
  switch (mode) {
    case 'read-only':
      return 'review-required';
    case 'review-required':
      return 'auto-apply-safe';
    case 'auto-apply-safe':
      return 'full-auto';
    case 'full-auto':
      return 'read-only';
    default:
      return 'auto-apply-safe';
  }
}

export function getToolAutonomyResolution(mode: AutonomyMode, toolName: string): 'approve' | 'reject' | 'manual' {
  if (mode === 'full-auto') {
    return 'approve';
  }

  if (mode === 'review-required') {
    return 'manual';
  }

  if (mode === 'auto-apply-safe') {
    return isSafeToolCall(toolName) ? 'approve' : 'manual';
  }

  // read-only
  return isSafeToolCall(toolName) ? 'approve' : 'reject';
}
