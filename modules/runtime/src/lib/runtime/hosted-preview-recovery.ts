export interface HostedPreviewRecoveryStatusLike {
  alert?: {
    description?: string | null;
    content?: string | null;
  } | null;
  recentLogs?: string[] | null;
  preview?: {
    baseUrl?: string | null;
  } | null;
}

export type HostedPreviewRecoveryOutcome = 'ready' | 'error' | 'timeout';

export function summarizeHostedPreviewFailure(status: HostedPreviewRecoveryStatusLike | null | undefined): string {
  if (!status) {
    return 'The hosted preview did not become healthy, but no diagnostic payload was available yet.';
  }

  const description = status.alert?.description?.trim();

  if (description) {
    return description;
  }

  const logLine = status.recentLogs?.find((entry) => typeof entry === 'string' && entry.trim().length > 0)?.trim();

  if (logLine) {
    return logLine;
  }

  const previewBaseUrl = status.preview?.baseUrl?.trim();

  if (previewBaseUrl) {
    return `The hosted preview at ${previewBaseUrl} is still not healthy.`;
  }

  return 'The hosted preview did not become healthy, but no diagnostic payload was available yet.';
}

export function shouldContinueHostedPreviewRecovery(options: {
  outcome: HostedPreviewRecoveryOutcome;
  attempts: number;
  maxAttempts: number;
}): boolean {
  const { outcome, attempts, maxAttempts } = options;

  if (outcome === 'ready') {
    return false;
  }

  return attempts < maxAttempts;
}

export function buildHostedPreviewRecoveryPrompt(options: {
  model: string;
  provider: string;
  originalRequest: string;
  failureSummary: string;
  attempt: number;
  maxAttempts: number;
}): string {
  const { model, provider, originalRequest, failureSummary, attempt, maxAttempts } = options;

  return `[Model: ${model}]

[Provider: ${provider}]

The hosted preview is still not healthy after the previous execution pass.
Continue from the current project state and fix the actual preview/runtime issue instead of restarting.

Original request:
${originalRequest}

Current preview problem:
${failureSummary}

Requirements:
1) Do not re-scaffold if package.json or app files already exist.
2) Inspect the exact file, import, or command that caused the preview failure and apply the smallest safe fix.
3) Emit executable <boltAction> steps immediately.
4) Re-run only the install/build/start steps required to restore a healthy preview.
5) Keep self-healing until the hosted preview is verified or you exhaust the current continuation budget (${attempt}/${maxAttempts}).
6) Do not claim success until the preview is genuinely running.
7) Finish with a concise summary only after the preview is healthy.
`;
}
