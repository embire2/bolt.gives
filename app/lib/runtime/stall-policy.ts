export interface StallPolicy {
  starterContinuationThresholdMs: number;
  warningThresholdMs: number;
  recoveryThresholdMs: number;
  maxAutoContinuations: number;
}

const LONG_THINK_MODEL_RE = /\b(gpt-5|codex|o1|o3|claude-3\.7|claude-3\.5-sonnet-20241022)\b/i;

const DEFAULT_POLICY: StallPolicy = {
  starterContinuationThresholdMs: 25000,
  warningThresholdMs: 45000,
  recoveryThresholdMs: 60000,
  maxAutoContinuations: 3,
};

const LONG_THINK_POLICY: StallPolicy = {
  starterContinuationThresholdMs: 120000,
  warningThresholdMs: 180000,
  recoveryThresholdMs: 260000,
  maxAutoContinuations: 3,
};

const HOSTED_FREE_POLICY: StallPolicy = {
  starterContinuationThresholdMs: 25000,
  warningThresholdMs: 45000,
  recoveryThresholdMs: 120000,
  maxAutoContinuations: 3,
};

export function resolveStallPolicy(model: string | undefined, providerName?: string): StallPolicy {
  if (providerName?.trim().toUpperCase() === 'FREE') {
    return HOSTED_FREE_POLICY;
  }

  if (!model) {
    return DEFAULT_POLICY;
  }

  if (LONG_THINK_MODEL_RE.test(model)) {
    return LONG_THINK_POLICY;
  }

  return DEFAULT_POLICY;
}

export function hasExceededHostedFreeDeadline(options: {
  providerName?: string;
  elapsedMs: number;
  maxDurationMs: number;
}): boolean {
  return (
    options.providerName?.trim().toUpperCase() === 'FREE' &&
    Number.isFinite(options.elapsedMs) &&
    Number.isFinite(options.maxDurationMs) &&
    options.maxDurationMs > 0 &&
    options.elapsedMs >= options.maxDurationMs
  );
}

export function getRemainingHostedFreeDeadlineMs(options: {
  requestStartedAtMs: number;
  nowMs: number;
  maxDurationMs: number;
}): number {
  if (
    !Number.isFinite(options.requestStartedAtMs) ||
    !Number.isFinite(options.nowMs) ||
    !Number.isFinite(options.maxDurationMs) ||
    options.maxDurationMs <= 0
  ) {
    return 0;
  }

  return Math.max(0, options.maxDurationMs - Math.max(0, options.nowMs - options.requestStartedAtMs));
}

export function shouldRecoverHostedFreeCompletion(options: {
  providerName?: string;
  chatMode: 'discuss' | 'build';
  assistantContent?: string;
  workspaceChanged: boolean;
}): boolean {
  if (options.providerName?.trim().toUpperCase() !== 'FREE' || options.chatMode !== 'build') {
    return false;
  }

  const producedBuildAction = /<bolt(?:Action|Artifact)\b/i.test(options.assistantContent || '');

  return !options.workspaceChanged && !producedBuildAction;
}

export function getCurrentRequestAssistantContent(options: {
  baselineSignature: string;
  assistantMessageId?: string;
  assistantContent?: string;
}): string {
  const content = options.assistantContent || '';
  const signature = options.assistantMessageId ? `${options.assistantMessageId}:${content.length}` : '';

  return signature && signature !== options.baselineSignature ? content : '';
}
