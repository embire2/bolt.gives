import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SubAgentManager } from './sub-agent-manager';
import type { SubAgentConfig, SubAgentExecutionResult, SubAgentState } from './types';

describe('SubAgentManager', () => {
  let manager: SubAgentManager;

  beforeEach(() => {
    manager = SubAgentManager.getInstance();
    manager.reset();
  });

  it('should be a singleton', () => {
    const instance1 = SubAgentManager.getInstance();
    const instance2 = SubAgentManager.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('should spawn a new sub-agent', async () => {
    const config: SubAgentConfig = {
      type: 'planner',
      model: 'gpt-4',
      provider: 'openai',
    };

    const agentId = await manager.spawn(undefined, config);
    expect(agentId).toBeDefined();

    const agent = manager.getAgent(agentId);
    expect(agent).toBeDefined();
    expect(agent?.type).toBe('planner');
    expect(agent?.state).toBe('idle');
    expect(agent?.model).toBe('gpt-4');
    expect(agent?.provider).toBe('openai');
  });

  it('should spawn agents with parent relationship', async () => {
    const parentId = await manager.spawn(undefined, { type: 'planner' });
    const workerId = await manager.spawn(parentId, { type: 'worker' });

    const worker = manager.getAgent(workerId);
    expect(worker?.parentId).toBe(parentId);

    const children = manager.getAgentsByParent(parentId);
    expect(children).toHaveLength(1);
    expect(children[0].id).toBe(workerId);
  });

  it('should execute a registered executor', async () => {
    const mockExecutor = vi.fn().mockResolvedValue({
      success: true,
      output: 'Test output',
      messages: [],
      metadata: {
        id: 'test-agent',
        type: 'planner',
        state: 'completed',
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
    } as SubAgentExecutionResult);

    manager.registerExecutor('planner', mockExecutor);

    const agentId = await manager.spawn(undefined, { type: 'planner' });
    const result = await manager.start(agentId, []);

    expect(mockExecutor).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.output).toBe('Test output');

    const agent = manager.getAgent(agentId);
    expect(agent?.state).toBe('completed');
  });

  it('should handle executor failures', async () => {
    const mockExecutor = vi.fn().mockRejectedValue(new Error('Executor failed'));

    manager.registerExecutor('planner', mockExecutor);

    const agentId = await manager.spawn(undefined, { type: 'planner' });

    await expect(manager.start(agentId, [])).rejects.toThrow('Executor failed');

    const agent = manager.getAgent(agentId);
    expect(agent?.state).toBe('failed');
    expect(agent?.error).toBe('Executor failed');
  });

  it('should track token usage from executor', async () => {
    const mockExecutor = vi.fn().mockResolvedValue({
      success: true,
      output: 'Test output',
      messages: [],
      metadata: {
        id: 'test-agent',
        type: 'planner',
        state: 'completed',
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        tokenUsage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
      },
    } as SubAgentExecutionResult);

    manager.registerExecutor('planner', mockExecutor);

    const agentId = await manager.spawn(undefined, { type: 'planner' });
    await manager.start(agentId, []);

    const agent = manager.getAgent(agentId);
    expect(agent?.tokenUsage).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });
  });

  it('should cancel agents', async () => {
    const agentId = await manager.spawn(undefined, { type: 'planner' });

    manager.cancel(agentId);

    const agent = manager.getAgent(agentId);
    expect(agent?.state).toBe('cancelled');
    expect(agent?.completedAt).toBeDefined();
  });

  it('should not cancel completed agents', async () => {
    const agentId = await manager.spawn(undefined, { type: 'planner' });

    const mockExecutor = vi.fn().mockResolvedValue({
      success: true,
      output: 'Test output',
      messages: [],
      metadata: {
        id: agentId,
        type: 'planner',
        state: 'completed',
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
    } as SubAgentExecutionResult);

    manager.registerExecutor('planner', mockExecutor);
    await manager.start(agentId, []);

    expect(() => manager.cancel(agentId)).toThrow('Cannot cancel agent in state: completed');
  });

  it('should filter agents by state', async () => {
    await manager.spawn(undefined, { type: 'planner' });
    await manager.spawn(undefined, { type: 'worker' });

    // Both agents should be idle initially
    const idleAgents = manager.getAgentsByState('idle');
    expect(idleAgents).toHaveLength(2);

    const planners = manager.getAgentsByType('planner');
    const workers = manager.getAgentsByType('worker');

    expect(planners).toHaveLength(1);
    expect(workers).toHaveLength(1);
  });

  it('should filter agents by type', async () => {
    await manager.spawn(undefined, { type: 'planner' });
    await manager.spawn(undefined, { type: 'worker' });
    await manager.spawn(undefined, { type: 'verifier' });

    const planners = manager.getAgentsByType('planner');
    const workers = manager.getAgentsByType('worker');

    expect(planners).toHaveLength(1);
    expect(workers).toHaveLength(1);
  });

  it('should cleanup individual agents', async () => {
    const agentId = await manager.spawn(undefined, { type: 'planner' });
    expect(manager.getAgent(agentId)).toBeDefined();

    manager.cleanup(agentId);

    expect(manager.getAgent(agentId)).toBeUndefined();
  });

  it('should cleanup agents by parent', async () => {
    const parentId = await manager.spawn(undefined, { type: 'planner' });
    await manager.spawn(parentId, { type: 'worker' });
    await manager.spawn(parentId, { type: 'verifier' });

    expect(manager.getAgentsByParent(parentId)).toHaveLength(2);

    const count = manager.cleanupByParent(parentId);

    expect(count).toBe(2);
    expect(manager.getAgentsByParent(parentId)).toHaveLength(0);
  });

  it('should reject operations on non-existent agents', () => {
    expect(() => manager.pause('non-existent')).toThrow('Agent non-existent not found');
    expect(() => manager.resume('non-existent')).toThrow('Agent non-existent not found');
    expect(() => manager.cancel('non-existent')).toThrow('Agent non-existent not found');
  });

  it('should call progress callbacks during execution', async () => {
    const progressCallback = vi.fn();

    const mockExecutor = vi.fn(
      async (
        agentId: string,
        messages: unknown[],
        config: SubAgentConfig,
        onProgress?: (state: SubAgentState, output: string) => void,
      ) => {
        onProgress?.('planning', 'Starting...');
        onProgress?.('executing', 'Working...');

        return {
          success: true,
          output: 'Test output',
          messages: [],
          metadata: {
            id: agentId,
            type: 'planner',
            state: 'completed',
            createdAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          },
        } as SubAgentExecutionResult;
      },
    );

    manager.registerExecutor('planner', mockExecutor);

    const agentId = await manager.spawn(undefined, { type: 'planner' });
    await manager.start(agentId, [], progressCallback);

    expect(progressCallback).toHaveBeenCalledWith('planning', 'Starting...');
    expect(progressCallback).toHaveBeenCalledWith('executing', 'Working...');
  });
});
