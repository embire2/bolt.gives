import type { SubAgentMessage } from './types';

type MessageHandler = (message: SubAgentMessage) => void | Promise<void>;

class AgentBus {
  private static _instance: AgentBus;
  private _subscribers: Map<string, Set<MessageHandler>>;
  private _messageHistory: SubAgentMessage[];
  private _maxHistorySize: number;

  private constructor(maxHistorySize = 1000) {
    this._subscribers = new Map();
    this._messageHistory = [];
    this._maxHistorySize = maxHistorySize;
  }

  static getInstance(): AgentBus {
    if (!AgentBus._instance) {
      AgentBus._instance = new AgentBus();
    }

    return AgentBus._instance;
  }

  static createForTest(maxHistorySize = 1000): AgentBus {
    return new AgentBus(maxHistorySize);
  }

  subscribe(agentId: string, handler: MessageHandler): () => void {
    if (!this._subscribers.has(agentId)) {
      this._subscribers.set(agentId, new Set());
    }

    this._subscribers.get(agentId)!.add(handler);

    return () => {
      this.unsubscribe(agentId, handler);
    };
  }

  unsubscribe(agentId: string, handler: MessageHandler): void {
    const handlers = this._subscribers.get(agentId);

    if (handlers) {
      handlers.delete(handler);

      if (handlers.size === 0) {
        this._subscribers.delete(agentId);
      }
    }
  }

  async publish(message: SubAgentMessage): Promise<void> {
    const timestamp = new Date().toISOString();
    const messageWithTimestamp = { ...message, timestamp };

    this.addToHistory(messageWithTimestamp);

    const handlers = this._subscribers.get(message.to);

    if (handlers) {
      await Promise.allSettled(Array.from(handlers).map((handler) => handler(messageWithTimestamp)));
    }
  }

  addToHistory(message: SubAgentMessage): void {
    this._messageHistory.push(message);

    if (this._messageHistory.length > this._maxHistorySize) {
      this._messageHistory.shift();
    }
  }

  getHistory(agentId?: string, limit = 100): SubAgentMessage[] {
    let messages = this._messageHistory;

    if (agentId) {
      messages = messages.filter((msg) => msg.from === agentId || msg.to === agentId);
    }

    return messages.slice(-limit);
  }

  clearHistory(): void {
    this._messageHistory = [];
  }

  getSubscriberCount(agentId: string): number {
    return this._subscribers.get(agentId)?.size || 0;
  }

  getAllSubscribers(): string[] {
    return Array.from(this._subscribers.keys());
  }

  clearAllSubscribers(): void {
    this._subscribers.clear();
  }
}

export { AgentBus };
