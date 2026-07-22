import { describe, expect, it } from 'vitest';
import {
  ensureLatestUserMessageSelectionEnvelope,
  getMessageTextContent,
  resolvePreferredModelProvider,
  sanitizeSelectionWithApiKeys,
} from './message-selection';
import { FREE_HOSTED_MODEL } from '~/lib/modules/llm/free-provider-config';

describe('message-selection', () => {
  it('resolves provider and model from message history when request selection fields are absent', () => {
    const selection = resolvePreferredModelProvider(
      [
        {
          role: 'user' as const,
          content: '[Model: gpt-5.6-sol]\n\n[Provider: FREE]\n\nImprove the existing calendar.',
        },
      ],
      undefined,
      undefined,
    );

    expect(selection).toEqual({ model: 'gpt-5.6-sol', provider: 'FREE' });
  });

  it('prefers cookie selection when latest user message has no provider/model envelope', () => {
    const messages = [
      {
        role: 'user' as const,
        content: 'Create a mini React website',
      },
    ];

    const selection = resolvePreferredModelProvider(messages, 'gpt-5-codex', 'OpenAI');

    expect(selection.model).toBe('gpt-5-codex');
    expect(selection.provider).toBe('OpenAI');
  });

  it('injects provider/model envelope into the latest user message when missing', () => {
    const messages = [
      {
        role: 'user' as const,
        content: 'Build a small calendar app',
      },
    ];

    ensureLatestUserMessageSelectionEnvelope(messages, {
      model: 'gpt-5-codex',
      provider: 'OpenAI',
    });

    const updatedText = getMessageTextContent(messages[0]);
    expect(updatedText.startsWith('[Model: gpt-5-codex]\n\n[Provider: OpenAI]\n\n')).toBe(true);
    expect(updatedText).toContain('Build a small calendar app');
  });

  it('does not overwrite an existing provider/model envelope', () => {
    const originalContent = '[Model: gpt-5-codex]\n\n[Provider: OpenAI]\n\nCreate a mini dashboard and run it.';
    const messages = [
      {
        role: 'user' as const,
        content: originalContent,
      },
    ];

    ensureLatestUserMessageSelectionEnvelope(messages, {
      model: 'claude-3-5-sonnet-latest',
      provider: 'Anthropic',
    });

    expect(getMessageTextContent(messages[0])).toBe(originalContent);
  });

  it('falls back from invalid Bedrock credentials to a usable provider key', () => {
    const selection = sanitizeSelectionWithApiKeys({
      selection: {
        model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        provider: 'AmazonBedrock',
      },
      selectedProviderCookie: 'AmazonBedrock',
      apiKeys: {
        AmazonBedrock: 'not-json',
        OpenAI: 'sk-openai',
      },
    });

    expect(selection.provider).toBe('OpenAI');
  });

  it('keeps Bedrock when credentials are valid JSON', () => {
    const selection = sanitizeSelectionWithApiKeys({
      selection: {
        model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        provider: 'AmazonBedrock',
      },
      selectedProviderCookie: 'AmazonBedrock',
      apiKeys: {
        AmazonBedrock: JSON.stringify({
          region: 'us-east-1',
          accessKeyId: 'abc',
          secretAccessKey: 'xyz',
        }),
        OpenAI: 'sk-openai',
      },
    });

    expect(selection.provider).toBe('AmazonBedrock');
  });

  it('keeps an approved FREE model selected for the next prompt', () => {
    const selection = sanitizeSelectionWithApiKeys({
      selection: { model: 'claude-sonnet-5', provider: 'FREE' },
      apiKeys: { FREE: 'magnet-server-key' },
    });

    expect(selection).toEqual({ model: 'claude-sonnet-5', provider: 'FREE' });
  });

  it('does not allow a client to route FREE through an arbitrary model ID', () => {
    const selection = sanitizeSelectionWithApiKeys({
      selection: { model: 'unapproved/expensive-model', provider: 'FREE' },
      apiKeys: { FREE: 'magnet-server-key' },
    });

    expect(selection).toEqual({ model: FREE_HOSTED_MODEL, provider: 'FREE' });
  });
});
