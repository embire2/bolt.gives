export type ShellCommandRewrite = {
  shouldModify: boolean;
  modifiedCommand?: string;
  warning?: string;
};

const NPM_CREATE_VITE_RE = /\bnpm\s+create\s+vite(?<ver>@[^\s]+)?\b/i;
const CREATE_VITE_HINT_RE = /\bcreate-vite\b/i;
const HAS_NO_INTERACTIVE_RE = /\B--no-interactive\b/;
const TEST_FILE_CHECK_RE = /^test\s+-f\s+(.+)$/i;

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
 *   pnpm dlx create-vite@latest . --template react --no-interactive && pnpm install
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

function rewriteTestFileCheckSegment(segment: string): { segment: string; modified: boolean } {
  const trimmed = segment.trim();

  if (!trimmed) {
    return { segment, modified: false };
  }

  const testMatch = trimmed.match(TEST_FILE_CHECK_RE);

  if (!testMatch) {
    return { segment, modified: false };
  }

  const filePath = testMatch[1]?.trim();

  if (!filePath) {
    return { segment, modified: false };
  }

  // jsh used by WebContainer does not support POSIX `test`; use `ls` for file existence checks.
  return {
    segment: `ls ${filePath} >/dev/null 2>&1`,
    modified: true,
  };
}

export function makeFileChecksPortable(command: string): ShellCommandRewrite {
  const trimmed = command.trim();

  if (!trimmed) {
    return { shouldModify: false };
  }

  const parts = trimmed.split(/\s*&&\s*/);
  let modifiedAny = false;

  const rewrittenParts = parts.map((part) => {
    const rewritten = rewriteTestFileCheckSegment(part);

    if (rewritten.modified) {
      modifiedAny = true;
    }

    return rewritten.segment;
  });

  if (!modifiedAny) {
    return { shouldModify: false };
  }

  return {
    shouldModify: true,
    modifiedCommand: rewrittenParts.join(' && '),
    warning: 'Rewrote unsupported `test -f` checks to portable file checks for the terminal shell.',
  };
}
