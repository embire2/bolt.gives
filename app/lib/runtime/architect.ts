import type { ActionAlert } from '~/types/actions';
import type { AutonomyMode } from '~/lib/runtime/autonomy';

export const ARCHITECT_NAME = 'Architect';

type ArchitectIssue = {
  id: string;
  title: string;
  source: ActionAlert['source'] | 'any';
  patterns: RegExp[];
  maxAutoAttempts: number;
  guidance: string[];
};

export type ArchitectDiagnosis = {
  issueId: string;
  title: string;
  fingerprint: string;
  maxAutoAttempts: number;
  guidance: string[];
  matchedPattern: string;
};

export type ArchitectAutoHealDecision = {
  shouldAutoHeal: boolean;
  reason: 'allowed' | 'autonomy-blocked' | 'attempt-limit';
  maxAutoAttempts: number;
};

export type StarterContinuationPrecedenceDecision = {
  shouldDispatchStarterContinuation: boolean;
  reason: 'starter-placeholder' | 'no-starter-placeholder' | 'no-pending-request' | 'continuation-already-triggered';
};

const ARCHITECT_KNOWLEDGE_BASE: ArchitectIssue[] = [
  {
    id: 'starter-placeholder-visible',
    title: 'Fallback starter is still visible in preview',
    source: 'preview',
    patterns: [/Starter Placeholder Still Visible/i, /Your fallback starter is ready\./i],
    maxAutoAttempts: 3,
    guidance: [
      'Continue from the existing project files and do not re-run scaffolding if package.json already exists.',
      'Replace the fallback starter UI in the main entry screen (for example src/App.tsx, src/App.jsx, or app/page.tsx).',
      'Implement the original user request rather than returning another scaffold or placeholder screen.',
      'Keep the preview running and verify that the fallback starter text is gone before finishing.',
    ],
  },
  {
    id: 'vite-fullcalendar-css-export',
    title: 'FullCalendar CSS export mismatch',
    source: 'preview',
    patterns: [/Missing\s+["']\.\/index\.css["']\s+specifier\s+in\s+["']@fullcalendar\/[a-z-]+["']/i],
    maxAutoAttempts: 2,
    guidance: [
      'Remove invalid CSS imports from @fullcalendar/*/index.css and @fullcalendar/*/main.css.',
      'Keep JavaScript imports for FullCalendar plugins/components.',
      'Install missing FullCalendar runtime packages only if referenced by code.',
      'Restart the dev server and verify the preview compiles without import-analysis errors.',
    ],
  },
  {
    id: 'vite-import-not-found',
    title: 'Vite import resolution failure',
    source: 'preview',
    patterns: [/\[plugin:vite:import-analysis\]/i, /Failed to resolve import/i, /Cannot find module ['"][^'"]+['"]/i],
    maxAutoAttempts: 2,
    guidance: [
      'Find the missing package or file path referenced by Vite.',
      'If it is a package dependency, add it with pnpm and keep version compatible with current stack.',
      'If it is a local file path issue, correct the import path/casing and keep changes minimal.',
      'Re-run the app and verify preview loads cleanly.',
    ],
  },
  {
    id: 'vite-preview-compile-error',
    title: 'Vite compile error in preview',
    source: 'preview',
    patterns: [/\[plugin:vite:[^\]]+\]/i, /Unexpected token/i, /Transform failed/i, /Expected .* but found/i],
    maxAutoAttempts: 2,
    guidance: [
      'Inspect the exact Vite compile error and identify the file and line that broke the preview build.',
      'Apply the smallest syntax or import fix needed to restore compilation without rewriting unrelated files.',
      'If the error came from partial edits, repair the malformed JSX/TSX/CSS so the file parses cleanly again.',
      'Restart or refresh the preview and verify the overlay is gone before finishing.',
    ],
  },
  {
    id: 'missing-package-manifest',
    title: 'Project manifest missing',
    source: 'terminal',
    patterns: [/ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND/i, /Could not read package\.json/i],
    maxAutoAttempts: 2,
    guidance: [
      'Ensure commands run inside the generated project directory before install/lint/build.',
      'Scaffold non-interactively when needed and avoid interactive prompts.',
      'Install dependencies with pnpm and verify package.json exists before lint/build.',
    ],
  },
  {
    id: 'interactive-cli-cancelled',
    title: 'Interactive CLI cancelled',
    source: 'terminal',
    patterns: [/Operation cancelled/i, /Operation canceled/i],
    maxAutoAttempts: 1,
    guidance: [
      'Re-run scaffolding in non-interactive mode.',
      'Prefer pnpm dlx create-vite ... --no-interactive for Vite React scaffolds.',
      'Continue setup only after scaffold succeeds.',
    ],
  },
  {
    id: 'npm-spawn-enoent',
    title: 'npm executable missing in shell path',
    source: 'terminal',
    patterns: [/jsh:\s*spawn npm ENOENT/i, /spawn npm ENOENT/i],
    maxAutoAttempts: 2,
    guidance: [
      'Avoid npm-only flows when npm is unavailable in the shell path.',
      'Use pnpm alternatives (pnpm dlx create-vite, pnpm install, pnpm run dev).',
      'If npm is required, verify binary availability first with `which npm` and fall back safely.',
    ],
  },
  {
    id: 'escaped-shell-separators',
    title: 'Escaped shell separators',
    source: 'terminal',
    patterns: [/jsh:\s*;&\s*can only be used in a case clause/i, /&amp;&amp;/i],
    maxAutoAttempts: 1,
    guidance: [
      'Decode HTML-escaped shell separators (`&amp;&amp;` -> `&&`) before execution.',
      'Re-run only the failed command chain after normalization.',
      'Verify the command exits cleanly before continuing with the workflow.',
    ],
  },
  {
    id: 'autonomy-read-only-block',
    title: 'Autonomy mode blocked mutating action',
    source: 'terminal',
    patterns: [
      /Read-Only mode blocked a mutating action/i,
      /Read-Only mode prevented this project action/i,
      /Blocked by read-only autonomy mode/i,
    ],
    maxAutoAttempts: 1,
    guidance: [
      'This workflow is blocked by Read-Only autonomy mode.',
      'Switch autonomy to Safe Auto or Full Auto before running scaffold/install/start actions.',
      'Retry the original request once autonomy mode allows mutating actions.',
    ],
  },
  {
    id: 'json-command-envelope',
    title: 'JSON-wrapped shell command',
    source: 'terminal',
    patterns: [/no such file or directory:\s*\{command:/i, /Run shell command:\s*\{\"command\":/i],
    maxAutoAttempts: 1,
    guidance: [
      'Extract the plain shell command string from JSON wrappers ({"command":"..."}).',
      'Re-run the unwrapped command directly in the shell.',
      'Continue only after the unwrapped command exits successfully.',
    ],
  },
  {
    id: 'bedrock-config-invalid',
    title: 'Invalid AWS Bedrock configuration',
    source: 'terminal',
    patterns: [/Invalid AWS Bedrock configuration format/i, /region,\s*accessKeyId,\s*and secretAccessKey/i],
    maxAutoAttempts: 1,
    guidance: [
      'Do not continue with Bedrock calls until credentials are valid JSON.',
      'Switch to another configured provider/model for this run if available.',
      'Ask for corrected Bedrock JSON only if no alternative provider is configured.',
    ],
  },
  {
    id: 'vite-missing-package-specifier',
    title: 'Vite package export specifier mismatch',
    source: 'preview',
    patterns: [/Missing\s+["']\.[^"']+["']\s+specifier\s+in\s+["'][^"']+["']\s+package/i],
    maxAutoAttempts: 2,
    guidance: [
      'Fix invalid imports that reference non-exported package paths.',
      'Replace deep CSS/runtime paths with supported package entrypoints from docs.',
      'Rebuild and verify preview compiles before continuing.',
    ],
  },
  {
    id: 'preview-runtime-exception',
    title: 'Preview runtime exception',
    source: 'preview',
    patterns: [
      /PREVIEW_UNCAUGHT_EXCEPTION/i,
      /PREVIEW_UNHANDLED_REJECTION/i,
      /Uncaught\s+(?:Error|TypeError|ReferenceError|SyntaxError|RangeError)/i,
      /Unhandled\s+Promise\s+Rejection/i,
    ],
    maxAutoAttempts: 2,
    guidance: [
      'Inspect the preview/runtime error and identify the exact file, import, or state transition that caused it.',
      'Apply the smallest code fix that removes the runtime exception without rewriting unrelated parts of the app.',
      'Restart or refresh the preview if needed and verify that the app renders instead of showing the runtime error again.',
      'If a dependency or environment variable is missing, add the minimum safe fallback and report what changed.',
    ],
  },
  {
    id: 'update-runtime-unenv-fs',
    title: 'Runtime lacks Node fs support for update actions',
    source: 'terminal',
    patterns: [/\[unenv\]\s*fs\.readFile is not implemented yet/i, /Update manager:\s*\[unenv\]/i],
    maxAutoAttempts: 1,
    guidance: [
      'Do not run Node fs-based update commands in this runtime.',
      'Show a user-safe message and route updates through Git/Cloudflare deployment flow.',
      'Continue coding workflow without blocking the current task.',
    ],
  },
  {
    id: 'cloudflare-api-auth-10000',
    title: 'Cloudflare API token permission error',
    source: 'terminal',
    patterns: [/Authentication error\s*\[code:\s*10000\]/i, /Cloudflare API.*10000/i],
    maxAutoAttempts: 1,
    guidance: [
      'Do not retry deploy blindly with the same token.',
      'Report required token scopes and account mapping clearly.',
      'Pause deploy actions until credentials are corrected.',
    ],
  },
  {
    id: 'web-browse-url-validation',
    title: 'Web browse URL validation failure',
    source: 'terminal',
    patterns: [/URL is not allowed\. Only public HTTP\/HTTPS URLs are accepted/i],
    maxAutoAttempts: 2,
    guidance: [
      'Normalize and validate URLs before calling browse/search tools.',
      'Strip markdown wrappers, braces, and trailing punctuation from the URL.',
      'Retry with a clean public https:// URL and continue execution only after tool success.',
    ],
  },
  {
    id: 'jsh-command-not-found',
    title: 'Shell command not found in WebContainer',
    source: 'terminal',
    patterns: [
      /jsh:\s*command not found/i,
      /jsh:\s*[^:]+:\s*not found/i,
      /sh:\s*\d+:\s*[^:]+:\s*not found/i,
      /bash:\s*[^:]+:\s*command not found/i,
    ],
    maxAutoAttempts: 3,
    guidance: [
      'The command is not available in WebContainer. Use alternative package managers: pnpm (preferred) or npx.',
      'Replace `npm` with `pnpm`, `npx` with `pnpm dlx`, and `yarn` with `pnpm`.',
      'If a CLI tool is missing, install it first with `pnpm add -D <tool>` before running it.',
      'For global tools, use `pnpm dlx <tool>` instead of installing globally.',
      'Re-run the command and verify it succeeds before continuing.',
    ],
  },
  {
    id: 'missing-node-modules',
    title: 'Missing node_modules — dependencies not installed',
    source: 'terminal',
    patterns: [/Cannot find module/i, /MODULE_NOT_FOUND/i, /Error:\s*Cannot find package/i, /ERR_MODULE_NOT_FOUND/i],
    maxAutoAttempts: 3,
    guidance: [
      'Dependencies have not been installed. Run `pnpm install` in the project directory first.',
      'Verify package.json exists and has the required dependency listed.',
      'If a specific package is missing, run `pnpm add <package-name>` to install it.',
      'After installing, re-run the failed command and verify it succeeds.',
    ],
  },
  {
    id: 'pnpm-not-found',
    title: 'pnpm binary not available',
    source: 'terminal',
    patterns: [/jsh:\s*spawn pnpm ENOENT/i, /pnpm:\s*command not found/i, /pnpm:\s*not found/i],
    maxAutoAttempts: 2,
    guidance: [
      'pnpm is not available in the shell path. Try using npx to install it: `npx pnpm install`.',
      'Alternatively, use the npm fallback if available: `npm install`.',
      'If neither pnpm nor npm works, recommend switching the Runtime Engine to BoltContainer or E2B in Settings.',
    ],
  },
  {
    id: 'dependency-install-failed',
    title: 'Package install failed',
    source: 'terminal',
    patterns: [/ERR_PNPM_/i, /npm ERR!/i, /ERESOLVE unable to resolve/i, /peer dependency conflict/i, /ETARGET/i],
    maxAutoAttempts: 2,
    guidance: [
      'The package installation failed. Inspect the error for version conflicts or missing peer dependencies.',
      'Try installing with `--legacy-peer-deps` or `--force` if there are peer conflicts.',
      'If a specific version is unavailable, use the latest compatible version.',
      'Clear caches with `pnpm store prune` and retry if the error seems transient.',
    ],
  },
  {
    id: 'pnpm-invalid-install-flags',
    title: 'pnpm command received npm-only install flags',
    source: 'terminal',
    patterns: [
      /Unknown option:\s*['"]progress['"]/i,
      /Unknown option:\s*['"]no-progress['"]/i,
      /pnpm\s+add\s+--no-progress\b/i,
      /pnpm\s+install\s+--no-progress\b/i,
    ],
    maxAutoAttempts: 2,
    guidance: [
      'Remove npm-only flags such as `--no-progress`, `--silent`, or `--loglevel silent` before running pnpm commands.',
      'Use `pnpm install --reporter=append-only` for dependency installs without package arguments.',
      'Use `pnpm add <package>` (or `pnpm add -D <package>`) only when packages are explicitly being installed.',
      'Rerun the corrected command, then continue from the existing project files instead of restarting the scaffold.',
    ],
  },
  {
    id: 'python-django-unsupported',
    title: 'Python/Django not natively supported in WebContainer',
    source: 'terminal',
    patterns: [
      /python[23]?:\s*command not found/i,
      /pip[23]?:\s*command not found/i,
      /manage\.py:\s*not found/i,
      /No module named django/i,
    ],
    maxAutoAttempts: 2,
    guidance: [
      'Python and Django are not natively supported in WebContainer (WASM-based).',
      'Switch to BoltContainer with E2B Sandbox enabled (Settings → Cloud Environments) for full Python/Django support.',
      'With E2B enabled, you get a real Linux environment that supports Python, pip, Django, and all system packages.',
      'If you must stay in WebContainer, suggest a JavaScript alternative (Next.js, Express) or use the E2B runtime.',
    ],
  },
];

function buildFingerprint(input: string): string {
  let hash = 5381;

  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }

  return (hash >>> 0).toString(16);
}

export function decideStarterContinuationPrecedence(options: {
  diagnosis: ArchitectDiagnosis | null | undefined;
  hasPendingStarterRequest: boolean;
  starterContinuationAlreadyTriggered: boolean;
}): StarterContinuationPrecedenceDecision {
  const { diagnosis, hasPendingStarterRequest, starterContinuationAlreadyTriggered } = options;

  if (diagnosis?.issueId !== 'starter-placeholder-visible') {
    return {
      shouldDispatchStarterContinuation: false,
      reason: 'no-starter-placeholder',
    };
  }

  if (!hasPendingStarterRequest) {
    return {
      shouldDispatchStarterContinuation: false,
      reason: 'no-pending-request',
    };
  }

  if (starterContinuationAlreadyTriggered) {
    return {
      shouldDispatchStarterContinuation: false,
      reason: 'continuation-already-triggered',
    };
  }

  return {
    shouldDispatchStarterContinuation: true,
    reason: 'starter-placeholder',
  };
}

function getAlertText(alert: ActionAlert): string {
  return [alert.title, alert.description, alert.content].filter(Boolean).join('\n').trim();
}

export function diagnoseArchitectIssue(alert: ActionAlert | null | undefined): ArchitectDiagnosis | null {
  if (!alert) {
    return null;
  }

  const text = getAlertText(alert);

  if (!text) {
    return null;
  }

  for (const issue of ARCHITECT_KNOWLEDGE_BASE) {
    if (issue.source !== 'any' && issue.source !== alert.source) {
      continue;
    }

    const matched = issue.patterns.find((pattern) => pattern.test(text));

    if (!matched) {
      continue;
    }

    return {
      issueId: issue.id,
      title: issue.title,
      fingerprint: `${issue.id}:${buildFingerprint(`${alert.source || 'unknown'}:${text}`)}`,
      maxAutoAttempts: issue.maxAutoAttempts,
      guidance: issue.guidance,
      matchedPattern: matched.source,
    };
  }

  return null;
}

export function decideArchitectAutoHeal(options: {
  autonomyMode: AutonomyMode;
  diagnosis: ArchitectDiagnosis;
  attemptsForFingerprint: number;
}): ArchitectAutoHealDecision {
  const { autonomyMode, diagnosis, attemptsForFingerprint } = options;

  if (autonomyMode === 'read-only' || autonomyMode === 'review-required') {
    return {
      shouldAutoHeal: false,
      reason: 'autonomy-blocked',
      maxAutoAttempts: diagnosis.maxAutoAttempts,
    };
  }

  if (attemptsForFingerprint >= diagnosis.maxAutoAttempts) {
    return {
      shouldAutoHeal: false,
      reason: 'attempt-limit',
      maxAutoAttempts: diagnosis.maxAutoAttempts,
    };
  }

  return {
    shouldAutoHeal: true,
    reason: 'allowed',
    maxAutoAttempts: diagnosis.maxAutoAttempts,
  };
}

export function buildArchitectAutoHealPrompt(options: {
  alert: ActionAlert;
  diagnosis: ArchitectDiagnosis;
  attemptNumber: number;
  originalRequest?: string;
}): string {
  const { alert, diagnosis, attemptNumber, originalRequest } = options;
  const errorBlock = [alert.description, alert.content].filter(Boolean).join('\n');
  const numberedGuidance = diagnosis.guidance.map((line, idx) => `${idx + 1}. ${line}`).join('\n');

  return [
    `[${ARCHITECT_NAME} Auto-Heal]`,
    `Attempt ${attemptNumber}/${diagnosis.maxAutoAttempts}.`,
    `Issue: ${diagnosis.title} (${diagnosis.issueId}).`,
    `Matched by: ${diagnosis.matchedPattern}`,
    '',
    'Error details:',
    '```',
    errorBlock,
    '```',
    ...(originalRequest?.trim() ? ['', 'Original request to complete:', '```', originalRequest.trim(), '```'] : []),
    '',
    'Execute a safe self-heal workflow now:',
    numberedGuidance,
    '',
    'Safety guardrails:',
    '- Operate only within /home/project.',
    '- Do not run destructive commands (no rm -rf outside project, no sudo, no credential changes).',
    '- Apply the smallest fix that unblocks the build/preview.',
    '- If a command fails, include command + exit code + stderr and do not claim success.',
    '- Verify the fix by rerunning the relevant command(s) and report clear pass/fail evidence.',
  ].join('\n');
}
