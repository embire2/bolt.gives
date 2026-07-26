import { describe, expect, it } from 'vitest';
import { EnhancedStreamingMessageParser } from './enhanced-message-parser';

describe('EnhancedStreamingMessageParser', () => {
  it('does not re-emit file actions when the same enhanced message streams additional text', () => {
    const openedActions: string[] = [];
    const closedActions: string[] = [];

    const parser = new EnhancedStreamingMessageParser({
      callbacks: {
        onActionOpen: (data) => {
          openedActions.push(data.actionId);
        },
        onActionClose: (data) => {
          closedActions.push(data.actionId);
        },
      },
    });

    const messageId = 'assistant-1';
    const partial = [
      "I'll create the file.",
      'src/App.tsx:',
      '```tsx',
      'export default function App() {',
      '  return <div>Doctor calendar</div>;',
      '}',
      '```',
    ].join('\n');

    const extended = `${partial}\n\nNext I will run install and start commands.`;

    parser.parse(messageId, partial);
    parser.parse(messageId, extended);

    expect(openedActions).toHaveLength(1);
    expect(closedActions).toHaveLength(1);
  });

  it('does not duplicate action callbacks when parsing identical enhanced content repeatedly', () => {
    const openedActions: string[] = [];
    const parser = new EnhancedStreamingMessageParser({
      callbacks: {
        onActionOpen: (data) => {
          openedActions.push(data.actionId);
        },
      },
    });

    const messageId = 'assistant-2';
    const message = [
      'main.tsx:',
      '```tsx',
      "import React from 'react';",
      "import ReactDOM from 'react-dom/client';",
      "import App from './App';",
      "ReactDOM.createRoot(document.getElementById('root')!).render(<App />);",
      '```',
    ].join('\n');

    parser.parse(messageId, message);
    parser.parse(messageId, message);

    expect(openedActions).toHaveLength(1);
  });
});
