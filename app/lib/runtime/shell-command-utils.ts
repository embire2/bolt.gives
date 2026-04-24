export type ShellCommandRewrite = {
  shouldModify: boolean;
  modifiedCommand?: string;
  warning?: string;
};

type CommandFileSnapshot = Record<
  string,
  | {
      type?: string;
      content?: string;
      isBinary?: boolean;
    }
  | undefined
>;

const NPM_CREATE_VITE_RE = /\bnpm\s+create\s+vite(?<ver>@[^\s]+)?\b/i;
const CREATE_VITE_HINT_RE = /\bcreate-vite\b/i;
const HAS_NO_INTERACTIVE_RE = /\B--no-interactive\b/;
const HAS_OVERWRITE_RE = /\B--overwrite\b/;
const CREATE_VITE_CURRENT_DIR_RE = /\bcreate-vite(?:@[^\s]+)?\b\s+(?:\.|\.\/)(?=\s|$)/i;
const TEST_FILE_CHECK_RE = /^test\s+-f\s+(.+)$/i;
const INSTALL_SEGMENT_RE = /^(npm|pnpm|yarn|bun)\s+(install|i)\b/i;
const CD_SEGMENT_RE = /^cd\s+([^\s;&]+)\s*$/i;
const MKDIR_P_SEGMENT_RE = /^mkdir\s+-p\s+([^\s;&]+)\s*$/i;
const PNPM_REPORTER_FLAG_RE = /--reporter(?:=|\s+)(append-only|silent)\b/i;
const PNPM_NO_FROZEN_LOCKFILE_RE = /--no-frozen-lockfile\b/i;
const NPM_LEGACY_PEER_DEPS_FLAG_RE = /(?:^|\s)--legacy-peer-deps\b/gi;
const NPM_PROGRESS_FLAG_RE = /--no-progress\b/i;
const NPM_SILENT_FLAG_RE = /--silent\b|--loglevel(?:=|\s+)silent\b/i;
const YARN_SILENT_FLAG_RE = /--silent\b/i;
const PROJECT_SCAFFOLD_SEGMENT_RE =
  /\b(create-vite|create-react-app|npm\s+create\s+vite|pnpm\s+dlx\s+create-vite|npx\s+create-react-app)\b/i;
const COMMAND_PREFIX_RE = /^\s*(?:run\s+shell\s+command\s*:|shell\s+command\s*:|command\s*:)\s*/i;
const BULLET_PREFIX_RE = /^\s*(?:[-*]\s+|\d+\.\s+)/;
const SHELL_FENCE_RE = /^```(?:bash|sh|shell|zsh)?\s*([\s\S]*?)\s*```$/i;
const PACKAGE_SCRIPT_START_RE = /^(npm|pnpm|yarn|bun)\s+(?:run\s+)?(dev|start|preview)\b/i;
const DIRECT_VITE_START_RE = /^vite(?:\s|$)/i;
const DIRECT_NEXT_START_RE = /^next\s+(dev|start)\b/i;
const DIRECT_ASTRO_START_RE = /^astro\s+(dev|preview)\b/i;
const DIRECT_ANGULAR_START_RE = /^ng\s+serve\b/i;
const HOST_FLAG_RE = /(?:^|\s)--host(?:name)?(?:\s|=)/i;
const PORT_FLAG_RE = /(?:^|\s)--port(?:\s|=)/i;
const TRAILING_BACKGROUND_RE = /\s*&\s*$/;

type PreviewFramework = 'vite' | 'next' | 'astro' | 'angular';

function normalizeCommandPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').toLowerCase();
}

function getProjectFileEntries(filesSnapshot?: CommandFileSnapshot): Array<{ path: string; content: string }> {
  if (!filesSnapshot) {
    return [];
  }

  return Object.entries(filesSnapshot)
    .filter(([filePath, entry]) => {
      if (!entry || entry.type !== 'file' || entry.isBinary) {
        return false;
      }

      return !/(^|\/)(node_modules|\.pnpm|\.vite|dist|build|coverage|\.next|out|\.turbo|\.cache)(\/|$)/i.test(filePath);
    })
    .map(([filePath, entry]) => ({
      path: filePath,
      content: entry?.content || '',
    }));
}

function getPreferredPackageJsonContent(filesSnapshot?: CommandFileSnapshot): string | undefined {
  return getProjectFileEntries(filesSnapshot)
    .filter((file) => normalizeCommandPath(file.path).endsWith('package.json'))
    .sort((left, right) => {
      const leftDepth = normalizeCommandPath(left.path).split('/').filter(Boolean).length;
      const rightDepth = normalizeCommandPath(right.path).split('/').filter(Boolean).length;

      if (leftDepth !== rightDepth) {
        return leftDepth - rightDepth;
      }

      return normalizeCommandPath(left.path).localeCompare(normalizeCommandPath(right.path));
    })[0]?.content;
}

function extractPackageScripts(packageJsonContent: string | undefined): Record<string, string> {
  if (!packageJsonContent) {
    return {};
  }

  try {
    const parsed = JSON.parse(packageJsonContent) as { scripts?: Record<string, unknown> };

    if (!parsed?.scripts || typeof parsed.scripts !== 'object') {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed.scripts)
        .filter(([, value]) => typeof value === 'string')
        .map(([key, value]) => [key, String(value)]),
    );
  } catch {
    const scripts: Record<string, string> = {};
    const scriptRegex = /"(dev|start|preview)"\s*:\s*"([^"]+)"/g;
    let match: RegExpExecArray | null;

    while ((match = scriptRegex.exec(packageJsonContent)) !== null) {
      const [, key, value] = match;
      scripts[key] = value;
    }

    return scripts;
  }
}

function inferFrameworkFromScript(scriptCommand: string | undefined): PreviewFramework | null {
  const normalized = scriptCommand?.trim().toLowerCase() || '';

  if (!normalized) {
    return null;
  }

  if (/\bvite\b/.test(normalized) && !/\bvitest\b/.test(normalized)) {
    return 'vite';
  }

  if (/\bnext\s+(dev|start)\b/.test(normalized)) {
    return 'next';
  }

  if (/\bastro\s+(dev|preview)\b/.test(normalized)) {
    return 'astro';
  }

  if (/\bng\s+serve\b/.test(normalized)) {
    return 'angular';
  }

  return null;
}

function inferFrameworkFromFiles(filesSnapshot?: CommandFileSnapshot): PreviewFramework | null {
  const paths = getProjectFileEntries(filesSnapshot).map((file) => normalizeCommandPath(file.path));

  if (
    paths.some((filePath) => /(^|\/)vite\.config\.(?:[cm]?[jt]sx?)$/i.test(filePath)) ||
    paths.some((filePath) => /(^|\/)src\/main\.(?:[jt]sx?)$/i.test(filePath))
  ) {
    return 'vite';
  }

  if (
    paths.some((filePath) => /(^|\/)next\.config\.(?:[cm]?[jt]s)$/i.test(filePath)) ||
    paths.some((filePath) => /(^|\/)(app\/page|pages\/index)\.(?:[jt]sx?)$/i.test(filePath))
  ) {
    return 'next';
  }

  if (
    paths.some((filePath) => /(^|\/)astro\.config\.(?:[cm]?[jt]s)$/i.test(filePath)) ||
    paths.some((filePath) => /(^|\/)src\/pages\/index\.astro$/i.test(filePath))
  ) {
    return 'astro';
  }

  if (paths.some((filePath) => /(^|\/)angular\.json$/i.test(filePath))) {
    return 'angular';
  }

  return null;
}

function inferFrameworkFromDirectCommand(command: string): PreviewFramework | null {
  if (DIRECT_VITE_START_RE.test(command)) {
    return 'vite';
  }

  if (DIRECT_NEXT_START_RE.test(command)) {
    return 'next';
  }

  if (DIRECT_ASTRO_START_RE.test(command)) {
    return 'astro';
  }

  if (DIRECT_ANGULAR_START_RE.test(command)) {
    return 'angular';
  }

  return null;
}

function getMissingPreviewArgs(command: string, framework: PreviewFramework): string[] {
  const args: string[] = [];

  if (!HOST_FLAG_RE.test(command)) {
    args.push(framework === 'next' ? '--hostname 0.0.0.0' : '--host 0.0.0.0');
  }

  if (!PORT_FLAG_RE.test(command)) {
    switch (framework) {
      case 'vite':
        args.push('--port 5173');
        break;
      case 'next':
        args.push('--port 3000');
        break;
      case 'astro':
        args.push('--port 4321');
        break;
      case 'angular':
        args.push('--port 4200');
        break;
    }
  }

  return args;
}

function removeUnsupportedPnpmInstallFlags(command: string): { command: string; modified: boolean } {
  const normalized = command
    .replace(NPM_LEGACY_PEER_DEPS_FLAG_RE, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return {
    command: normalized,
    modified: normalized !== command.trim(),
  };
}

function packageManagerNeedsRunArgSeparator(packageManager: string): boolean {
  return packageManager.toLowerCase() === 'npm';
}

function normalizePackageScriptPreviewArgSeparator(
  command: string,
  packageManager: string,
): { command: string; modified: boolean } {
  const trimmed = command.trim();

  if (packageManagerNeedsRunArgSeparator(packageManager)) {
    return { command: trimmed, modified: false };
  }

  const normalized = trimmed.replace(/\s+--\s+(?=--(?:host(?:name)?|port)\b)/i, ' ');

  return {
    command: normalized,
    modified: normalized !== trimmed,
  };
}

function appendPackageScriptArgs(command: string, args: string[], packageManager: string): string {
  if (args.length === 0) {
    return command.trim();
  }

  const trimmed = normalizePackageScriptPreviewArgSeparator(command, packageManager).command;

  if (!packageManagerNeedsRunArgSeparator(packageManager)) {
    return `${trimmed} ${args.join(' ')}`;
  }

  if (/\s--\s*$/.test(trimmed)) {
    return `${trimmed}${args.join(' ')}`;
  }

  if (/\s--\s/.test(trimmed)) {
    return `${trimmed} ${args.join(' ')}`;
  }

  return `${trimmed} -- ${args.join(' ')}`;
}

function appendDirectArgs(command: string, args: string[]): string {
  if (args.length === 0) {
    return command.trim();
  }

  return `${command.trim()} ${args.join(' ')}`;
}

function rewriteStartSegmentForForeground(segment: string): { segment: string; modified: boolean } {
  const trimmed = segment.trim();

  if (!trimmed || !TRAILING_BACKGROUND_RE.test(trimmed)) {
    return { segment, modified: false };
  }

  const foreground = trimmed.replace(TRAILING_BACKGROUND_RE, '').trim();

  if (!foreground || (!PACKAGE_SCRIPT_START_RE.test(foreground) && !inferFrameworkFromDirectCommand(foreground))) {
    return { segment, modified: false };
  }

  return {
    segment: foreground,
    modified: foreground !== trimmed,
  };
}

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

export function normalizeShellCommandSurface(command: string): ShellCommandRewrite {
  const trimmed = command.trim();

  if (!trimmed) {
    return { shouldModify: false };
  }

  let normalized = trimmed;
  let modified = false;

  const unwrapFence = normalized.match(SHELL_FENCE_RE);

  if (unwrapFence?.[1]) {
    normalized = unwrapFence[1].trim();
    modified = true;
  }

  const withoutPrefix = normalized.replace(COMMAND_PREFIX_RE, '');

  if (withoutPrefix !== normalized) {
    normalized = withoutPrefix.trim();
    modified = true;
  }

  const withoutBullet = normalized.replace(BULLET_PREFIX_RE, '');

  if (withoutBullet !== normalized) {
    normalized = withoutBullet.trim();
    modified = true;
  }

  if (!normalized || normalized === trimmed) {
    return { shouldModify: false };
  }

  return {
    shouldModify: modified,
    modifiedCommand: normalized,
    warning: 'Normalized shell command prefix/format before execution.',
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

  if (CREATE_VITE_CURRENT_DIR_RE.test(s) && !HAS_OVERWRITE_RE.test(s)) {
    s = `${s} --overwrite`;
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

function rewriteInstallSegmentForLowNoise(segment: string): { segment: string; modified: boolean } {
  const trimmed = segment.trim();

  if (!INSTALL_SEGMENT_RE.test(trimmed)) {
    return { segment, modified: false };
  }

  if (/^pnpm\s+/i.test(trimmed)) {
    const pnpmFlagsRewrite = removeUnsupportedPnpmInstallFlags(trimmed);
    let next = pnpmFlagsRewrite.command;
    let modified = pnpmFlagsRewrite.modified;

    if (!PNPM_REPORTER_FLAG_RE.test(next)) {
      next = `${next} --reporter=append-only`;
      modified = true;
    }

    if (!PNPM_NO_FROZEN_LOCKFILE_RE.test(next)) {
      next = `${next} --no-frozen-lockfile`;
      modified = true;
    }

    return { segment: next, modified };
  }

  if (/^npm\s+/i.test(trimmed)) {
    let next = trimmed;
    let modified = false;

    if (!NPM_PROGRESS_FLAG_RE.test(next)) {
      next = `${next} --no-progress`;
      modified = true;
    }

    if (!NPM_SILENT_FLAG_RE.test(next)) {
      next = `${next} --silent`;
      modified = true;
    }

    return { segment: next, modified };
  }

  if (/^yarn\s+/i.test(trimmed)) {
    if (YARN_SILENT_FLAG_RE.test(trimmed)) {
      return { segment: trimmed, modified: false };
    }

    return {
      segment: `${trimmed} --silent`,
      modified: true,
    };
  }

  return { segment: trimmed, modified: false };
}

export function makeInstallCommandsLowNoise(command: string): ShellCommandRewrite {
  const delimiterNormalization = decodeHtmlCommandDelimiters(command);
  const normalizedCommand = delimiterNormalization.modifiedCommand || command;
  const trimmed = normalizedCommand.trim();

  if (!trimmed) {
    return { shouldModify: false };
  }

  const parts = trimmed.split(/\s*&&\s*/);
  let modifiedAny = false;

  const rewrittenParts = parts.map((part) => {
    const rewritten = rewriteInstallSegmentForLowNoise(part);

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
    warning: 'Reduced install-command output verbosity to prevent UI stalls during dependency setup.',
  };
}

export function makeScaffoldCommandsProjectAware(
  command: string,
  options: { projectInitialized: boolean },
): ShellCommandRewrite {
  if (!options.projectInitialized) {
    return { shouldModify: false };
  }

  const delimiterNormalization = decodeHtmlCommandDelimiters(command);
  const normalizedCommand = delimiterNormalization.modifiedCommand || command;
  const trimmed = normalizedCommand.trim();

  if (!trimmed || !PROJECT_SCAFFOLD_SEGMENT_RE.test(trimmed)) {
    return { shouldModify: false };
  }

  const parts = trimmed.split(/\s*&&\s*/).map((part) => part.trim());
  const filteredParts = parts.filter((part) => !PROJECT_SCAFFOLD_SEGMENT_RE.test(part));

  if (filteredParts.length === parts.length) {
    return { shouldModify: false };
  }

  const rewritten = filteredParts.length
    ? filteredParts.join(' && ')
    : 'echo "Skipping scaffold command because project files already exist"';

  if (rewritten === trimmed) {
    return { shouldModify: false };
  }

  return {
    shouldModify: true,
    modifiedCommand: rewritten,
    warning: 'Skipped duplicate scaffolding command because the project is already initialized.',
  };
}

// ─── npm → pnpm Universal Rewriter ──────────────────────────────────────────

const NPM_RUN_RE = /^npm\s+run\s+/i;
const NPM_START_RE = /^npm\s+start\b/i;
const NPM_TEST_RE = /^npm\s+test\b/i;
const NPM_EXEC_RE = /^npm\s+exec\s+/i;
const NPM_INIT_RE = /^npm\s+init\s+/i;
const NPM_ADD_RE = /^npm\s+(add|install|i)\s+/i;
const NPX_RE = /^npx\s+/i;
const YARN_RE = /^yarn\s+/i;

function rewriteNpmSegmentToPnpm(segment: string): { segment: string; modified: boolean } {
  const trimmed = segment.trim();

  if (!trimmed) {
    return { segment, modified: false };
  }

  const stripKnownNpmOnlyFlags = (value: string) =>
    value
      .replace(/(?:^|\s)--no-progress\b/gi, ' ')
      .replace(/(?:^|\s)--silent\b/gi, ' ')
      .replace(/(?:^|\s)--loglevel(?:=|\s+)silent\b/gi, ' ')
      .replace(NPM_LEGACY_PEER_DEPS_FLAG_RE, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

  // npm run <script> → pnpm run <script>
  if (NPM_RUN_RE.test(trimmed)) {
    return { segment: trimmed.replace(/^npm\s+run\s+/i, 'pnpm run '), modified: true };
  }

  // npm start → pnpm start
  if (NPM_START_RE.test(trimmed)) {
    return { segment: trimmed.replace(/^npm\s+start\b/i, 'pnpm start'), modified: true };
  }

  // npm test → pnpm test
  if (NPM_TEST_RE.test(trimmed)) {
    return { segment: trimmed.replace(/^npm\s+test\b/i, 'pnpm test'), modified: true };
  }

  // npm exec <tool> → pnpm dlx <tool>
  if (NPM_EXEC_RE.test(trimmed)) {
    return { segment: trimmed.replace(/^npm\s+exec\s+/i, 'pnpm dlx '), modified: true };
  }

  // npm init <initializer> → pnpm create <initializer>
  if (NPM_INIT_RE.test(trimmed)) {
    return { segment: trimmed.replace(/^npm\s+init\s+/i, 'pnpm create '), modified: true };
  }

  if (NPM_ADD_RE.test(trimmed)) {
    const remainder = stripKnownNpmOnlyFlags(trimmed.replace(/^npm\s+(add|install|i)\b/i, '').trim());
    const hasPackageArgs = remainder
      .split(/\s+/)
      .filter(Boolean)
      .some((token) => !token.startsWith('-'));

    if (!hasPackageArgs) {
      return {
        segment: remainder ? `pnpm install ${remainder}` : 'pnpm install',
        modified: true,
      };
    }

    return {
      segment: remainder ? `pnpm add ${remainder}` : 'pnpm add',
      modified: true,
    };
  }

  // npx <tool> → pnpm dlx <tool>
  if (NPX_RE.test(trimmed)) {
    // Keep --yes flag if present, remove it (pnpm dlx doesn't need it)
    const rewritten = trimmed
      .replace(/^npx\s+/i, 'pnpm dlx ')
      .replace(/\s+--yes\b/, '')
      .replace(/\s+-y\b/, '');
    return { segment: rewritten, modified: true };
  }

  return { segment, modified: false };
}

function rewriteYarnSegmentToPnpm(segment: string): { segment: string; modified: boolean } {
  const trimmed = segment.trim();

  if (!trimmed || !YARN_RE.test(trimmed)) {
    return { segment, modified: false };
  }

  // yarn add → pnpm add
  if (/^yarn\s+add\s+/i.test(trimmed)) {
    return { segment: trimmed.replace(/^yarn\s+add\s+/i, 'pnpm add '), modified: true };
  }

  // yarn install → pnpm install
  if (/^yarn\s*(install)?(\s*$|\s+--)/i.test(trimmed)) {
    return { segment: trimmed.replace(/^yarn\s*(install)?\b/i, 'pnpm install'), modified: true };
  }

  // yarn run → pnpm run
  if (/^yarn\s+run\s+/i.test(trimmed)) {
    return { segment: trimmed.replace(/^yarn\s+run\s+/i, 'pnpm run '), modified: true };
  }

  // yarn <script> → pnpm <script> (for known scripts)
  if (/^yarn\s+(dev|build|start|test|lint|format)\b/i.test(trimmed)) {
    return { segment: trimmed.replace(/^yarn\s+/i, 'pnpm '), modified: true };
  }

  // yarn global add → pnpm add -g
  if (/^yarn\s+global\s+add\s+/i.test(trimmed)) {
    return { segment: trimmed.replace(/^yarn\s+global\s+add\s+/i, 'pnpm add -g '), modified: true };
  }

  // yarn remove → pnpm remove
  if (/^yarn\s+remove\s+/i.test(trimmed)) {
    return { segment: trimmed.replace(/^yarn\s+remove\s+/i, 'pnpm remove '), modified: true };
  }

  return { segment, modified: false };
}

/**
 * Universally rewrite npm/npx/yarn commands to pnpm equivalents.
 * This ensures commands actually work in WebContainer where npm may not be present.
 */
export function rewriteAllPackageManagersToPnpm(command: string): ShellCommandRewrite {
  const delimiterNormalization = decodeHtmlCommandDelimiters(command);
  const normalizedCommand = delimiterNormalization.modifiedCommand || command;
  const trimmed = normalizedCommand.trim();

  if (!trimmed) {
    return { shouldModify: false };
  }

  const parts = trimmed.split(/\s*&&\s*/);
  let modifiedAny = false;

  const rewrittenParts = parts.map((part) => {
    // Try npm → pnpm
    let rewritten = rewriteNpmSegmentToPnpm(part);

    if (rewritten.modified) {
      modifiedAny = true;
      return rewritten.segment;
    }

    // Try yarn → pnpm
    rewritten = rewriteYarnSegmentToPnpm(part);

    if (rewritten.modified) {
      modifiedAny = true;
      return rewritten.segment;
    }

    return part;
  });

  if (!modifiedAny) {
    return { shouldModify: false };
  }

  return {
    shouldModify: true,
    modifiedCommand: rewrittenParts.join(' && '),
    warning: 'Rewrote npm/yarn/npx commands to pnpm equivalents for WebContainer compatibility.',
  };
}

export function makeStartCommandsForeground(command: string): ShellCommandRewrite {
  const delimiterNormalization = decodeHtmlCommandDelimiters(command);
  const normalizedCommand = delimiterNormalization.modifiedCommand || command;
  const trimmed = normalizedCommand.trim();

  if (!trimmed) {
    return { shouldModify: false };
  }

  const parts = trimmed.split(/\s*&&\s*/);
  let modifiedAny = false;

  const rewrittenParts = parts.map((part) => {
    const rewritten = rewriteStartSegmentForForeground(part);

    if (rewritten.modified) {
      modifiedAny = true;
    }

    return rewritten.segment.trim();
  });

  if (!modifiedAny) {
    return { shouldModify: false };
  }

  return {
    shouldModify: true,
    modifiedCommand: rewrittenParts.join(' && '),
    warning: 'Removed detached background operators from start commands so preview can stay attached to the runtime.',
  };
}

export function makePreviewStartCommandsWebContainerFriendly(
  command: string,
  options?: { filesSnapshot?: CommandFileSnapshot },
): ShellCommandRewrite {
  const delimiterNormalization = decodeHtmlCommandDelimiters(command);
  let normalizedCommand = delimiterNormalization.modifiedCommand || command;
  const foregroundRewrite = makeStartCommandsForeground(normalizedCommand);

  if (foregroundRewrite.shouldModify && foregroundRewrite.modifiedCommand) {
    normalizedCommand = foregroundRewrite.modifiedCommand;
  }

  const trimmed = normalizedCommand.trim();

  if (!trimmed) {
    return { shouldModify: false };
  }

  const packageJsonContent = getPreferredPackageJsonContent(options?.filesSnapshot);
  const scripts = extractPackageScripts(packageJsonContent);
  const fallbackFramework = inferFrameworkFromFiles(options?.filesSnapshot);
  const parts = trimmed.split(/\s*&&\s*/);
  let modifiedAny = Boolean(foregroundRewrite.shouldModify);

  const rewrittenParts = parts.map((part) => {
    const segment = part.trim();

    if (!segment) {
      return part;
    }

    const packageScriptMatch = segment.match(PACKAGE_SCRIPT_START_RE);
    const framework = packageScriptMatch
      ? inferFrameworkFromScript(scripts[packageScriptMatch[2]]) || fallbackFramework
      : inferFrameworkFromDirectCommand(segment);

    if (!framework) {
      return segment;
    }

    let previewSegment = segment;

    if (packageScriptMatch) {
      const separatorRewrite = normalizePackageScriptPreviewArgSeparator(segment, packageScriptMatch[1]);

      if (separatorRewrite.modified) {
        previewSegment = separatorRewrite.command;
        modifiedAny = true;
      }
    }

    const missingArgs = getMissingPreviewArgs(previewSegment, framework);

    if (missingArgs.length === 0) {
      return previewSegment;
    }

    modifiedAny = true;

    if (packageScriptMatch) {
      return appendPackageScriptArgs(previewSegment, missingArgs, packageScriptMatch[1]);
    }

    return appendDirectArgs(previewSegment, missingArgs);
  });

  if (!modifiedAny) {
    return { shouldModify: false };
  }

  return {
    shouldModify: true,
    modifiedCommand: rewrittenParts.join(' && '),
    warning:
      'Normalized start commands for WebContainer preview by keeping them attached to the runtime and adding accessible host flags.',
  };
}

// ─── pip / Python Shim ───────────────────────────────────────────────────────

const PIP_INSTALL_RE = /^(pip3?|python3?\s+-m\s+pip)\s+install\s+/i;
const DJANGO_ADMIN_RE = /^django-admin\s+/i;
const MANAGE_PY_RE = /^python3?\s+manage\.py\s+/i;

/**
 * Intercept Python/pip/Django commands and either:
 * 1. Route them through E2B (if BoltContainer is active)
 * 2. Show a helpful error message pointing to BoltContainer
 */
export function rewritePythonCommands(command: string): ShellCommandRewrite {
  const trimmed = command.trim();

  if (!trimmed) {
    return { shouldModify: false };
  }

  const parts = trimmed.split(/\s*&&\s*/);
  let modifiedAny = false;

  const rewrittenParts = parts.map((part) => {
    const p = part.trim();

    // pip install → echo helpful message  (in WebContainer mode, these just fail silently)
    if (PIP_INSTALL_RE.test(p)) {
      modifiedAny = true;
      return `echo "\\x1b[33m[BoltContainer]\\x1b[0m pip is not available in WebContainer. Switch to BoltContainer + E2B in Settings → Cloud Environments for full Python/pip support." && ${p}`;
    }

    // django-admin → echo helpful message
    if (DJANGO_ADMIN_RE.test(p)) {
      modifiedAny = true;
      return `echo "\\x1b[33m[BoltContainer]\\x1b[0m django-admin requires Python with Django installed. Switch to BoltContainer + E2B in Settings → Cloud Environments." && ${p}`;
    }

    // python manage.py → echo helpful message
    if (MANAGE_PY_RE.test(p)) {
      modifiedAny = true;
      return `echo "\\x1b[33m[BoltContainer]\\x1b[0m Django manage.py requires a full Python environment. Switch to BoltContainer + E2B in Settings → Cloud Environments." && ${p}`;
    }

    return p;
  });

  if (!modifiedAny) {
    return { shouldModify: false };
  }

  return {
    shouldModify: true,
    modifiedCommand: rewrittenParts.join(' && '),
    warning: 'Added guidance for Python/pip commands that need BoltContainer + E2B.',
  };
}
