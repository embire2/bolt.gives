export type ContextAnnotation =
  | {
      type: 'codeContext';
      files: string[];
    }
  | {
      type: 'chatSummary';
      summary: string;
      chatId: string;
    };

export type ProgressAnnotation = {
  type: 'progress';
  label: string;
  status: 'in-progress' | 'complete';
  order: number;
  message: string;
};

export type AgentCommentaryPhase = 'plan' | 'action' | 'verification' | 'next-step' | 'recovery';

export type AgentCommentaryAnnotation = {
  type: 'agent-commentary';
  phase: AgentCommentaryPhase;
  status: 'in-progress' | 'complete' | 'warning' | 'recovered';
  order: number;
  message: string;
  detail?: string;
  timestamp: string;
};

export type ToolCallAnnotation = {
  type: 'toolCall';
  toolCallId: string;
  serverName: string;
  toolName: string;
  toolDescription: string;
};

export type ToolCallDataEvent = {
  type: 'tool-call';
  toolCallId: string;
  serverName: string;
  toolName: string;
  toolDescription: string;
  timestamp: string;
};

export type UsageDataEvent = {
  type: 'usage';
  completionTokens: number;
  promptTokens: number;
  totalTokens: number;
  timestamp: string;
};
