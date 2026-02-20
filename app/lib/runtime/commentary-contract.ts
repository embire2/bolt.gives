import type { AgentCommentaryPhase } from '~/types/context';

export interface CommentaryContractInput {
  phase: AgentCommentaryPhase;
  message: string;
  detail?: string;
}

export interface CommentaryContractOutput {
  message: string;
  detail: string;
}

const COMMENTARY_MAX_MESSAGE_LENGTH = 160;

const DEFAULT_NEXT_BY_PHASE: Record<AgentCommentaryPhase, string> = {
  plan: 'Gathering context and preparing an execution plan.',
  action: 'Running the next action and streaming progress.',
  verification: 'Validating the latest output before continuing.',
  'next-step': 'Preparing the next visible step for the user.',
  recovery: 'Applying recovery safeguards and retry logic as needed.',
};

function normalizeWhitespace(input: string): string {
  return input.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
}

function toPlainEnglish(input: string): string {
  return normalizeWhitespace(input)
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\bstderr\b/gi, 'error output')
    .replace(/\bstdout\b/gi, 'command output')
    .replace(/\bexit code\b/gi, 'status code')
    .replace(/\bsub-agent\b/gi, 'assistant helper')
    .replace(/\btool calls?\b/gi, 'actions')
    .replace(/\bJSON\b/gi, 'structured data')
    .replace(/\bLLM\b/gi, 'AI model');
}

function toMicroUpdate(message: string): string {
  const normalized = toPlainEnglish(message);

  if (normalized.length <= COMMENTARY_MAX_MESSAGE_LENGTH) {
    return normalized;
  }

  const sentence = normalized.split(/(?<=[.!?])\s+/)[0]?.trim();

  if (sentence && sentence.length <= COMMENTARY_MAX_MESSAGE_LENGTH) {
    return sentence;
  }

  return `${normalized.slice(0, COMMENTARY_MAX_MESSAGE_LENGTH - 1).trimEnd()}...`;
}

function extractSection(detail: string | undefined, sectionName: 'Key changes' | 'Next'): string | undefined {
  if (!detail) {
    return undefined;
  }

  const pattern = new RegExp(`${sectionName}:\\s*([\\s\\S]*?)(?=\\n(?:Key changes|Next):|$)`, 'i');
  const match = detail.match(pattern);

  if (!match?.[1]) {
    return undefined;
  }

  return normalizeWhitespace(match[1]);
}

function toDetailValue(input: string, fallback = 'None yet.'): string {
  const normalized = toPlainEnglish(input);
  return normalized.length > 0 ? normalized : fallback;
}

export function enforceCommentaryContract(input: CommentaryContractInput): CommentaryContractOutput {
  const microMessage = toMicroUpdate(input.message || 'Working...');
  const keyChanges = toDetailValue(extractSection(input.detail, 'Key changes') || microMessage);
  const nextStep = toDetailValue(extractSection(input.detail, 'Next') || DEFAULT_NEXT_BY_PHASE[input.phase]);

  return {
    message: microMessage,
    detail: `Key changes: ${keyChanges}\nNext: ${nextStep}`,
  };
}
