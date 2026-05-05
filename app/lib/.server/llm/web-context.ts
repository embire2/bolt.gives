import { browsePageWithPlaywright, type BrowserPageResponse } from '~/lib/.server/web-browse-client';
import { isAllowedUrl } from '~/utils/url';

export const WEBSITE_SOURCE_CONTEXT_MARKER = '[Website source context gathered by bolt.gives]';

const URL_RE = /https?:\/\/[^\s<>"')\]}]+/gi;
const TRAILING_PUNCTUATION_RE = /[.,;:!?]+$/;
const DEFAULT_MAX_URLS = 2;
const DEFAULT_MAX_CHARS_PER_URL = 6000;

type TextContentPart = {
  type?: string;
  text?: string;
  [key: string]: unknown;
};

type TextChatMessage = {
  role: string;
  content?: string | Array<string | TextContentPart>;
  parts?: Array<string | TextContentPart>;
};

export type WebsiteSourceContextResult<TMessage extends TextChatMessage = TextChatMessage> = {
  messages: TMessage[];
  sources: BrowserPageResponse[];
  failures: Array<{ url: string; error: string }>;
  urls: string[];
};

function extractTextFromValue(value: TextChatMessage['content'] | TextChatMessage['parts']): string {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }

        return part?.type === 'text' && typeof part.text === 'string' ? part.text : '';
      })
      .filter(Boolean)
      .join('\n');
  }

  return '';
}

function isTextPart(part: string | TextContentPart): part is TextContentPart & { text: string } {
  return typeof part === 'object' && part !== null && part.type === 'text' && typeof part.text === 'string';
}

function getMessageText(message: TextChatMessage): string {
  return [extractTextFromValue(message.content), extractTextFromValue(message.parts)].filter(Boolean).join('\n');
}

export function extractPublicUrlsFromText(text: string, maxUrls = DEFAULT_MAX_URLS): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const match of text.matchAll(URL_RE)) {
    const candidate = match[0].replace(TRAILING_PUNCTUATION_RE, '');

    try {
      const normalized = new URL(candidate).toString();

      if (!isAllowedUrl(normalized) || seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);
      urls.push(normalized);

      if (urls.length >= maxUrls) {
        break;
      }
    } catch {
      // Ignore malformed URL-like text.
    }
  }

  return urls;
}

function formatWebsiteSourceContext(sources: BrowserPageResponse[]): string {
  const sections = sources.map((source, index) =>
    [
      `## Source ${index + 1}: ${source.finalUrl || source.url}`,
      source.title ? `Title: ${source.title}` : '',
      source.description ? `Description: ${source.description}` : '',
      source.headings?.length
        ? `Headings:\n${source.headings
            .slice(0, 16)
            .map((heading) => `- ${heading}`)
            .join('\n')}`
        : '',
      '',
      'Extracted page content:',
      source.content,
    ]
      .filter(Boolean)
      .join('\n'),
  );

  return [
    WEBSITE_SOURCE_CONTEXT_MARKER,
    '',
    'Use the following scraped website source as concrete input for the user request. Preserve useful facts, copy, sections, services, navigation labels, and calls to action, but create original code and styling for the new project.',
    '',
    ...sections,
  ].join('\n');
}

function appendContextToParts(
  parts: Array<string | TextContentPart>,
  context: string,
): Array<string | TextContentPart> {
  const nextParts = [...parts];
  const lastTextPartIndex = nextParts.findLastIndex(isTextPart);

  if (lastTextPartIndex >= 0) {
    const part = nextParts[lastTextPartIndex];

    if (!isTextPart(part)) {
      return nextParts;
    }

    nextParts[lastTextPartIndex] = {
      ...part,
      text: `${part.text.trim()}\n\n${context}`,
    };

    return nextParts;
  }

  return [...nextParts, { type: 'text', text: context }];
}

function appendContextToMessage<TMessage extends TextChatMessage>(message: TMessage, context: string): TMessage {
  const nextMessage: TextChatMessage = { ...message };

  if (typeof message.content === 'string') {
    nextMessage.content = `${message.content.trim()}\n\n${context}`.trim();
  } else if (Array.isArray(message.content)) {
    nextMessage.content = appendContextToParts(message.content, context);
  } else if (!Array.isArray(message.parts)) {
    nextMessage.content = context;
  }

  if (Array.isArray(message.parts)) {
    nextMessage.parts = appendContextToParts(message.parts, context);

    if (!message.content) {
      const originalText = extractTextFromValue(message.parts).trim();
      nextMessage.content = originalText ? `${originalText}\n\n${context}` : context;
    }
  }

  return nextMessage as TMessage;
}

export async function hydrateWebsiteSourceContext<TMessage extends TextChatMessage>(
  messages: TMessage[],
  options: {
    env?: Env;
    maxUrls?: number;
    maxCharsPerUrl?: number;
  } = {},
): Promise<WebsiteSourceContextResult<TMessage>> {
  const latestUserIndex = messages.map((message) => message.role).lastIndexOf('user');

  if (latestUserIndex < 0) {
    return { messages, sources: [], failures: [], urls: [] };
  }

  const latestUserMessage = messages[latestUserIndex];
  const latestUserText = getMessageText(latestUserMessage);

  if (latestUserText.includes(WEBSITE_SOURCE_CONTEXT_MARKER) || latestUserText.includes('[Web content from ')) {
    return { messages, sources: [], failures: [], urls: [] };
  }

  const urls = extractPublicUrlsFromText(latestUserText, options.maxUrls ?? DEFAULT_MAX_URLS);

  if (!urls.length) {
    return { messages, sources: [], failures: [], urls: [] };
  }

  const sources: BrowserPageResponse[] = [];
  const failures: Array<{ url: string; error: string }> = [];
  const maxCharsPerUrl = options.maxCharsPerUrl ?? DEFAULT_MAX_CHARS_PER_URL;

  for (const url of urls) {
    try {
      sources.push(await browsePageWithPlaywright({ url, maxChars: maxCharsPerUrl }, { env: options.env }));
    } catch (error) {
      failures.push({
        url,
        error: error instanceof Error ? error.message : 'Unknown web browse error',
      });
    }
  }

  if (!sources.length) {
    return { messages, sources, failures, urls };
  }

  const nextMessages = [...messages];
  nextMessages[latestUserIndex] = appendContextToMessage(latestUserMessage, formatWebsiteSourceContext(sources));

  return { messages: nextMessages, sources, failures, urls };
}
