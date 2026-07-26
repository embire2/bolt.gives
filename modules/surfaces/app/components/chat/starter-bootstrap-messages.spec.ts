import { describe, expect, it } from 'vitest';
import { buildStarterBootstrapMessages } from './starter-bootstrap-messages';

describe('buildStarterBootstrapMessages', () => {
  it('includes the continuation prompt after the starter assistant message', () => {
    const messages = buildStarterBootstrapMessages({
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      userMessageText: 'Build a calendar app',
      starterAssistantMessage: '<boltArtifact id="starter" />',
      continuationMessageText: 'Continue from the imported starter files.',
    });

    expect(messages).toHaveLength(3);
    expect(messages[0]).toMatchObject({
      id: 'user-1',
      role: 'user',
      content: 'Build a calendar app',
    });
    expect(messages[1]).toMatchObject({
      id: 'assistant-1',
      role: 'assistant',
      content: '<boltArtifact id="starter" />',
    });
    expect(messages[2]).toMatchObject({
      id: 'assistant-1-continue',
      role: 'user',
      content: 'Continue from the imported starter files.',
    });
  });

  it('can mark the continuation prompt as hidden when requested', () => {
    const messages = buildStarterBootstrapMessages({
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      userMessageText: 'Build a calendar app',
      starterAssistantMessage: '<boltArtifact id="starter" />',
      continuationMessageText: 'Continue from the imported starter files.',
      hideContinuationMessage: true,
    });

    expect(messages[2]).toMatchObject({
      id: 'assistant-1-continue',
      role: 'user',
      content: 'Continue from the imported starter files.',
      annotations: ['hidden'],
    });
  });

  it('omits the hidden continuation prompt when it is blank', () => {
    const messages = buildStarterBootstrapMessages({
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      userMessageText: 'Build a calendar app',
      starterAssistantMessage: '<boltArtifact id="starter" />',
      continuationMessageText: '   ',
    });

    expect(messages).toHaveLength(2);
  });
});
