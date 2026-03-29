import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentBus } from './agent-bus';
import type { SubAgentMessage } from './types';

describe('AgentBus', () => {
  let agentBus: AgentBus;

  beforeEach(() => {
    agentBus = AgentBus.getInstance();
    agentBus.clearHistory();
    agentBus.clearAllSubscribers();
  });

  it('should be a singleton', () => {
    const instance1 = AgentBus.getInstance();
    const instance2 = AgentBus.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('should subscribe and receive messages', async () => {
    const handler = vi.fn();
    agentBus.subscribe('agent-1', handler);

    const message: SubAgentMessage = {
      id: 'msg-1',
      from: 'agent-2',
      to: 'agent-1',
      timestamp: new Date().toISOString(),
      type: 'request',
      payload: { test: 'data' },
    };

    await agentBus.publish(message);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'msg-1',
        from: 'agent-2',
        to: 'agent-1',
        type: 'request',
        payload: { test: 'data' },
      }),
    );
  });

  it('should unsubscribe correctly', async () => {
    const handler = vi.fn();
    const unsubscribe = agentBus.subscribe('agent-1', handler);

    unsubscribe();

    const message: SubAgentMessage = {
      id: 'msg-1',
      from: 'agent-2',
      to: 'agent-1',
      timestamp: new Date().toISOString(),
      type: 'request',
      payload: { test: 'data' },
    };

    await agentBus.publish(message);

    expect(handler).not.toHaveBeenCalled();
  });

  it('should maintain message history', async () => {
    const message: SubAgentMessage = {
      id: 'msg-1',
      from: 'agent-1',
      to: 'agent-2',
      timestamp: new Date().toISOString(),
      type: 'request',
      payload: { test: 'data' },
    };

    await agentBus.publish(message);

    const history = agentBus.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0]).toEqual(expect.objectContaining({ id: 'msg-1' }));
  });

  it('should filter history by agent ID', async () => {
    const message1: SubAgentMessage = {
      id: 'msg-1',
      from: 'agent-1',
      to: 'agent-2',
      timestamp: new Date().toISOString(),
      type: 'request',
      payload: { test: 'data1' },
    };

    const message2: SubAgentMessage = {
      id: 'msg-2',
      from: 'agent-2',
      to: 'agent-1',
      timestamp: new Date().toISOString(),
      type: 'response',
      payload: { test: 'data2' },
    };

    await agentBus.publish(message1);
    await agentBus.publish(message2);

    const agent1History = agentBus.getHistory('agent-1');
    expect(agent1History).toHaveLength(2);

    const agent2History = agentBus.getHistory('agent-2');
    expect(agent2History).toHaveLength(2);
  });

  it('should limit history size', async () => {
    const smallBus = AgentBus.createForTest(3);

    for (let i = 0; i < 5; i++) {
      const message: SubAgentMessage = {
        id: `msg-${i}`,
        from: 'agent-1',
        to: 'agent-2',
        timestamp: new Date().toISOString(),
        type: 'request',
        payload: { index: i },
      };

      await smallBus.publish(message);
    }

    const history = smallBus.getHistory();
    expect(history).toHaveLength(3);
    expect(history[0].id).toBe('msg-2');
    expect(history[2].id).toBe('msg-4');
  });

  it('should return subscriber count', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    agentBus.subscribe('agent-1', handler1);
    expect(agentBus.getSubscriberCount('agent-1')).toBe(1);

    agentBus.subscribe('agent-1', handler2);
    expect(agentBus.getSubscriberCount('agent-1')).toBe(2);

    expect(agentBus.getSubscriberCount('agent-2')).toBe(0);
  });

  it('should list all subscribers', () => {
    agentBus.subscribe('agent-1', vi.fn());
    agentBus.subscribe('agent-2', vi.fn());
    agentBus.subscribe('agent-3', vi.fn());

    const subscribers = agentBus.getAllSubscribers();
    expect(subscribers).toHaveLength(3);
    expect(subscribers).toContain('agent-1');
    expect(subscribers).toContain('agent-2');
    expect(subscribers).toContain('agent-3');
  });
});
