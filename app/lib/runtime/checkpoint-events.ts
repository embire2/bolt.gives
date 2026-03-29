import type { CheckpointDataEvent, CheckpointType } from '~/types/context';

type ToolCallLike = {
  toolName?: string;
  toolCallId?: string;
  args?: unknown;
};

type ToolResultLike = {
  toolName?: string;
  toolCallId?: string;
  result?: unknown;
};

export interface ExecutionFailureDetail {
  toolName: string;
  command: string;
  exitCode: number;
  stderr: string;
}

interface CheckpointExtractionInput {
  toolCalls: ToolCallLike[];
  toolResults: ToolResultLike[];
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function toStringValue(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return '';
}

function toNumberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function extractCommand(args: unknown): string {
  if (typeof args === 'string') {
    return args.trim();
  }

  if (Array.isArray(args)) {
    return args
      .map((item) => toStringValue(item))
      .filter(Boolean)
      .join(' ');
  }

  const record = toRecord(args);

  if (!record) {
    return '';
  }

  const direct = ['command', 'cmd', 'script', 'shellCommand']
    .map((key) => toStringValue(record[key]))
    .find((value) => value.length > 0);

  if (direct) {
    return direct;
  }

  if (Array.isArray(record.args)) {
    return record.args
      .map((item) => toStringValue(item))
      .filter(Boolean)
      .join(' ');
  }

  return '';
}

function extractExitCode(result: unknown): number | undefined {
  const record = toRecord(result);

  if (!record) {
    return undefined;
  }

  return (
    toNumberValue(record.exitCode) ||
    toNumberValue(record.exit_code) ||
    toNumberValue(record.code) ||
    toNumberValue(record.statusCode) ||
    toNumberValue(record.status_code)
  );
}

function extractStderr(result: unknown): string {
  const record = toRecord(result);

  if (!record) {
    return '';
  }

  return (
    toStringValue(record.stderr) ||
    toStringValue(record.error) ||
    toStringValue(record.message) ||
    toStringValue(record.output)
  );
}

function stringifyResult(result: unknown): string {
  if (typeof result === 'string') {
    return result;
  }

  if (!result) {
    return '';
  }

  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

function classifyCheckpoint(toolName: string, command: string, resultText: string): CheckpointType | null {
  const normalizedCommand = command.toLowerCase();
  const normalizedTool = toolName.toLowerCase();
  const normalizedText = resultText.toLowerCase();

  if (
    /(pnpm|npm|yarn)\s+(install|i)\b/.test(normalizedCommand) ||
    normalizedText.includes('dependencies') ||
    normalizedText.includes('packages:')
  ) {
    return 'install-done';
  }

  if (
    /(pnpm|npm|yarn)\s+(dev|start|preview)\b/.test(normalizedCommand) ||
    normalizedText.includes('local:') ||
    normalizedText.includes('preview ready') ||
    normalizedText.includes('http://localhost')
  ) {
    return 'preview-ready';
  }

  if (/(pnpm|npm|yarn)\s+(test|lint|typecheck)\b/.test(normalizedCommand) || normalizedTool.includes('test')) {
    return 'test-result';
  }

  if (
    normalizedTool.includes('deploy') ||
    /wrangler|vercel|netlify|deploy/.test(normalizedCommand) ||
    normalizedText.includes('deployed')
  ) {
    return 'deploy-result';
  }

  return null;
}

function detectFailure(exitCode: number | undefined, stderr: string, resultText: string): boolean {
  if (typeof exitCode === 'number' && exitCode !== 0) {
    return true;
  }

  if (stderr.trim().length > 0) {
    return true;
  }

  return /(error|failed|exception|traceback)/i.test(resultText);
}

export function extractExecutionFailure(input: CheckpointExtractionInput): ExecutionFailureDetail | null {
  for (const toolResult of input.toolResults) {
    const toolName = toolResult.toolName || 'unknown-tool';
    const linkedCall = input.toolCalls.find(
      (toolCall) =>
        (toolCall.toolCallId && toolResult.toolCallId && toolCall.toolCallId === toolResult.toolCallId) ||
        (toolCall.toolName && toolCall.toolName === toolResult.toolName),
    );
    const command = extractCommand(linkedCall?.args);
    const exitCode = extractExitCode(toolResult.result);
    const stderr = extractStderr(toolResult.result);
    const resultText = stringifyResult(toolResult.result);

    if (!detectFailure(exitCode, stderr, resultText)) {
      continue;
    }

    return {
      toolName,
      command: command || '(no command provided)',
      exitCode: typeof exitCode === 'number' ? exitCode : 1,
      stderr: stderr || resultText || 'Unknown error',
    };
  }

  return null;
}

function buildCheckpointMessage(checkpointType: CheckpointType, hasFailure: boolean): string {
  const suffix = hasFailure ? 'failed' : 'completed';

  switch (checkpointType) {
    case 'install-done':
      return `Dependency installation ${suffix}.`;
    case 'preview-ready':
      return `Preview startup ${suffix}.`;
    case 'test-result':
      return `Verification command ${suffix}.`;
    case 'deploy-result':
      return `Deployment step ${suffix}.`;
    case 'checkpoint':
    default:
      return `Execution checkpoint ${suffix}.`;
  }
}

export function extractCheckpointEvents(input: CheckpointExtractionInput): CheckpointDataEvent[] {
  const timestamp = new Date().toISOString();
  const events: CheckpointDataEvent[] = [];
  const toolNames = input.toolCalls.map((toolCall) => toolCall.toolName).filter(Boolean) as string[];

  if (toolNames.length > 0 || input.toolResults.length > 0) {
    events.push({
      type: 'checkpoint',
      checkpointType: 'checkpoint',
      status: 'complete',
      message:
        toolNames.length > 0 ? `Step checkpoint reached for: ${toolNames.join(', ')}` : 'Step checkpoint reached.',
      timestamp,
    });
  }

  for (const toolResult of input.toolResults) {
    const toolName = toolResult.toolName || 'unknown-tool';
    const linkedCall = input.toolCalls.find(
      (toolCall) =>
        (toolCall.toolCallId && toolResult.toolCallId && toolCall.toolCallId === toolResult.toolCallId) ||
        (toolCall.toolName && toolCall.toolName === toolResult.toolName),
    );
    const command = extractCommand(linkedCall?.args);
    const resultText = stringifyResult(toolResult.result);
    const checkpointType = classifyCheckpoint(toolName, command, resultText);

    if (!checkpointType) {
      continue;
    }

    const exitCode = extractExitCode(toolResult.result);
    const stderr = extractStderr(toolResult.result);
    const failed = detectFailure(exitCode, stderr, resultText);

    events.push({
      type: 'checkpoint',
      checkpointType,
      status: failed ? 'error' : 'complete',
      message: buildCheckpointMessage(checkpointType, failed),
      timestamp,
      ...(command ? { command } : {}),
      ...(typeof exitCode === 'number' ? { exitCode } : {}),
      ...(stderr ? { stderr } : {}),
    });
  }

  return events;
}
