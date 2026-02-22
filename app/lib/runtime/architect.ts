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

const ARCHITECT_KNOWLEDGE_BASE: ArchitectIssue[] = [
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
];

function buildFingerprint(input: string): string {
  let hash = 5381;

  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }

  return (hash >>> 0).toString(16);
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
}): string {
  const { alert, diagnosis, attemptNumber } = options;
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
