type ToolCallLike = {
  toolName: string;
  args?: unknown;
};

export type RecoveryReason = 'repeated-tool-loop' | 'no-progress' | 'stream-timeout';

export interface RecoverySignal {
  reason: RecoveryReason;
  message: string;
  detail: string;
  backoffMs: number;
  forceFinalize: boolean;
}

interface AgentRecoveryControllerOptions {
  repeatToolThreshold?: number;
  noProgressThreshold?: number;
  timeoutThreshold?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
}

const defaultOptions: Required<AgentRecoveryControllerOptions> = {
  repeatToolThreshold: 3,
  noProgressThreshold: 3,
  timeoutThreshold: 2,
  baseBackoffMs: 500,
  maxBackoffMs: 4000,
};

function stableArgs(input: unknown): string {
  if (!input || typeof input !== 'object') {
    return String(input ?? '');
  }

  if (Array.isArray(input)) {
    return `[${input.map((item) => stableArgs(item)).join(',')}]`;
  }

  const record = input as Record<string, unknown>;
  const keys = Object.keys(record).sort();

  return `{${keys.map((key) => `${key}:${stableArgs(record[key])}`).join(',')}}`;
}

function buildToolSignature(toolCalls: ToolCallLike[]): string {
  if (toolCalls.length === 0) {
    return '';
  }

  return toolCalls.map((call) => `${call.toolName}:${stableArgs(call.args)}`).join('|');
}

export class AgentRecoveryController {
  #options: Required<AgentRecoveryControllerOptions>;
  #lastToolSignature = '';
  #repeatedToolCount = 0;
  #noProgressCount = 0;
  #timeoutCount = 0;
  #recoveryCount = 0;

  constructor(options: AgentRecoveryControllerOptions = {}) {
    this.#options = {
      ...defaultOptions,
      ...options,
    };
  }

  #nextBackoffMs(): number {
    this.#recoveryCount += 1;
    return Math.min(this.#options.maxBackoffMs, this.#options.baseBackoffMs * 2 ** (this.#recoveryCount - 1));
  }

  analyzeStep(toolCalls: ToolCallLike[], toolResultsCount: number): RecoverySignal | undefined {
    const signature = buildToolSignature(toolCalls);

    if (signature) {
      this.#repeatedToolCount = signature === this.#lastToolSignature ? this.#repeatedToolCount + 1 : 1;
      this.#lastToolSignature = signature;
    } else {
      this.#repeatedToolCount = 0;
      this.#lastToolSignature = '';
    }

    if (toolCalls.length === 0 && toolResultsCount === 0) {
      this.#noProgressCount += 1;
    } else {
      this.#noProgressCount = 0;
    }

    if (this.#repeatedToolCount >= this.#options.repeatToolThreshold) {
      const backoffMs = this.#nextBackoffMs();
      return {
        reason: 'repeated-tool-loop',
        message: 'I noticed a repeated loop, so I am switching to a safer recovery path.',
        detail: `Key changes: The same action repeated several times, so I paused for ${backoffMs}ms.
Next: I will continue with a safer fallback path.`,
        backoffMs,
        forceFinalize: true,
      };
    }

    if (this.#noProgressCount >= this.#options.noProgressThreshold) {
      const backoffMs = this.#nextBackoffMs();
      return {
        reason: 'no-progress',
        message: 'I detected no visible progress, so I am restarting from a stable point.',
        detail: `Key changes: Progress paused for ${this.#noProgressCount} steps, so I added a ${backoffMs}ms recovery pause.
Next: I will continue from the latest stable result.`,
        backoffMs,
        forceFinalize: true,
      };
    }

    return undefined;
  }

  registerTimeout(): RecoverySignal {
    this.#timeoutCount += 1;

    const backoffMs = this.#nextBackoffMs();

    return {
      reason: 'stream-timeout',
      message: 'The response timed out, so I am retrying automatically.',
      detail: `Key changes: Timeout attempt ${this.#timeoutCount} triggered a ${backoffMs}ms backoff.
Next: I will retry and continue automatically.`,
      backoffMs,
      forceFinalize: this.#timeoutCount >= this.#options.timeoutThreshold,
    };
  }
}
