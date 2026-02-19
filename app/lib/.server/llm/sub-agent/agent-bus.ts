import { generateId } from 'ai';
import type { SubAgentMessage } from './types';

type MessageHandler = (message: SubAgentMessage) => void | Promise<void>;

class AgentBus {
  private static instance: AgentBus;
  private subscribers: Map<string, Set<MessageHandler>>;
  private messageHistory: SubAgentMessage[];
  private maxHistorySize: number;

  private constructor(maxHistorySize = 1000) {
    this.subscribers = new Map();
    this.messageHistory = [];
    this.maxHistorySize = maxHistorySize;
  }

  static getInstance(): AgentBus {
    if (!AgentBus.instance) {
      AgentBus.instance = new AgentBus();
    }
    return AgentBus.instance;
  }

  subscribe(agentId: string, handler: MessageHandler): () => void {
    if (!this.subscribers.has(agentId)) {
      this.subscribers.set(agentId, new Set());
    }

    this.subscribers.get(agentId)!.add(handler);

    return () => {
      this.unsubscribe(agentId, handler);
    };
  }

  unsubscribe(agentId: string, handler: MessageHandler): void {
    const handlers = this.subscribers.get(agentId);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.subscribers.delete(agentId);
      }
    }
  }

  async publish(message: SubAgentMessage): Promise<void> {
    const timestamp = new Date().toISOString();
    const messageWithTimestamp = { ...message, timestamp };

    this.addToHistory(messageWithTimestamp);

    const handlers = this.subscribers.get(message.to);
    if (handlers) {
      await Promise.allSettled(
        Array.from(handlers).map((handler) => handler(messageWithTimestamp)),
      );
    }
  }

  addToHistory(message: SubAgentMessage): void {
    this.messageHistory.push(message);
    if (this.messageHistory.length > this.maxHistorySize) {
      this.messageHistory.shift();
    }
  }

  getHistory(agentId?: string, limit = 100): SubAgentMessage[] {
    let messages = this.messageHistory;

    if (agentId) {
      messages = messages.filter(
        (msg) => msg.from === agentId || msg.to === agentId,
      );
    }

    return messages.slice(-limit);
  }

  clearHistory(): void {
    this.messageHistory = [];
  }

  getSubscriberCount(agentId: string): number {
    return this.subscribers.get(agentId)?.size || 0;
  }

  getAllSubscribers(): string[] {
    return Array.from(this.subscribers.keys());
  }

  clearAllSubscribers(): void {
    this.subscribers.clear();
  }
}

export { AgentBus };
