const ECHO_REDIRECTION_RE = /\becho\b[\s\S]*?(?:>>|>)/i;
const CAT_REDIRECTION_RE = /\bcat\b[\s\S]*?(?:>>|>)/i;
const SED_IN_PLACE_RE = /\bsed\b[^\n]*\s-i(?:\s|$)/i;
const TEE_FILE_WRITE_RE = /(?:^|\s)tee(?:\s+-a)?\s+([^\s|;&]+)/i;
const REDIRECTION_TARGET_RE = /(^|[\s;|&])(\d*>>?)(?![=&])\s*([^\s;|&]+)/g;

function isSafeRedirectionTarget(rawTarget: string) {
  const target = rawTarget.trim();

  if (!target) {
    return false;
  }

  if (target === '&1' || target === '&2') {
    return true;
  }

  return target === '/dev/null';
}

function hasUnsafeRedirection(command: string) {
  for (const match of command.matchAll(REDIRECTION_TARGET_RE)) {
    const target = match[3] || '';

    if (!isSafeRedirectionTarget(target)) {
      return true;
    }
  }

  return false;
}

function hasUnsafeTeeWrite(command: string) {
  const match = command.match(TEE_FILE_WRITE_RE);

  if (!match) {
    return false;
  }

  return !isSafeRedirectionTarget(match[1] || '');
}

export function getBlockedShellMutationReason(command: string): string | null {
  const normalized = command.trim();

  if (!normalized) {
    return null;
  }

  if (hasUnsafeRedirection(normalized)) {
    return 'Shell redirection that writes to files is blocked. Use a file action for writes so changes stay atomic.';
  }

  if (hasUnsafeTeeWrite(normalized)) {
    return 'Shell-based file mutation via `tee` is blocked. Use a file action instead.';
  }

  if (ECHO_REDIRECTION_RE.test(normalized) || CAT_REDIRECTION_RE.test(normalized) || SED_IN_PLACE_RE.test(normalized)) {
    return 'Shell-based file mutation (`echo`, `cat >`, `sed -i`) is blocked. Use a file action instead.';
  }

  return null;
}

export function shouldRunZombieCleanup(command: string) {
  return /\b(?:pnpm|npm|yarn|bun)\s+(?:install|i|run\s+dev|run\s+start|run\s+build|dev|start|build)\b/i.test(command);
}
