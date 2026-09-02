type JsonRecord = Record<string, unknown>;

export const HOSTED_FREE_RESPONSES_WRITE_TOOL = 'write_file';

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function formatSseEvent(event: string, payload: unknown): string {
  return `${event ? `event: ${event}\n` : ''}data: ${JSON.stringify(payload)}`;
}

function escapeBoltFilePath(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function normalizeWorkspacePath(path: string): string {
  return path
    .replace(/^\/home\/project\//, '')
    .replace(/^\.\//, '')
    .replace(/^\//, '');
}

function isSafeWorkspacePath(path: string): boolean {
  return Boolean(path) && !path.split('/').some((segment) => segment === '..');
}

export function buildBoltArtifactFromHostedFreeResponsesToolInput(input: unknown): string {
  if (!isJsonRecord(input) || typeof input.path !== 'string' || typeof input.content !== 'string') {
    return '';
  }

  const path = normalizeWorkspacePath(input.path);

  if (!isSafeWorkspacePath(path)) {
    return '';
  }

  return `<boltArtifact id="free-responses-file" title="Project update">
<boltAction type="file" filePath="${escapeBoltFilePath(path)}">${input.content}</boltAction>
<boltAction type="start">
pnpm run dev
</boltAction>
</boltArtifact>`;
}

type ToolStreamState = {
  partialJsonByItemId: Map<string, string>;
  convertedItemIds: Set<string>;
};

function normalizeSseBlock(block: string, state: ToolStreamState): string | null {
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
    payload = JSON.parse(data);
  } catch {
    return block;
  }

  if (!isJsonRecord(payload)) {
    return formatSseEvent(event, payload);
  }

  if (
    payload.type === 'response.output_item.added' &&
    isJsonRecord(payload.item) &&
    payload.item.type === 'function_call' &&
    payload.item.name === HOSTED_FREE_RESPONSES_WRITE_TOOL
  ) {
    const itemId = String(payload.item.id || '');

    if (itemId) {
      state.convertedItemIds.add(itemId);
      state.partialJsonByItemId.set(itemId, typeof payload.item.arguments === 'string' ? payload.item.arguments : '');
    }

    return null;
  }

  const itemId = String(payload.item_id || (isJsonRecord(payload.item) ? payload.item.id || '' : ''));

  if (payload.type === 'response.function_call_arguments.delta' && state.convertedItemIds.has(itemId)) {
    state.partialJsonByItemId.set(
      itemId,
      `${state.partialJsonByItemId.get(itemId) || ''}${String(payload.delta || '')}`,
    );
    return null;
  }

  if (payload.type === 'response.function_call_arguments.done' && state.convertedItemIds.has(itemId)) {
    if (typeof payload.arguments === 'string') {
      state.partialJsonByItemId.set(itemId, payload.arguments);
    }

    return null;
  }

  if (payload.type === 'response.output_item.done' && state.convertedItemIds.has(itemId)) {
    const rawArguments =
      isJsonRecord(payload.item) && typeof payload.item.arguments === 'string'
        ? payload.item.arguments
        : state.partialJsonByItemId.get(itemId) || '';
    let artifact = '';

    try {
      artifact = buildBoltArtifactFromHostedFreeResponsesToolInput(JSON.parse(rawArguments));
    } catch {
      artifact = '';
    }

    state.partialJsonByItemId.delete(itemId);
    state.convertedItemIds.delete(itemId);

    if (!artifact) {
      return null;
    }

    return formatSseEvent('response.output_text.delta', {
      type: 'response.output_text.delta',
      delta: artifact,
    });
  }

  return formatSseEvent(event, payload);
}

export function normalizeHostedFreeResponsesSse(response: Response): Response {
  if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
    return response;
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';
  const toolState: ToolStreamState = {
    partialJsonByItemId: new Map(),
    convertedItemIds: new Set(),
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

          const normalizedBlock = normalizeSseBlock(block, toolState);

          if (normalizedBlock !== null) {
            controller.enqueue(encoder.encode(`${normalizedBlock}\n\n`));
          }
        }
      },
      flush(controller) {
        buffer += decoder.decode();

        if (buffer) {
          const normalizedBlock = normalizeSseBlock(buffer, toolState);

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
