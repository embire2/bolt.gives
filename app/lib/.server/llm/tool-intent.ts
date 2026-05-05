import type { Message } from 'ai';

const WEB_INTENT_RE =
  /\b(web\s*search|search the web|browse|playwright|documentation|docs|api docs|api documentation|reference docs|study (this|these)|read (this|these) (url|link)|crawl|scrape)\b/i;
const URL_RE = /https?:\/\/[^\s]+/i;
const WEBSITE_SOURCE_CONTEXT_MARKER = '[Website source context gathered by bolt.gives]';

function extractTextContent(message: Omit<Message, 'id'>): string {
  if (Array.isArray(message.content)) {
    return message.content
      .filter((part): part is Extract<(typeof message.content)[number], { type: 'text' }> => part.type === 'text')
      .map((part) => part.text || '')
      .join('\n');
  }

  return message.content || '';
}

export function shouldEnableBuiltInWebTools(messages: Array<Omit<Message, 'id'>>): boolean {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];

    if (message.role !== 'user') {
      continue;
    }

    const userText = extractTextContent(message).trim();

    if (!userText) {
      continue;
    }

    if (userText.includes(WEBSITE_SOURCE_CONTEXT_MARKER)) {
      return false;
    }

    if (URL_RE.test(userText)) {
      return true;
    }

    return WEB_INTENT_RE.test(userText);
  }

  return false;
}
