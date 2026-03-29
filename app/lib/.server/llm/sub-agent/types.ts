export type SubAgentState = 'idle' | 'planning' | 'executing' | 'paused' | 'completed' | 'failed' | 'cancelled';

export type SubAgentType = 'planner' | 'worker' | 'verifier' | 'custom';

export interface SubAgentMessage {
  id: string;
  from: string;
  to: string;
  timestamp: string;
  type: 'request' | 'response' | 'event' | 'error';
  payload: unknown;
}

export interface SubAgentMetadata {
  id: string;
  type: SubAgentType;
  parentId?: string;
  state: SubAgentState;
  model?: string;
  provider?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  plan?: string;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface SubAgentConfig {
  type: SubAgentType;
  model?: string;
  provider?: string;
  maxSteps?: number;
  priority?: number;
}

export type SubAgentExecutor = (
  agentId: string,
  messages: unknown[],
  config: SubAgentConfig,
  onProgress?: (state: SubAgentState, output: string) => void,
) => Promise<SubAgentExecutionResult>;

export interface SubAgentExecutionResult {
  success: boolean;
  output: string;
  messages: SubAgentMessage[];
  metadata: SubAgentMetadata;
}
