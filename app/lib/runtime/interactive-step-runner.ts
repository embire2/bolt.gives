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

export class InteractiveStepRunner extends EventTarget {
  #executor: StepExecutor;
  #socket?: StepEventSocket;

  constructor(executor: StepExecutor, socket?: StepEventSocket) {
    super();
    this.#executor = executor;
    this.#socket = socket;
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
            this.#emit({
              type: 'stdout',
              timestamp: new Date().toISOString(),
              stepIndex: index,
              description: step.description,
              output: chunk,
            });
          },
          onStderr: (chunk) => {
            this.#emit({
              type: 'stderr',
              timestamp: new Date().toISOString(),
              stepIndex: index,
              description: step.description,
              output: chunk,
            });
          },
        });

        this.#emit({
          type: 'step-end',
          timestamp: new Date().toISOString(),
          stepIndex: index,
          description: step.description,
          exitCode: result.exitCode,
          output: result.stdout,
        });

        if (result.exitCode !== 0) {
          const errorMessage = result.stderr || result.stdout || `Step failed with exit code ${result.exitCode}`;

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
