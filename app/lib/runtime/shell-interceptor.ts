const REDIRECTION_OPERATOR_RE = /(^|[^\w<])(?:>>|>)(?![=&])/;
const ECHO_REDIRECTION_RE = /\becho\b[\s\S]*?(?:>>|>)/i;
const CAT_REDIRECTION_RE = /\bcat\b[\s\S]*?(?:>>|>)/i;
const SED_IN_PLACE_RE = /\bsed\b[^\n]*\s-i(?:\s|$)/i;

export function getBlockedShellMutationReason(command: string): string | null {
  const normalized = command.trim();

  if (!normalized) {
    return null;
  }

  if (REDIRECTION_OPERATOR_RE.test(normalized)) {
    return 'Shell redirection operators (`>` / `>>`) are blocked. Use a file action for writes so changes stay atomic.';
  }

  if (ECHO_REDIRECTION_RE.test(normalized) || CAT_REDIRECTION_RE.test(normalized) || SED_IN_PLACE_RE.test(normalized)) {
    return 'Shell-based file mutation (`echo`, `cat >`, `sed -i`) is blocked. Use a file action instead.';
  }

  return null;
}

export function shouldRunZombieCleanup(command: string) {
  return /\b(?:pnpm|npm|yarn|bun)\s+(?:install|i|run\s+dev|run\s+start|run\s+build|dev|start|build)\b/i.test(
    command,
  );
}
