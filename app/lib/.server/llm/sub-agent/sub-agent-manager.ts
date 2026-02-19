import { generateId } from 'ai';
import { AgentBus } from './agent-bus';
import type {
  SubAgentConfig,
  SubAgentExecutionResult,
  SubAgentMetadata,
  SubAgentState,
  SubAgentType,
} from './types';

type SubAgentExecutor = (
  agentId: string,
  messages: unknown[],
  config: SubAgentConfig,
  onProgress?: (state: SubAgentState, output: string) => void,
) => Promise<SubAgentExecutionResult>;

class SubAgentManager {
  private static instance: SubAgentManager;
  private agents: Map<string, SubAgentMetadata>;
  private executors: Map<SubAgentType, SubAgentExecutor>;
  private agentBus: AgentBus;

  private constructor() {
    this.agents = new Map();
    this.executors = new Map();
    this.agentBus = AgentBus.getInstance();
  }

  static getInstance(): SubAgentManager {
    if (!SubAgentManager.instance) {
      SubAgentManager.instance = new SubAgentManager();
    }
    return SubAgentManager.instance;
  }

  registerExecutor(type: SubAgentType, executor: SubAgentExecutor): void {
    this.executors.set(type, executor);
  }

  async spawn(
    parentId: string | undefined,
    config: SubAgentConfig,
    initialMessages: unknown[] = [],
  ): Promise<string> {
    const agentId = generateId();
    const metadata: SubAgentMetadata = {
      id: agentId,
      type: config.type,
      parentId,
      state: 'idle',
      model: config.model,
      provider: config.provider,
      createdAt: new Date().toISOString(),
    };

    this.agents.set(agentId, metadata);

    this.agentBus.publish({
      id: generateId(),
      from: 'system',
      to: parentId || 'manager',
      timestamp: new Date().toISOString(),
      type: 'event',
      payload: { agentId, action: 'spawned', metadata },
    });

    return agentId;
  }

  async start(
    agentId: string,
    messages: unknown[],
    onProgress?: (state: SubAgentState, output: string) => void,
  ): Promise<SubAgentExecutionResult> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const executor = this.executors.get(agent.type);
    if (!executor) {
      throw new Error(`No executor registered for agent type: ${agent.type}`);
    }

    this.updateAgentState(agentId, 'planning');
    onProgress?.('planning', '');

    const startTime = Date.now();

    try {
      agent.startedAt = new Date().toISOString();
      this.updateAgentState(agentId, 'executing');
      onProgress?.('executing', '');

      const config: SubAgentConfig = {
        type: agent.type,
        model: agent.model,
        provider: agent.provider,
      };

      const result = await executor(agentId, messages, config, (state, output) => {
        this.updateAgentState(agentId, state);
        onProgress?.(state, output);
      });

      agent.completedAt = new Date().toISOString();
      agent.state = 'completed';
      agent.tokenUsage = result.metadata.tokenUsage;
      agent.plan = result.metadata.plan;

      this.agents.set(agentId, agent);

      const elapsedMs = Date.now() - startTime;

      this.agentBus.publish({
        id: generateId(),
        from: agentId,
        to: agent.parentId || 'manager',
        timestamp: new Date().toISOString(),
        type: 'response',
        payload: {
          agentId,
          state: 'completed',
          elapsedMs,
          output: result.output,
          tokenUsage: result.metadata.tokenUsage,
        },
      });

      return result;
    } catch (error) {
      agent.state = 'failed';
      agent.error = error instanceof Error ? error.message : String(error);
      agent.completedAt = new Date().toISOString();

      this.agents.set(agentId, agent);

      this.agentBus.publish({
        id: generateId(),
        from: agentId,
        to: agent.parentId || 'manager',
        timestamp: new Date().toISOString(),
        type: 'error',
        payload: {
          agentId,
          state: 'failed',
          error: agent.error,
        },
      });

      throw error;
    }
  }

  pause(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    if (agent.state !== 'planning' && agent.state !== 'executing') {
      throw new Error(`Cannot pause agent in state: ${agent.state}`);
    }

    this.updateAgentState(agentId, 'paused');

    this.agentBus.publish({
      id: generateId(),
      from: 'system',
      to: agent.parentId || 'manager',
      timestamp: new Date().toISOString(),
      type: 'event',
      payload: { agentId, action: 'paused' },
    });
  }

  resume(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    if (agent.state !== 'paused') {
      throw new Error(`Cannot resume agent in state: ${agent.state}`);
    }

    this.updateAgentState(agentId, 'executing');

    this.agentBus.publish({
      id: generateId(),
      from: 'system',
      to: agent.parentId || 'manager',
      timestamp: new Date().toISOString(),
      type: 'event',
      payload: { agentId, action: 'resumed' },
    });
  }

  cancel(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const currentState = agent.state;

    this.updateAgentState(agentId, 'cancelled');
    agent.completedAt = new Date().toISOString();

    this.agentBus.publish({
      id: generateId(),
      from: 'system',
      to: agent.parentId || 'manager',
      timestamp: new Date().toISOString(),
      type: 'event',
      payload: { agentId, action: 'cancelled', previousState: currentState },
    });
  }

  getAgent(agentId: string): SubAgentMetadata | undefined {
    return this.agents.get(agentId);
  }

  getAllAgents(): SubAgentMetadata[] {
    return Array.from(this.agents.values());
  }

  getAgentsByParent(parentId: string): SubAgentMetadata[] {
    return Array.from(this.agents.values()).filter((agent) => agent.parentId === parentId);
  }

  getAgentsByState(state: SubAgentState): SubAgentMetadata[] {
    return Array.from(this.agents.values()).filter((agent) => agent.state === state);
  }

  getAgentsByType(type: SubAgentType): SubAgentMetadata[] {
    return Array.from(this.agents.values()).filter((agent) => agent.type === type);
  }

  private updateAgentState(agentId: string, newState: SubAgentState): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.state = newState;
      this.agents.set(agentId, agent);
    }
  }

  cleanup(agentId: string): void {
    this.agents.delete(agentId);
  }

  cleanupByParent(parentId: string): number {
    let count = 0;
    for (const [agentId, agent] of this.agents.entries()) {
      if (agent.parentId === parentId) {
        this.agents.delete(agentId);
        count++;
      }
    }
    return count;
  }

  reset(): void {
    this.agents.clear();
  }
}

export { SubAgentManager };
