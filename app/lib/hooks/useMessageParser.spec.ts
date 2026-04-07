import type { Message } from 'ai';
import { describe, expect, it } from 'vitest';
import { extractMessageTextContent } from './useMessageParser';

describe('extractMessageTextContent', () => {
  it('joins all text content array parts instead of only the first one', () => {
    const message = {
      id: 'assistant-1',
      role: 'assistant',
      content: [
        { type: 'text', text: '<boltArtifact id="app" title="App" type="bundled">' },
        { type: 'text', text: '<boltAction type="file" filePath="src/App.tsx">hello</boltAction>' },
        { type: 'text', text: '</boltArtifact>' },
      ],
    } as unknown as Message;

    expect(extractMessageTextContent(message)).toBe(
      '<boltArtifact id="app" title="App" type="bundled"><boltAction type="file" filePath="src/App.tsx">hello</boltAction></boltArtifact>',
    );
  });

  it('falls back to message.parts text content when content is empty', () => {
    const message = {
      id: 'assistant-2',
      role: 'assistant',
      content: '',
      parts: [
        { type: 'text', text: 'first ' },
        { type: 'tool-invocation', toolInvocation: { toolName: 'ignored' } },
        { type: 'text', text: 'second' },
      ],
    } as unknown as Message;

    expect(extractMessageTextContent(message)).toBe('first second');
  });
});
