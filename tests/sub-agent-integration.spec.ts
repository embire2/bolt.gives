import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SubAgentManager } from '~/lib/.server/llm/sub-agent';
import { AgentBus } from '~/lib/.server/llm/sub-agent';
import type { SubAgentConfig, SubAgentExecutionResult, SubAgentState } from '~/lib/.server/llm/sub-agent';

describe('Sub-Agent Framework Integration', () => {
  let manager: SubAgentManager;
  let agentBus: AgentBus;

  beforeEach(() => {
    manager = SubAgentManager.getInstance();
    agentBus = AgentBus.getInstance();
    manager.reset();
    agentBus.clearHistory();
  });

  it('should complete full manager/worker round-trip', async () => {
    // Track messages via AgentBus
    const messages: unknown[] = [];
    agentBus.subscribe('manager', (msg) => {
      messages.push(msg);
    });

    // Register a planner executor
    const plannerExecutor = vi
      .fn()
      .mockImplementation(
        async (
          agentId: string,
          msgs: unknown[],
          config: SubAgentConfig,
          onProgress?: (state: SubAgentState, output: string) => void,
        ) => {
          onProgress?.('planning', 'Analyzing...');
          onProgress?.('executing', 'Generating plan...');

          // Simulate some work
          await new Promise((resolve) => setTimeout(resolve, 10));

          return {
            success: true,
            output: '1. Create component\n2. Add tests\n3. Update docs',
            messages: [],
            metadata: {
              id: agentId,
              type: 'planner',
              state: 'completed' as const,
              model: config.model,
              provider: config.provider,
              createdAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
              plan: '1. Create component\n2. Add tests\n3. Update docs',
              tokenUsage: {
                promptTokens: 100,
                completionTokens: 50,
                totalTokens: 150,
              },
            },
          } as SubAgentExecutionResult;
        },
      );

    manager.registerExecutor('planner', plannerExecutor);

    // Register a worker executor
    const workerExecutor = vi
      .fn()
      .mockImplementation(
        async (
          agentId: string,
          msgs: unknown[],
          config: SubAgentConfig,
          onProgress?: (state: SubAgentState, output: string) => void,
        ) => {
          onProgress?.('planning', 'Understanding plan...');
          onProgress?.('executing', 'Executing tasks...');

          // Simulate work
          await new Promise((resolve) => setTimeout(resolve, 10));

          return {
            success: true,
            output: 'Component created, tests added, docs updated',
            messages: [],
            metadata: {
              id: agentId,
              type: 'worker',
              state: 'completed' as const,
              model: config.model,
              provider: config.provider,
              createdAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
              tokenUsage: {
                promptTokens: 200,
                completionTokens: 100,
                totalTokens: 300,
              },
            },
          } as SubAgentExecutionResult;
        },
      );

    manager.registerExecutor('worker', workerExecutor);

    // Manager spawns planner
    const plannerId = await manager.spawn('manager', {
      type: 'planner',
      model: 'gpt-4',
      provider: 'openai',
    });

    // Verify planner is idle
    let planner = manager.getAgent(plannerId);
    expect(planner?.state).toBe('idle');
    expect(planner?.parentId).toBe('manager');

    // Start planner
    const plannerResult = await manager.start(plannerId, [{ role: 'user', content: 'Create a component' }]);

    // Verify planner completed successfully
    expect(plannerResult.success).toBe(true);
    expect(plannerResult.output).toContain('Create component');
    expect(plannerResult.metadata.plan).toBeDefined();

    planner = manager.getAgent(plannerId);
    expect(planner?.state).toBe('completed');
    expect(planner?.tokenUsage?.totalTokens).toBe(150);

    // Verify agent bus received messages
    expect(messages.length).toBeGreaterThan(0);

    const spawnedEvent = messages.find((m: any) => m.payload?.action === 'spawned');
    expect(spawnedEvent).toBeDefined();
    expect((spawnedEvent as any).payload?.agentId).toBe(plannerId);

    // Manager spawns worker with plan context
    const workerId = await manager.spawn('manager', {
      type: 'worker',
      model: 'gpt-4',
      provider: 'openai',
    });

    // Verify worker has same parent
    let worker = manager.getAgent(workerId);
    expect(worker?.parentId).toBe('manager');
    expect(worker?.state).toBe('idle');

    // Start worker with plan
    const workerMessages = [
      { role: 'user', content: 'Create a component' },
      { role: 'system', content: `Plan: ${plannerResult.output}` },
    ];

    const workerResult = await manager.start(workerId, workerMessages);

    // Verify worker completed successfully
    expect(workerResult.success).toBe(true);
    expect(workerResult.output).toContain('Component created');

    worker = manager.getAgent(workerId);
    expect(worker?.state).toBe('completed');
    expect(worker?.tokenUsage?.totalTokens).toBe(300);

    // Verify both agents are tracked under parent
    const children = manager.getAgentsByParent('manager');
    expect(children).toHaveLength(2);
    expect(children.map((c) => c.id)).toContain(plannerId);
    expect(children.map((c) => c.id)).toContain(workerId);

    // Cleanup
    manager.cleanupByParent('manager');

    // Verify cleanup
    expect(manager.getAgent(plannerId)).toBeUndefined();
    expect(manager.getAgent(workerId)).toBeUndefined();
    expect(manager.getAgentsByParent('manager')).toHaveLength(0);
  });

  it('should handle pause/resume during execution', async () => {
    let shouldPause = false;
    let shouldResume = false;

    const executor = vi
      .fn()
      .mockImplementation(
        async (
          agentId: string,
          msgs: unknown[],
          config: SubAgentConfig,
          onProgress?: (state: SubAgentState, output: string) => void,
        ) => {
          onProgress?.('executing', 'Starting...');

          // Simulate long-running task
          for (let i = 0; i < 3; i++) {
            await new Promise((resolve) => setTimeout(resolve, 5));
            onProgress?.('executing', `Step ${i + 1}...`);

            // Simulate external pause
            if (i === 1 && shouldPause) {
              onProgress?.('paused', 'Paused by manager');

              // Wait for resume
              while (!shouldResume) {
                await new Promise((resolve) => setTimeout(resolve, 5));
              }
              onProgress?.('executing', 'Resumed...');
            }
          }

          return {
            success: true,
            output: 'Task completed',
            messages: [],
            metadata: {
              id: agentId,
              type: 'worker',
              state: 'completed' as const,
              createdAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
            },
          } as SubAgentExecutionResult;
        },
      );

    manager.registerExecutor('worker', executor);

    const agentId = await manager.spawn('manager', { type: 'worker' });
    shouldPause = true;

    // Start execution in background
    const executionPromise = manager.start(agentId, [], (_state, _output) => {
      // Progress callback
    });

    let agent: ReturnType<typeof manager.getAgent> | undefined;

    for (let i = 0; i < 20; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      agent = manager.getAgent(agentId);

      if (agent?.state === 'paused') {
        break;
      }
    }

    expect(agent?.state).toBe('paused');

    shouldResume = true;
    manager.resume(agentId);

    // Verify agent is executing again
    agent = manager.getAgent(agentId);
    expect(agent?.state).toBe('executing');

    // Wait for completion
    await executionPromise;

    // Verify final state
    agent = manager.getAgent(agentId);
    expect(agent?.state).toBe('completed');
  });

  it('should handle errors and recovery', async () => {
    const executor = vi.fn().mockRejectedValue(new Error('Simulated failure'));

    manager.registerExecutor('worker', executor);

    const agentId = await manager.spawn('manager', { type: 'worker' });

    // Try to start, should fail
    await expect(manager.start(agentId, [])).rejects.toThrow('Simulated failure');

    // Verify agent is in failed state
    const agent = manager.getAgent(agentId);
    expect(agent?.state).toBe('failed');
    expect(agent?.error).toBe('Simulated failure');
    expect(agent?.completedAt).toBeDefined();

    // Agent should not be cancelable after failure
    expect(() => manager.cancel(agentId)).toThrow('Cannot cancel agent in state: failed');
  });

  it('should support multiple independent agent hierarchies', async () => {
    const executor = vi.fn().mockResolvedValue({
      success: true,
      output: 'Done',
      messages: [],
      metadata: {
        id: 'test',
        type: 'worker',
        state: 'completed' as const,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
    } as SubAgentExecutionResult);

    manager.registerExecutor('worker', executor);

    // Create first hierarchy
    const parent1 = await manager.spawn(undefined, { type: 'planner' });
    const child1a = await manager.spawn(parent1, { type: 'worker' });
    const child1b = await manager.spawn(parent1, { type: 'worker' });

    // Create second hierarchy
    const parent2 = await manager.spawn(undefined, { type: 'planner' });
    const child2 = await manager.spawn(parent2, { type: 'worker' });

    // Verify hierarchies are separate
    const children1 = manager.getAgentsByParent(parent1);
    const children2 = manager.getAgentsByParent(parent2);

    expect(children1).toHaveLength(2);
    expect(children2).toHaveLength(1);
    expect(children1.map((c) => c.id)).toContain(child1a);
    expect(children1.map((c) => c.id)).toContain(child1b);
    expect(children2.map((c) => c.id)).toContain(child2);

    // Cleanup one hierarchy
    manager.cleanup(parent1);

    // Verify only one hierarchy remains
    expect(manager.getAgent(parent1)).toBeUndefined();
    expect(manager.getAgent(child1a)).toBeUndefined();
    expect(manager.getAgent(child1b)).toBeUndefined();
    expect(manager.getAgent(parent2)).toBeDefined();
    expect(manager.getAgent(child2)).toBeDefined();
  });
});
