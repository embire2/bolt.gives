export interface InteractiveStep {
  description: string;
  command: string[];
}

export type InteractiveStepRunnerEventType =
  | 'step-start'
  | 'stdout'
  | 'stderr'
  | 'step-end'
  | 'error'
  | 'complete'
  | 'telemetry';

export interface InteractiveStepRunnerEvent {
  type: InteractiveStepRunnerEventType;
  timestamp: string;
  stepIndex?: number;
  description?: string;
  command?: string[];
  output?: string;
  exitCode?: number;
  error?: string;
  totalSteps?: number;
}

export interface StepExecutionResult {
  exitCode: number;
  stdout?: string;
  stderr?: string;
}

export interface StepExecutionContext {
  command: string[];
  onStdout: (chunk: string) => void;
  onStderr: (chunk: string) => void;
}

export interface StepExecutor {
  executeStep: (step: InteractiveStep, context: StepExecutionContext) => Promise<StepExecutionResult>;
}

export type StepEventSocket = Pick<WebSocket, 'readyState' | 'send'>;

export interface InteractiveStepRunResult {
  status: 'complete' | 'error';
  failedStepIndex?: number;
  exitCode?: number;
  error?: string;
}

const WS_OPEN = 1;
const STREAM_FLUSH_MS = 400;
const MAX_STREAM_BUFFER_CHARS = 1400;
const MAX_STEP_OUTPUT_CHARS = 1600;
const ANSI_ESCAPE_RE = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const OSC_ESCAPE_RE = /\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g;
const CARRIAGE_RETURN_RE = /\r/g;
const PROMPT_NOISE_RE = /^(~\/project|❯|\[J)$/i;
const PROGRESS_NOISE_RE = /^(progress:\s+resolved|packages:\s+\+|^\++$)/i;
const SHELL_STATUS_RE = /^done in \d+(\.\d+)?s$/i;

function sanitizeStreamChunk(raw: string): string {
  if (!raw) {
    return '';
  }

  const withoutEscapes = raw
    .replace(OSC_ESCAPE_RE, '')
    .replace(ANSI_ESCAPE_RE, '')
    .replace(CARRIAGE_RETURN_RE, '\n')
    .replace(/\u001b/g, '');
  const lines = withoutEscapes
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return '';
  }

  const compacted: string[] = [];
  let latestProgressLine = '';

  for (const line of lines) {
    if (PROMPT_NOISE_RE.test(line)) {
      continue;
    }

    if (PROGRESS_NOISE_RE.test(line)) {
      latestProgressLine = line;
      continue;
    }

    compacted.push(line);
  }

  if (latestProgressLine) {
    compacted.push(`[progress] ${latestProgressLine}`);
  }

  const output = compacted.join('\n').trim();

  if (output.length === 0) {
    return '';
  }

  return output.slice(-MAX_STREAM_BUFFER_CHARS);
}

function summarizeStepOutput(raw?: string): string | undefined {
  if (!raw) {
    return undefined;
  }

  const sanitized = sanitizeStreamChunk(raw);

  if (!sanitized) {
    return undefined;
  }

  const lines = sanitized
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !PROMPT_NOISE_RE.test(line));

  if (lines.length === 0) {
    return undefined;
  }

  const tail = lines.slice(-8);

  // Preserve final status line when available (for clear success/failure context).
  const statusLine = lines.find((line) => SHELL_STATUS_RE.test(line));

  if (statusLine && !tail.includes(statusLine)) {
    tail.push(statusLine);
  }

  return tail.join('\n').slice(-MAX_STEP_OUTPUT_CHARS);
}

export class InteractiveStepRunner extends EventTarget {
  #executor: StepExecutor;
  #socket?: StepEventSocket;
  #streamBuffer = new Map<string, InteractiveStepRunnerEvent>();
  #streamFlushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(executor: StepExecutor, socket?: StepEventSocket) {
    super();
    this.#executor = executor;
    this.#socket = socket;
  }

  #streamBufferKey(stepIndex: number, type: 'stdout' | 'stderr'): string {
    return `${stepIndex}:${type}`;
  }

  #scheduleStreamFlush() {
    if (this.#streamFlushTimer) {
      return;
    }

    this.#streamFlushTimer = setTimeout(() => {
      this.#flushStreamBuffer();
    }, STREAM_FLUSH_MS);
  }

  #bufferStreamChunk(type: 'stdout' | 'stderr', stepIndex: number, description: string, output: string) {
    const sanitizedOutput = sanitizeStreamChunk(output);

    if (!sanitizedOutput) {
      return;
    }

    const key = this.#streamBufferKey(stepIndex, type);
    const existing = this.#streamBuffer.get(key);
    const separator =
      existing?.output &&
      !/\s$/.test(existing.output) &&
      !/^\s/.test(sanitizedOutput) &&
      !/^[,:.;)/]/.test(sanitizedOutput) &&
      !sanitizedOutput.startsWith('[progress]')
        ? ' '
        : '';
    const nextOutput = `${existing?.output || ''}${separator}${sanitizedOutput}`.slice(-MAX_STREAM_BUFFER_CHARS);

    this.#streamBuffer.set(key, {
      type,
      timestamp: new Date().toISOString(),
      stepIndex,
      description,
      output: nextOutput,
    });
    this.#scheduleStreamFlush();
  }

  #flushStreamBuffer() {
    if (this.#streamFlushTimer) {
      clearTimeout(this.#streamFlushTimer);
      this.#streamFlushTimer = null;
    }

    if (this.#streamBuffer.size === 0) {
      return;
    }

    for (const event of this.#streamBuffer.values()) {
      this.#emit(event);
    }

    this.#streamBuffer.clear();
  }

  #emit(event: InteractiveStepRunnerEvent) {
    this.dispatchEvent(new CustomEvent<InteractiveStepRunnerEvent>('event', { detail: event }));

    if (this.#socket?.readyState === WS_OPEN) {
      this.#socket.send(JSON.stringify(event));
    }
  }

  async run(steps: InteractiveStep[]): Promise<InteractiveStepRunResult> {
    for (let index = 0; index < steps.length; index++) {
      const step = steps[index];

      this.#emit({
        type: 'step-start',
        timestamp: new Date().toISOString(),
        stepIndex: index,
        description: step.description,
        command: step.command,
      });

      try {
        const result = await this.#executor.executeStep(step, {
          command: step.command,
          onStdout: (chunk) => {
            this.#bufferStreamChunk('stdout', index, step.description, chunk);
          },
          onStderr: (chunk) => {
            this.#bufferStreamChunk('stderr', index, step.description, chunk);
          },
        });
        this.#flushStreamBuffer();

        if (!result) {
          const errorMessage = 'Step executor returned no result.';

          this.#emit({
            type: 'error',
            timestamp: new Date().toISOString(),
            stepIndex: index,
            description: step.description,
            error: errorMessage,
          });

          return {
            status: 'error',
            failedStepIndex: index,
            exitCode: undefined,
            error: errorMessage,
          };
        }

        this.#emit({
          type: 'step-end',
          timestamp: new Date().toISOString(),
          stepIndex: index,
          description: step.description,
          exitCode: result.exitCode,
          output: summarizeStepOutput(result.stdout),
        });

        if (result.exitCode !== 0) {
          const errorMessage =
            summarizeStepOutput(result.stderr) ||
            summarizeStepOutput(result.stdout) ||
            `Step failed with exit code ${result.exitCode}`;

          this.#emit({
            type: 'error',
            timestamp: new Date().toISOString(),
            stepIndex: index,
            description: step.description,
            exitCode: result.exitCode,
            error: errorMessage,
          });

          return {
            status: 'error',
            failedStepIndex: index,
            exitCode: result.exitCode,
            error: errorMessage,
          };
        }
      } catch (error) {
        this.#flushStreamBuffer();

        const errorMessage = error instanceof Error ? error.message : String(error);

        this.#emit({
          type: 'error',
          timestamp: new Date().toISOString(),
          stepIndex: index,
          description: step.description,
          error: errorMessage,
        });

        return {
          status: 'error',
          failedStepIndex: index,
          error: errorMessage,
        };
      }
    }

    this.#flushStreamBuffer();
    this.#emit({
      type: 'complete',
      timestamp: new Date().toISOString(),
      totalSteps: steps.length,
    });

    return {
      status: 'complete',
    };
  }
}
