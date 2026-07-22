import type { LanguageModelV1 } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import {
  FREE_HOSTED_API_BASE_URL,
  FREE_HOSTED_API_TOKEN_KEY,
  FREE_HOSTED_MODEL_MAX_COMPLETION_TOKENS,
  FREE_HOSTED_MODEL_MAX_TOKENS,
  FREE_HOSTED_MODELS,
  FREE_PROVIDER_NAME,
  resolveHostedFreeModel,
} from '~/lib/modules/llm/free-provider-config';
import type { IProviderSetting } from '~/types/model';

type JsonRecord = Record<string, unknown>;

const HOSTED_FREE_CLAUDE_WRITE_TOOL = 'write_file';

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeHostedFreeResponse(payload: unknown): unknown {
  if (!isJsonRecord(payload) || !Array.isArray(payload.output)) {
    return payload;
  }

  return {
    ...payload,
    incomplete_details: payload.incomplete_details ?? null,
    output: payload.output.map((item) => {
      if (!isJsonRecord(item) || item.type !== 'message' || !Array.isArray(item.content)) {
        return item;
      }

      return {
        ...item,
        content: item.content.map((part) =>
          isJsonRecord(part) && part.type === 'output_text' && !Array.isArray(part.annotations)
            ? { ...part, annotations: [] }
            : part,
        ),
      };
    }),
  };
}

function extractResponseInputText(item: JsonRecord): string {
  if (typeof item.content === 'string') {
    return item.content;
  }

  if (Array.isArray(item.content)) {
    return item.content
      .map((part) => {
        if (!isJsonRecord(part)) {
          return '';
        }

        if (typeof part.text === 'string') {
          return part.text;
        }

        if (typeof part.image_url === 'string') {
          return '[image attached]';
        }

        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  return '';
}

export function normalizeHostedFreeRequest(payload: unknown): unknown {
  if (!isJsonRecord(payload) || !Array.isArray(payload.input)) {
    return payload;
  }

  const instructions: string[] = typeof payload.instructions === 'string' ? [payload.instructions] : [];
  const conversation: string[] = [];

  for (const item of payload.input) {
    if (!isJsonRecord(item)) {
      continue;
    }

    if (item.role === 'system' || item.role === 'developer') {
      const text = extractResponseInputText(item);

      if (text) {
        instructions.push(text);
      }

      continue;
    }

    if (item.role === 'user' || item.role === 'assistant') {
      const text = extractResponseInputText(item);

      if (text) {
        conversation.push(`${String(item.role).toUpperCase()}:\n${text}`);
      }

      continue;
    }

    if (item.type === 'function_call') {
      conversation.push(
        `ASSISTANT TOOL CALL:\n${String(item.name || 'tool')}(${String(item.arguments || '{}')}) [call_id=${String(item.call_id || '')}]`,
      );
    } else if (item.type === 'function_call_output') {
      conversation.push(`TOOL RESULT [call_id=${String(item.call_id || '')}]:\n${String(item.output || '')}`);
    }
  }

  return {
    ...payload,
    instructions: instructions.filter(Boolean).join('\n\n'),
    input: conversation.join('\n\n'),
  };
}

const hostedFreeFetch: typeof fetch = async (input, init) => {
  let requestInit = init;

  if (typeof init?.body === 'string') {
    try {
      requestInit = { ...init, body: JSON.stringify(normalizeHostedFreeRequest(JSON.parse(init.body))) };
    } catch {
      // Leave non-JSON request bodies untouched.
    }
  }

  const response = await fetch(input, requestInit);

  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
    return response;
  }

  let payload: unknown;

  try {
    payload = await response.clone().json();
  } catch {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.delete('content-encoding');
  headers.delete('content-length');
  headers.delete('transfer-encoding');

  return new Response(JSON.stringify(normalizeHostedFreeResponse(payload)), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

export function normalizeHostedFreeClaudeStreamEvent(payload: unknown): unknown {
  if (!isJsonRecord(payload) || payload.type !== 'message_start' || !isJsonRecord(payload.message)) {
    return payload;
  }

  const usage = payload.message.usage;

  if (!isJsonRecord(usage) || typeof usage.output_tokens === 'number') {
    return payload;
  }

  return {
    ...payload,
    message: {
      ...payload.message,
      usage: {
        ...usage,
        output_tokens: 0,
      },
    },
  };
}

function extractHostedFreeClaudeSystemText(system: unknown): string {
  if (typeof system === 'string') {
    return system;
  }

  if (!Array.isArray(system)) {
    return '';
  }

  return system
    .map((part) => (isJsonRecord(part) && typeof part.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n');
}

function addHostedFreeClaudeContextToLatestUserMessage(messages: unknown, systemText: string): unknown {
  if (!Array.isArray(messages)) {
    return messages;
  }

  const latestUserIndex = messages.findLastIndex((message) => isJsonRecord(message) && message.role === 'user');

  if (latestUserIndex < 0) {
    return messages;
  }

  const latestUser = messages[latestUserIndex] as JsonRecord;
  const context = `BOLT HOSTED WORKSPACE INSTRUCTIONS AND CURRENT PROJECT SNAPSHOT:\n${systemText}\n\nCURRENT USER REQUEST:\n`;
  const content = latestUser.content;
  const nextContent = Array.isArray(content)
    ? [{ type: 'text', text: context }, ...content]
    : `${context}${String(content || '')}`;

  return messages.map((message, index) =>
    index === latestUserIndex
      ? {
          ...latestUser,
          content: nextContent,
        }
      : message,
  );
}

export function normalizeHostedFreeClaudeRequest(payload: unknown): unknown {
  if (!isJsonRecord(payload)) {
    return payload;
  }

  const systemText = extractHostedFreeClaudeSystemText(payload.system);

  if (!systemText.includes('CRITICAL OUTPUT CONTRACT:') || !systemText.includes('<boltArtifact')) {
    return payload;
  }

  const existingTools = Array.isArray(payload.tools) ? payload.tools : [];
  const tools = existingTools.filter(
    (tool) => !isJsonRecord(tool) || String(tool.name || '') !== HOSTED_FREE_CLAUDE_WRITE_TOOL,
  );

  tools.push({
    name: HOSTED_FREE_CLAUDE_WRITE_TOOL,
    description:
      'Change exactly one project file. For an existing file, return path plus the smallest unique exact find string and its replacement; do not return the complete file. Use content only when creating a new file. The platform applies and previews the result automatically.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Project-relative file path, for example src/App.tsx.' },
        find: { type: 'string', description: 'Small unique exact text currently present in an existing file.' },
        replace: { type: 'string', description: 'Replacement text for the exact find string.' },
        content: { type: 'string', description: 'Complete contents. Use only when the path is a new file.' },
      },
      required: ['path'],
      anyOf: [{ required: ['find', 'replace'] }, { required: ['content'] }],
      additionalProperties: false,
    },
  });

  return {
    ...payload,
    system: 'You are Bolt, a hosted coding agent. Follow the complete workspace instructions in the user message.',
    messages: addHostedFreeClaudeContextToLatestUserMessage(payload.messages, systemText),
    tools,
    tool_choice: { type: 'tool', name: HOSTED_FREE_CLAUDE_WRITE_TOOL },
  };
}

type HostedFreeClaudeToolStreamState = {
  partialJsonByIndex: Map<number, string>;
  convertedIndexes: Set<number>;
  workspaceFiles: Map<string, string>;
};

function formatHostedFreeClaudeSseEvent(event: string, payload: unknown): string {
  return `${event ? `event: ${event}\n` : ''}data: ${JSON.stringify(payload)}`;
}

function escapeBoltFilePath(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function normalizeHostedFreeClaudeWorkspacePath(path: string): string {
  return path
    .replace(/^\/home\/project\//, '')
    .replace(/^\.\//, '')
    .replace(/^\//, '');
}

function isSafeHostedFreeClaudeWorkspacePath(path: string): boolean {
  return Boolean(path) && !path.split('/').some((segment) => segment === '..');
}

function extractHostedFreeClaudeWorkspaceFiles(systemText: string): Map<string, string> {
  const files = new Map<string, string>();
  const fileActionPattern = /<boltAction\b[^>]*\btype="file"[^>]*\bfilePath="([^"]+)"[^>]*>([\s\S]*?)<\/boltAction>/g;

  for (const match of systemText.matchAll(fileActionPattern)) {
    files.set(normalizeHostedFreeClaudeWorkspacePath(match[1]), match[2]);
  }

  return files;
}

function buildBoltArtifactFromHostedFreeClaudeToolInput(input: unknown, workspaceFiles: Map<string, string>): string {
  if (!isJsonRecord(input) || typeof input.path !== 'string') {
    return '';
  }

  const path = normalizeHostedFreeClaudeWorkspacePath(input.path);

  if (!isSafeHostedFreeClaudeWorkspacePath(path)) {
    return '';
  }

  let content = typeof input.content === 'string' ? input.content : undefined;

  if (typeof input.find === 'string' && typeof input.replace === 'string') {
    const currentContent = workspaceFiles.get(path);
    const firstMatch = currentContent?.indexOf(input.find) ?? -1;

    if (!input.find || firstMatch < 0 || currentContent?.lastIndexOf(input.find) !== firstMatch) {
      return '';
    }

    content = `${currentContent?.slice(0, firstMatch)}${input.replace}${currentContent?.slice(firstMatch + input.find.length)}`;
  }

  if (content === undefined) {
    return '';
  }

  return `<boltArtifact id="free-claude-file" title="Project update">\n<boltAction type="file" filePath="${escapeBoltFilePath(path)}">${content}</boltAction>\n</boltArtifact>`;
}

function normalizeHostedFreeClaudeSseBlock(block: string, state: HostedFreeClaudeToolStreamState): string | null {
  const lines = block.split(/\r?\n/);
  const event =
    lines
      .find((line) => line.startsWith('event:'))
      ?.slice('event:'.length)
      .trim() || '';
  const dataLine = lines.find((line) => line.startsWith('data:'));

  if (!dataLine) {
    return block;
  }

  const data = dataLine.slice('data:'.length).trim();

  if (!data || data === '[DONE]') {
    return block;
  }

  let payload: unknown;

  try {
    payload = normalizeHostedFreeClaudeStreamEvent(JSON.parse(data));
  } catch {
    return block;
  }

  if (!isJsonRecord(payload)) {
    return formatHostedFreeClaudeSseEvent(event, payload);
  }

  const index = Number(payload.index);

  if (
    payload.type === 'content_block_start' &&
    Number.isInteger(index) &&
    isJsonRecord(payload.content_block) &&
    payload.content_block.type === 'tool_use' &&
    payload.content_block.name === HOSTED_FREE_CLAUDE_WRITE_TOOL
  ) {
    state.partialJsonByIndex.set(index, '');
    state.convertedIndexes.add(index);

    return formatHostedFreeClaudeSseEvent(event, {
      ...payload,
      content_block: { type: 'text', text: '' },
    });
  }

  if (
    payload.type === 'content_block_delta' &&
    state.convertedIndexes.has(index) &&
    isJsonRecord(payload.delta) &&
    payload.delta.type === 'input_json_delta'
  ) {
    state.partialJsonByIndex.set(
      index,
      `${state.partialJsonByIndex.get(index) || ''}${String(payload.delta.partial_json || '')}`,
    );

    return null;
  }

  if (payload.type === 'content_block_stop' && state.convertedIndexes.has(index)) {
    let artifact = '';

    try {
      artifact = buildBoltArtifactFromHostedFreeClaudeToolInput(
        JSON.parse(state.partialJsonByIndex.get(index) || '{}'),
        state.workspaceFiles,
      );
    } catch {
      artifact = '';
    }

    state.partialJsonByIndex.delete(index);

    if (!artifact) {
      return formatHostedFreeClaudeSseEvent(event, payload);
    }

    return `${formatHostedFreeClaudeSseEvent('content_block_delta', {
      type: 'content_block_delta',
      index,
      delta: { type: 'text_delta', text: artifact },
    })}\n\n${formatHostedFreeClaudeSseEvent(event, payload)}`;
  }

  if (
    payload.type === 'message_delta' &&
    state.convertedIndexes.size > 0 &&
    isJsonRecord(payload.delta) &&
    payload.delta.stop_reason === 'tool_use'
  ) {
    return formatHostedFreeClaudeSseEvent(event, {
      ...payload,
      delta: { ...payload.delta, stop_reason: 'end_turn' },
    });
  }

  return formatHostedFreeClaudeSseEvent(event, payload);
}

function normalizeHostedFreeClaudeSse(response: Response, workspaceFiles = new Map<string, string>()): Response {
  if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
    return response;
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';
  const toolState: HostedFreeClaudeToolStreamState = {
    partialJsonByIndex: new Map(),
    convertedIndexes: new Set(),
    workspaceFiles,
  };
  const body = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });

        while (true) {
          const boundary = buffer.match(/\r?\n\r?\n/);

          if (!boundary || boundary.index === undefined) {
            break;
          }

          const block = buffer.slice(0, boundary.index);
          buffer = buffer.slice(boundary.index + boundary[0].length);

          const normalizedBlock = normalizeHostedFreeClaudeSseBlock(block, toolState);

          if (normalizedBlock !== null) {
            controller.enqueue(encoder.encode(`${normalizedBlock}\n\n`));
          }
        }
      },
      flush(controller) {
        buffer += decoder.decode();

        if (buffer) {
          const normalizedBlock = normalizeHostedFreeClaudeSseBlock(buffer, toolState);

          if (normalizedBlock !== null) {
            controller.enqueue(encoder.encode(normalizedBlock));
          }
        }
      },
    }),
  );
  const headers = new Headers(response.headers);
  headers.delete('content-encoding');
  headers.delete('content-length');
  headers.delete('transfer-encoding');

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const hostedFreeClaudeFetch: typeof fetch = async (input, init) => {
  const requestHeaders = typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined;
  const headers = new Headers(init?.headers || requestHeaders);
  const apiKey = headers.get('x-api-key');

  if (apiKey && !headers.has('authorization')) {
    headers.set('authorization', `Bearer ${apiKey}`);
  }

  headers.delete('x-api-key');

  let requestInit = init;
  let workspaceFiles = new Map<string, string>();

  if (typeof init?.body === 'string') {
    try {
      const payload = JSON.parse(init.body);
      workspaceFiles = isJsonRecord(payload)
        ? extractHostedFreeClaudeWorkspaceFiles(extractHostedFreeClaudeSystemText(payload.system))
        : workspaceFiles;
      requestInit = { ...init, body: JSON.stringify(normalizeHostedFreeClaudeRequest(payload)) };
    } catch {
      // Leave non-JSON request bodies untouched.
    }
  }

  return normalizeHostedFreeClaudeSse(await fetch(input, { ...requestInit, headers }), workspaceFiles);
};

export function isHostedFreeClaudeModel(model: string): boolean {
  return model.startsWith('claude-');
}

export function clearHostedFreeModelResolution() {
  // Legacy helper retained for API compatibility with existing tests/callers.
}

export default class FreeProvider extends BaseProvider {
  name = FREE_PROVIDER_NAME;
  allowsUserApiKey = false;

  config = {
    apiTokenKey: FREE_HOSTED_API_TOKEN_KEY,
  };

  staticModels: ModelInfo[] = FREE_HOSTED_MODELS.map((model) => ({
    ...model,
    provider: FREE_PROVIDER_NAME,
    maxTokenAllowed: FREE_HOSTED_MODEL_MAX_TOKENS,
    maxCompletionTokens: FREE_HOSTED_MODEL_MAX_COMPLETION_TOKENS,
  }));

  getModelInstance(options: {
    model: string;
    serverEnv: Env;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): LanguageModelV1 {
    const { serverEnv, apiKeys, providerSettings } = options;
    const { apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: providerSettings?.[this.name],
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: FREE_HOSTED_API_TOKEN_KEY,
    });

    if (!apiKey) {
      throw new Error(`Missing API key for ${this.name} provider`);
    }

    const resolvedModel = resolveHostedFreeModel(options.model);

    if (isHostedFreeClaudeModel(resolvedModel)) {
      const magnetApi = createAnthropic({
        apiKey,
        baseURL: FREE_HOSTED_API_BASE_URL,
        fetch: hostedFreeClaudeFetch,
      });

      return magnetApi(resolvedModel) as LanguageModelV1;
    }

    const magnetApi = createOpenAI({
      apiKey,
      baseURL: FREE_HOSTED_API_BASE_URL,
      compatibility: 'strict',
      fetch: hostedFreeFetch,
    });

    return magnetApi.responses(resolvedModel) as LanguageModelV1;
  }
}
