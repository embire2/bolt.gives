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

export function resolveStallPolicy(model: string | undefined): StallPolicy {
  if (!model) {
    return DEFAULT_POLICY;
  }

  if (LONG_THINK_MODEL_RE.test(model)) {
    return LONG_THINK_POLICY;
  }

  return DEFAULT_POLICY;
}
