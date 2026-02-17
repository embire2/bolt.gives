export type ShellCommandRewrite = {
  shouldModify: boolean;
  modifiedCommand?: string;
  warning?: string;
};

const NPM_CREATE_VITE_RE = /\bnpm\s+create\s+vite(?<ver>@[^\s]+)?\b/i;
const CREATE_VITE_HINT_RE = /\bcreate-vite\b/i;
const HAS_NO_INTERACTIVE_RE = /\B--no-interactive\b/;
const HAS_CI_RE = /\bCI=\S+/;
const LEADING_ENV_ASSIGNMENTS_RE = /^((?:[A-Za-z_][A-Za-z0-9_]*=[^\s]+\s+)+)(.+)$/;

function normalizeLeadingEnvAssignments(segment: string): { segment: string; modified: boolean } {
  const trimmed = segment.trim();

  if (!trimmed) {
    return { segment, modified: false };
  }

  /*
   * WebContainer's /bin/jsh does not reliably support POSIX `KEY=value cmd` syntax.
   * Normalizing to `env KEY=value cmd` keeps behavior consistent.
   */
  if (/^env\s+/i.test(trimmed)) {
    return { segment: trimmed, modified: false };
  }

  const match = trimmed.match(LEADING_ENV_ASSIGNMENTS_RE);

  if (!match) {
    return { segment: trimmed, modified: false };
  }

  const assignments = match[1].trim();
  const rest = match[2].trim();

  if (!rest) {
    return { segment: trimmed, modified: false };
  }

  return { segment: `env ${assignments} ${rest}`, modified: true };
}

function ensureCiEnvVar(segment: string): { segment: string; modified: boolean } {
  const trimmed = segment.trim();

  if (!trimmed) {
    return { segment, modified: false };
  }

  if (HAS_CI_RE.test(trimmed)) {
    return { segment: trimmed, modified: false };
  }

  if (/^env\s+/i.test(trimmed)) {
    return { segment: trimmed.replace(/^env\s+/i, 'env CI=1 '), modified: true };
  }

  return { segment: `env CI=1 ${trimmed}`, modified: true };
}

function rewriteCreateViteSegment(segment: string): {
  segment: string;
  modified: boolean;
  usedPnpmDlx: boolean;
} {
  let s = segment.trim();
  let modified = false;
  let usedPnpmDlx = false;

  if (!s) {
    return { segment, modified: false, usedPnpmDlx: false };
  }

  const envNormalized = normalizeLeadingEnvAssignments(s);
  s = envNormalized.segment;
  modified ||= envNormalized.modified;

  const npmCreate = s.match(NPM_CREATE_VITE_RE);

  if (npmCreate) {
    const ver = npmCreate.groups?.ver || '';

    // npm's "create vite@..." invokes the "create-vite" package.
    s = s.replace(NPM_CREATE_VITE_RE, `pnpm dlx create-vite${ver}`);

    /*
     * npm create passes args to the initializer after a standalone `--`.
     * For create-vite direct invocation, remove the separator:
     *   "... . -- --template react" -> "... . --template react"
     */
    s = s.replace(/\s--\s(?=--)/g, ' ');

    modified = true;
    usedPnpmDlx = true;
  }

  const isCreateVite = usedPnpmDlx || CREATE_VITE_HINT_RE.test(s);

  if (!isCreateVite) {
    return { segment: s, modified, usedPnpmDlx };
  }

  // Ensure non-interactive scaffolding. Interactive CLIs frequently cancel in WebContainer.
  if (!HAS_NO_INTERACTIVE_RE.test(s)) {
    s = `${s} --no-interactive`;
    modified = true;
  }

  // CI=1 nudges many CLIs to avoid prompts. Use `env` so /bin/jsh can execute it reliably.
  const ciEnsured = ensureCiEnvVar(s);
  s = ciEnsured.segment;
  modified ||= ciEnsured.modified;

  return { segment: s, modified, usedPnpmDlx };
}

function rewriteNpmInstallSegment(segment: string): { segment: string; modified: boolean } {
  const trimmed = segment.trim();

  if (!trimmed) {
    return { segment, modified: false };
  }

  if (/^npm\s+(install|i)(\s|$)/i.test(trimmed)) {
    return { segment: trimmed.replace(/^npm\s+(install|i)\b/i, 'pnpm install'), modified: true };
  }

  return { segment, modified: false };
}

/**
 * Make create-vite scaffolding non-interactive and compatible with WebContainer execution.
 *
 * Common LLM output:
 *   npm create vite@latest . -- --template react && npm install
 *
 * This is interactive and typically fails in Bolt's command runner. We rewrite to:
 *   CI=1 pnpm dlx create-vite@latest . --template react --no-interactive && pnpm install
 */
export function makeCreateViteNonInteractive(command: string): ShellCommandRewrite {
  const trimmed = command.trim();

  if (!trimmed) {
    return { shouldModify: false };
  }

  // Split simple command chains so we don't append flags to the wrong command (e.g. after `&& npm install`).
  const parts = trimmed.split(/\s*&&\s*/);
  let modifiedAny = false;
  let usedPnpmDlxAny = false;

  const rewrittenParts = parts.map((part) => {
    const rewritten = rewriteCreateViteSegment(part);

    if (rewritten.modified) {
      modifiedAny = true;
    }

    if (rewritten.usedPnpmDlx) {
      usedPnpmDlxAny = true;
    }

    return rewritten.segment;
  });

  // If we rewrote scaffolding to pnpm dlx, also rewrite npm install to pnpm install to avoid npm prompts.
  if (usedPnpmDlxAny) {
    for (let i = 0; i < rewrittenParts.length; i++) {
      const rewritten = rewriteNpmInstallSegment(rewrittenParts[i]);

      if (rewritten.modified) {
        rewrittenParts[i] = rewritten.segment;
        modifiedAny = true;
      }
    }
  }

  if (!modifiedAny) {
    return { shouldModify: false };
  }

  return {
    shouldModify: true,
    modifiedCommand: rewrittenParts.join(' && '),
    warning: 'Made create-vite scaffolding non-interactive to avoid CLI prompts in WebContainer.',
  };
}
