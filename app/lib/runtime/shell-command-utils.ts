export type ShellCommandRewrite = {
  shouldModify: boolean;
  modifiedCommand?: string;
  warning?: string;
};

const NPM_CREATE_VITE_RE = /\bnpm\s+create\s+vite(?<ver>@[^\s]+)?\b/i;
const CREATE_VITE_HINT_RE = /\bcreate-vite\b/i;
const HAS_NO_INTERACTIVE_RE = /\B--no-interactive\b/;
const TEST_FILE_CHECK_RE = /^test\s+-f\s+(.+)$/i;
const INSTALL_SEGMENT_RE = /^(npm|pnpm|yarn|bun)\s+(install|i)\b/i;
const CD_SEGMENT_RE = /^cd\s+([^\s;&]+)\s*$/i;
const MKDIR_P_SEGMENT_RE = /^mkdir\s+-p\s+([^\s;&]+)\s*$/i;

export function unwrapCommandJsonEnvelope(command: string): ShellCommandRewrite {
  const trimmed = command.trim();

  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return { shouldModify: false };
  }

  try {
    const parsed = JSON.parse(trimmed) as { command?: unknown };

    if (typeof parsed.command === 'string' && parsed.command.trim().length > 0) {
      return {
        shouldModify: true,
        modifiedCommand: parsed.command.trim(),
        warning: 'Unwrapped JSON command envelope before shell execution.',
      };
    }
  } catch {
    // Not valid JSON; keep command as-is.
  }

  return { shouldModify: false };
}

export function decodeHtmlCommandDelimiters(command: string): ShellCommandRewrite {
  const normalized = command.replace(/&amp;&amp;/g, '&&');

  if (normalized === command) {
    return { shouldModify: false };
  }

  return {
    shouldModify: true,
    modifiedCommand: normalized,
    warning: 'Normalized HTML-escaped command separators for shell compatibility.',
  };
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
  const delimiterNormalization = decodeHtmlCommandDelimiters(command);
  const normalizedCommand = delimiterNormalization.modifiedCommand || command;
  const trimmed = normalizedCommand.trim();

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
  const delimiterNormalization = decodeHtmlCommandDelimiters(command);
  const normalizedCommand = delimiterNormalization.modifiedCommand || command;
  const trimmed = normalizedCommand.trim();

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

function hasInstallSegment(segment: string): boolean {
  return INSTALL_SEGMENT_RE.test(segment.trim());
}

function isProjectManifestSegment(segment: string): boolean {
  return /\bpackage\.json\b/i.test(segment.trim());
}

function hasScaffoldHint(segments: string[], cdTarget: string): boolean {
  const normalizedTarget = cdTarget.trim();

  return segments.some((segment) => {
    const trimmed = segment.trim();
    const mkdirMatch = trimmed.match(MKDIR_P_SEGMENT_RE);

    if (mkdirMatch?.[1] === normalizedTarget) {
      return true;
    }

    return /\bcreate-vite\b|\bcreate-react-app\b|\bnpm\s+create\b|\bpnpm\s+create\b|\bnpx\s+create\b/i.test(trimmed);
  });
}

/**
 * Guard against common scaffolding failures where commands that assume a project manifest
 * (`package.json`) are run before changing into the generated project directory.
 *
 * Example bad chains:
 *   mkdir -p mini-react-e2e && npm install && cd mini-react-e2e && npm install
 *   mkdir -p mini-react-e2e && cat package.json && cd mini-react-e2e && cat package.json
 *
 * Rewritten to:
 *   mkdir -p mini-react-e2e && cd mini-react-e2e && npm install
 *   mkdir -p mini-react-e2e && cd mini-react-e2e && cat package.json
 */
export function makeInstallCommandsProjectAware(command: string): ShellCommandRewrite {
  const delimiterNormalization = decodeHtmlCommandDelimiters(command);
  const normalizedCommand = delimiterNormalization.modifiedCommand || command;
  const trimmed = normalizedCommand.trim();

  if (!trimmed) {
    return { shouldModify: false };
  }

  const parts = trimmed.split(/\s*&&\s*/).map((part) => part.trim());
  const cdIndex = parts.findIndex((part) => CD_SEGMENT_RE.test(part));

  if (cdIndex <= 0) {
    return { shouldModify: false };
  }

  const cdMatch = parts[cdIndex].match(CD_SEGMENT_RE);
  const cdTarget = cdMatch?.[1]?.trim();

  if (!cdTarget || cdTarget === '.') {
    return { shouldModify: false };
  }

  const beforeCd = parts.slice(0, cdIndex);
  const afterCd = parts.slice(cdIndex + 1);
  const isProjectScopedSegment = (segment: string) => hasInstallSegment(segment) || isProjectManifestSegment(segment);
  const hasProjectScopedBeforeCd = beforeCd.some(isProjectScopedSegment);

  if (!hasProjectScopedBeforeCd) {
    return { shouldModify: false };
  }

  if (!hasScaffoldHint(beforeCd, cdTarget)) {
    return { shouldModify: false };
  }

  const filteredBefore = beforeCd.filter((segment) => !isProjectScopedSegment(segment));
  const movedProjectScopedSegments = beforeCd.filter((segment) => isProjectScopedSegment(segment));
  const hasProjectScopedAfterCd = afterCd.some((segment) => isProjectScopedSegment(segment));
  const rewrittenParts = hasProjectScopedAfterCd
    ? [...filteredBefore, parts[cdIndex], ...afterCd]
    : [...filteredBefore, parts[cdIndex], ...movedProjectScopedSegments, ...afterCd];

  const rewrittenCommand = rewrittenParts.join(' && ');
  const originalCommand = parts.join(' && ');

  if (rewrittenCommand === originalCommand) {
    return { shouldModify: false };
  }

  return {
    shouldModify: true,
    modifiedCommand: rewrittenCommand,
    warning: `Removed project-manifest commands before "cd ${cdTarget}" so project commands run in the scaffolded directory.`,
  };
}
