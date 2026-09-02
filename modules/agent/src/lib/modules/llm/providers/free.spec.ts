import { afterEach, describe, expect, it, vi } from 'vitest';
import FreeProvider, {
  buildHostedFreeResponseStreamEvents,
  clearHostedFreeModelResolution,
  isHostedFreeClaudeModel,
  normalizeHostedFreeClaudeRequest,
  normalizeHostedFreeClaudeStreamEvent,
  normalizeHostedFreeRequest,
  normalizeHostedFreeResponse,
} from './free';
import {
  FREE_HOSTED_MODEL,
  FREE_HOSTED_MODEL_LABEL,
  FREE_HOSTED_MODELS,
} from '@bolt/agent/lib/modules/llm/free-provider-config';

const { anthropicModelSpy, createAnthropicSpy, responsesSpy, createOpenAISpy } = vi.hoisted(() => {
  const anthropicModelSpy = vi.fn();
  const createAnthropicSpy = vi.fn((_options?: { fetch?: typeof fetch }) => anthropicModelSpy);
  const responsesSpy = vi.fn();
  const createOpenAISpy = vi.fn((_options?: { fetch?: typeof fetch }) => ({
    responses: responsesSpy,
  }));

  return {
    anthropicModelSpy,
    createAnthropicSpy,
    responsesSpy,
    createOpenAISpy,
  };
});

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: createAnthropicSpy,
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: createOpenAISpy,
}));

describe('FreeProvider', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    clearHostedFreeModelResolution();
  });

  it('uses the dedicated server-side MagnetAPI key and falls back to the default for an unapproved model', () => {
    const provider = new FreeProvider();
    const modelInstance = { id: 'free-model-instance' };
    responsesSpy.mockReturnValue(modelInstance);

    const result = provider.getModelInstance({
      model: 'openai/gpt-4o',
      serverEnv: {
        MAGNET_API_KEY: 'magnet-test-key',
      } as unknown as Env,
    });

    expect(createOpenAISpy).toHaveBeenCalledWith({
      apiKey: 'magnet-test-key',
      baseURL: 'https://api.magnetapi.org/v1',
      compatibility: 'strict',
      fetch: expect.any(Function),
    });
    expect(responsesSpy).toHaveBeenCalledWith(FREE_HOSTED_MODEL);
    expect(result).toBe(modelInstance);
  });

  it('routes ChatGPT-5.6 SOL through the Responses transport', () => {
    const provider = new FreeProvider();
    responsesSpy.mockReturnValue({ id: FREE_HOSTED_MODEL });

    provider.getModelInstance({
      model: FREE_HOSTED_MODEL,
      serverEnv: { MAGNET_API_KEY: 'magnet-test-key' } as unknown as Env,
    });

    expect(responsesSpy).toHaveBeenCalledWith(FREE_HOSTED_MODEL);
    expect(createAnthropicSpy).not.toHaveBeenCalled();
  });

  it.each(FREE_HOSTED_MODELS.filter(({ name }) => isHostedFreeClaudeModel(name)))(
    'routes $label through the Claude-compatible Messages transport',
    ({ name }) => {
      const provider = new FreeProvider();
      anthropicModelSpy.mockReturnValue({ id: name });

      provider.getModelInstance({
        model: name,
        serverEnv: { MAGNET_API_KEY: 'magnet-test-key' } as unknown as Env,
      });

      expect(createAnthropicSpy).toHaveBeenCalledWith({
        apiKey: 'magnet-test-key',
        baseURL: 'https://api.magnetapi.org/v1',
        fetch: expect.any(Function),
      });
      expect(anthropicModelSpy).toHaveBeenCalledWith(name);
      expect(createOpenAISpy).not.toHaveBeenCalled();
    },
  );

  it('uses bearer authorization for Magnet Claude requests without retaining x-api-key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));

    const provider = new FreeProvider();
    anthropicModelSpy.mockReturnValue({ id: 'claude-model-instance' });

    provider.getModelInstance({
      model: 'claude-sonnet-5',
      serverEnv: { MAGNET_API_KEY: 'magnet-test-key' } as unknown as Env,
    });

    const customFetch = createAnthropicSpy.mock.calls[0]?.[0]?.fetch;
    await customFetch?.('https://api.magnetapi.org/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': 'magnet-test-key',
        'anthropic-version': '2023-06-01',
      },
      body: '{}',
    });

    const forwardedHeaders = new Headers(vi.mocked(fetch).mock.calls[0]?.[1]?.headers);
    expect(forwardedHeaders.get('authorization')).toBe('Bearer magnet-test-key');
    expect(forwardedHeaders.has('x-api-key')).toBe(false);
  });

  it('preserves request authentication when the SDK supplies separate init headers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));

    const provider = new FreeProvider();
    anthropicModelSpy.mockReturnValue({ id: 'claude-model-instance' });

    provider.getModelInstance({
      model: 'claude-sonnet-5',
      serverEnv: { MAGNET_API_KEY: 'magnet-test-key' } as unknown as Env,
    });

    const customFetch = createAnthropicSpy.mock.calls[0]?.[0]?.fetch;
    const request = new Request('https://api.magnetapi.org/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': 'magnet-test-key',
      },
    });

    await customFetch?.(request, {
      method: 'POST',
      headers: {
        'anthropic-version': '2023-06-01',
      },
      body: '{}',
    });

    const forwardedHeaders = new Headers(vi.mocked(fetch).mock.calls[0]?.[1]?.headers);
    expect(forwardedHeaders.get('authorization')).toBe('Bearer magnet-test-key');
    expect(forwardedHeaders.get('anthropic-version')).toBe('2023-06-01');
    expect(forwardedHeaders.has('x-api-key')).toBe(false);
  });

  it('adds the strict-SDK output token field to streamed Magnet Claude message starts', () => {
    expect(
      normalizeHostedFreeClaudeStreamEvent({
        type: 'message_start',
        message: {
          id: 'message-1',
          usage: { input_tokens: 0 },
        },
      }),
    ).toEqual({
      type: 'message_start',
      message: {
        id: 'message-1',
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    });
  });

  it('adds the native write-file bridge only to hosted Bolt build requests', () => {
    const buildRequest = normalizeHostedFreeClaudeRequest({
      system: 'CRITICAL OUTPUT CONTRACT:\nReturn <boltArtifact with file actions.',
      messages: [{ role: 'user', content: 'Update the app.' }],
    }) as Record<string, unknown>;
    const plainRequest = { system: 'Reply with OK.', messages: [{ role: 'user', content: 'OK?' }] };

    expect(buildRequest.tool_choice).toEqual({ type: 'tool', name: 'write_file' });
    expect(buildRequest.tools).toEqual([
      expect.objectContaining({
        name: 'write_file',
        input_schema: expect.objectContaining({ required: ['path', 'content'] }),
      }),
    ]);
    expect(buildRequest.messages).toEqual([
      expect.objectContaining({
        role: 'user',
        content: expect.stringContaining('CRITICAL OUTPUT CONTRACT:'),
      }),
    ]);
    expect(normalizeHostedFreeClaudeRequest(plainRequest)).toEqual(plainRequest);
  });

  it('normalizes chunked Magnet Claude SSE without buffering the response', async () => {
    const encoder = new TextEncoder();
    const chunks = [
      'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":0}',
      '}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n',
    ];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
        controller.close();
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream',
            'Content-Encoding': 'gzip',
            'Content-Length': '200',
          },
        }),
      ),
    );

    const provider = new FreeProvider();
    anthropicModelSpy.mockReturnValue({ id: 'claude-model-instance' });

    provider.getModelInstance({
      model: 'claude-sonnet-5',
      serverEnv: { MAGNET_API_KEY: 'magnet-test-key' } as unknown as Env,
    });

    const customFetch = createAnthropicSpy.mock.calls[0]?.[0]?.fetch;
    const response = await customFetch?.('https://api.magnetapi.org/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': 'magnet-test-key' },
      body: '{}',
    });
    const responseText = await response?.text();

    expect(responseText).toContain('"usage":{"input_tokens":0,"output_tokens":0}');
    expect(responseText).toContain('event: message_stop');
    expect(response?.headers.get('content-encoding')).toBeNull();
    expect(response?.headers.get('content-length')).toBeNull();
  });

  it('converts the native Magnet write-file stream into a Bolt file action', async () => {
    const encoder = new TextEncoder();
    const chunks = [
      'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":0}}}\n\n',
      'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"tool-1","name":"write_file","input":{}}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"path\\":\\"src/App.tsx\\","}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"\\"content\\":\\"export default function App(){return <h1>OK</h1>}\\"}"}}\n\n',
      'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"output_tokens":20}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
        controller.close();
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      ),
    );

    const provider = new FreeProvider();
    anthropicModelSpy.mockReturnValue({ id: 'claude-model-instance' });

    provider.getModelInstance({
      model: 'claude-sonnet-5',
      serverEnv: { MAGNET_API_KEY: 'magnet-test-key' } as unknown as Env,
    });

    const customFetch = createAnthropicSpy.mock.calls[0]?.[0]?.fetch;
    const response = await customFetch?.('https://api.magnetapi.org/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': 'magnet-test-key' },
      body: JSON.stringify({
        system: 'CRITICAL OUTPUT CONTRACT:\nReturn <boltArtifact with file actions.',
        messages: [{ role: 'user', content: 'Update the app.' }],
      }),
    });
    const responseText = await response?.text();
    const forwardedBody = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body));
    const textDeltaLine = responseText
      ?.split('\n')
      .find((line) => line.startsWith('data: ') && line.includes('"type":"text_delta"'));
    const artifact = textDeltaLine ? JSON.parse(textDeltaLine.slice('data: '.length)).delta.text : '';

    expect(forwardedBody.tool_choice).toEqual({ type: 'tool', name: 'write_file' });
    expect(artifact).toContain('<boltArtifact id="free-claude-file"');
    expect(artifact).toContain('<boltAction type="file" filePath="src/App.tsx">');
    expect(artifact).toContain('export default function App(){return <h1>OK</h1>}');
    expect(responseText).not.toContain('input_json_delta');
    expect(responseText).toContain('"stop_reason":"end_turn"');
  });

  it('reconstructs a complete workspace file from a minimal exact replacement', async () => {
    const encoder = new TextEncoder();
    const toolInput = JSON.stringify({
      path: '/home/project/src/App.tsx',
      find: '<h1>Existing app</h1>',
      replace: '<h1>Existing app</h1><p>Follow-up applied</p>',
    });
    const events = [
      ['message_start', { type: 'message_start', message: { usage: { input_tokens: 0 } } }],
      [
        'content_block_start',
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'tool_use', id: 'tool-1', name: 'write_file', input: {} },
        },
      ],
      [
        'content_block_delta',
        { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: toolInput } },
      ],
      ['content_block_stop', { type: 'content_block_stop', index: 0 }],
      [
        'message_delta',
        {
          type: 'message_delta',
          delta: { stop_reason: 'tool_use', stop_sequence: null },
          usage: { output_tokens: 20 },
        },
      ],
      ['message_stop', { type: 'message_stop' }],
    ];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        events.forEach(([event, payload]) =>
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)),
        );
        controller.close();
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      ),
    );

    const provider = new FreeProvider();
    anthropicModelSpy.mockReturnValue({ id: 'claude-model-instance' });

    provider.getModelInstance({
      model: 'claude-sonnet-5',
      serverEnv: { MAGNET_API_KEY: 'magnet-test-key' } as unknown as Env,
    });

    const customFetch = createAnthropicSpy.mock.calls[0]?.[0]?.fetch;
    const response = await customFetch?.('https://api.magnetapi.org/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': 'magnet-test-key' },
      body: JSON.stringify({
        system:
          'CRITICAL OUTPUT CONTRACT:\nReturn <boltArtifact with file actions.\n<boltAction type="file" filePath="src/App.tsx">export default function App() { return <h1>Existing app</h1>; }</boltAction>',
        messages: [{ role: 'user', content: 'Apply the follow-up.' }],
      }),
    });
    const responseText = await response?.text();
    const forwardedBody = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body));
    const textDeltaLine = responseText
      ?.split('\n')
      .find((line) => line.startsWith('data: ') && line.includes('"type":"text_delta"'));
    const artifact = textDeltaLine ? JSON.parse(textDeltaLine.slice('data: '.length)).delta.text : '';

    expect(forwardedBody.tools).toEqual([
      expect.objectContaining({
        name: 'write_file',
        input_schema: expect.objectContaining({
          required: ['path', 'find', 'replace'],
          properties: expect.not.objectContaining({ content: expect.anything() }),
        }),
      }),
    ]);
    expect(artifact).toContain(
      'export default function App() { return <h1>Existing app</h1><p>Follow-up applied</p>; }',
    );
    expect(artifact).not.toContain('"find"');
    expect(responseText).not.toContain('input_json_delta');
  });

  it('refuses to start when the dedicated server-side key is missing', () => {
    const provider = new FreeProvider();
    vi.stubEnv('MAGNET_API_KEY', '');

    expect(() =>
      provider.getModelInstance({
        model: FREE_HOSTED_MODEL,
        serverEnv: {} as Env,
      }),
    ).toThrow('Missing API key for FREE provider');
  });

  it('accepts the hydrated server-managed key when it is supplied through apiKeys', () => {
    const provider = new FreeProvider();
    const modelInstance = { id: 'free-model-instance' };
    responsesSpy.mockReturnValue(modelInstance);

    const result = provider.getModelInstance({
      model: FREE_HOSTED_MODEL,
      serverEnv: {} as Env,
      apiKeys: {
        FREE: 'magnet-relayed-key',
      },
    });

    expect(createOpenAISpy).toHaveBeenCalledWith({
      apiKey: 'magnet-relayed-key',
      baseURL: 'https://api.magnetapi.org/v1',
      compatibility: 'strict',
      fetch: expect.any(Function),
    });
    expect(responsesSpy).toHaveBeenCalledWith(FREE_HOSTED_MODEL);
    expect(result).toBe(modelInstance);
  });

  it('exposes all visible hosted FREE model labels expected by the UI', () => {
    const provider = new FreeProvider();
    expect(provider.staticModels[0]?.label).toBe(FREE_HOSTED_MODEL_LABEL);
    expect(provider.staticModels.map((model) => model.label)).toEqual(FREE_HOSTED_MODELS.map((model) => model.label));
  });

  it('normalizes Magnet Responses payloads for the strict SDK schema', () => {
    expect(
      normalizeHostedFreeResponse({
        id: 'response-1',
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: 'Ready' }],
          },
          { type: 'function_call', call_id: 'call-1', name: 'write_file', arguments: '{}' },
        ],
      }),
    ).toEqual({
      id: 'response-1',
      incomplete_details: null,
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: 'Ready', annotations: [] }],
        },
        { type: 'function_call', call_id: 'call-1', name: 'write_file', arguments: '{}' },
      ],
    });
  });

  it('converts structured Responses input into Magnet-compatible history text', () => {
    expect(
      normalizeHostedFreeRequest({
        model: 'claude-sonnet-5',
        input: [
          { role: 'system', content: 'You are a coding agent.' },
          { role: 'user', content: [{ type: 'input_text', text: 'Build a calendar.' }] },
          { role: 'assistant', content: [{ type: 'output_text', text: 'I created App.tsx.' }] },
          { role: 'user', content: [{ type: 'input_text', text: 'Add reminders.' }] },
        ],
      }),
    ).toEqual({
      model: 'claude-sonnet-5',
      instructions: 'You are a coding agent.',
      input: 'USER:\nBuild a calendar.\n\nASSISTANT:\nI created App.tsx.\n\nUSER:\nAdd reminders.',
    });
  });

  it('forces hosted Responses builds through one strict file action', () => {
    const normalized = normalizeHostedFreeRequest({
      model: 'gpt-5.6-sol',
      stream: true,
      input: [
        {
          role: 'system',
          content: 'CRITICAL OUTPUT CONTRACT:\nReturn <boltArtifact with file actions.',
        },
        { role: 'user', content: [{ type: 'input_text', text: 'Build a calendar.' }] },
      ],
      tools: [{ type: 'function', name: 'unrelated_tool' }],
    }) as Record<string, unknown>;

    expect(normalized).toMatchObject({
      stream: true,
      tool_choice: { type: 'function', name: 'write_file' },
      parallel_tool_calls: false,
      max_tool_calls: 1,
      reasoning: { effort: 'low' },
      text: { verbosity: 'low' },
    });
    expect(normalized.tools).toEqual([
      expect.objectContaining({
        type: 'function',
        name: 'write_file',
        strict: true,
        parameters: expect.objectContaining({ required: ['path', 'content'], additionalProperties: false }),
      }),
    ]);
  });

  it('converts a streamed Responses write tool into one executable Bolt artifact', async () => {
    const encoder = new TextEncoder();
    const toolArguments = JSON.stringify({
      path: '/home/project/src/main.js',
      content: "document.querySelector('#app').textContent = 'Calendar ready';",
    });
    const events = [
      {
        type: 'response.created',
        response: { id: 'response-1', created_at: 1_788_108_608, model: 'gpt-5.6-sol' },
      },
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: { id: 'function-1', type: 'function_call', name: 'write_file', arguments: '' },
      },
      {
        type: 'response.function_call_arguments.delta',
        item_id: 'function-1',
        output_index: 0,
        delta: toolArguments.slice(0, 24),
      },
      {
        type: 'response.function_call_arguments.delta',
        item_id: 'function-1',
        output_index: 0,
        delta: toolArguments.slice(24),
      },
      {
        type: 'response.function_call_arguments.done',
        item_id: 'function-1',
        output_index: 0,
        name: 'write_file',
        arguments: toolArguments,
      },
      {
        type: 'response.output_item.done',
        output_index: 0,
        item: {
          id: 'function-1',
          type: 'function_call',
          name: 'write_file',
          arguments: toolArguments,
        },
      },
      {
        type: 'response.completed',
        response: { incomplete_details: null, usage: { input_tokens: 20, output_tokens: 10 } },
      },
    ];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const body = events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('');
        controller.enqueue(encoder.encode(body.slice(0, 173)));
        controller.enqueue(encoder.encode(body.slice(173)));
        controller.close();
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream',
            'Content-Encoding': 'gzip',
            'Content-Length': '999',
          },
        }),
      ),
    );

    const provider = new FreeProvider();
    responsesSpy.mockReturnValue({ id: 'free-model-instance' });
    provider.getModelInstance({
      model: FREE_HOSTED_MODEL,
      serverEnv: { MAGNET_API_KEY: 'magnet-test-key' } as unknown as Env,
    });

    const customFetch = createOpenAISpy.mock.calls[0]?.[0]?.fetch;
    const response = await customFetch?.('https://api.magnetapi.org/v1/responses', {
      method: 'POST',
      body: JSON.stringify({
        model: 'gpt-5.6-sol',
        stream: true,
        input: [
          {
            role: 'system',
            content: 'CRITICAL OUTPUT CONTRACT:\nReturn <boltArtifact with file actions.',
          },
          { role: 'user', content: [{ type: 'input_text', text: 'Build a calendar.' }] },
        ],
      }),
    });
    const forwardedBody = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body));
    const responseText = await response?.text();
    const artifactEvent = responseText
      ?.split('\n')
      .find((line) => line.startsWith('data: ') && line.includes('response.output_text.delta'));
    const artifact = artifactEvent ? JSON.parse(artifactEvent.slice('data: '.length)).delta : '';

    expect(forwardedBody.tool_choice).toEqual({ type: 'function', name: 'write_file' });
    expect(artifact).toContain('<boltArtifact id="free-responses-file"');
    expect(artifact).toContain('<boltAction type="file" filePath="src/main.js">');
    expect(artifact).toContain("document.querySelector('#app').textContent = 'Calendar ready';");
    expect(artifact).toContain('<boltAction type="start">\npnpm run dev');
    expect(responseText).not.toContain('response.function_call_arguments');
    expect(responseText).not.toContain('"type":"function_call"');
    expect(response?.headers.get('content-encoding')).toBeNull();
    expect(response?.headers.get('content-length')).toBeNull();
  });

  it('normalizes successful JSON responses before the strict SDK parses them', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 'response-1',
            output: [{ type: 'message', content: [{ type: 'output_text', text: 'Ready' }] }],
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Content-Encoding': 'gzip',
              'Content-Length': '123',
            },
          },
        ),
      ),
    );

    const provider = new FreeProvider();
    responsesSpy.mockReturnValue({ id: 'free-model-instance' });

    provider.getModelInstance({
      model: FREE_HOSTED_MODEL,
      serverEnv: { MAGNET_API_KEY: 'magnet-test-key' } as unknown as Env,
    });

    const customFetch = createOpenAISpy.mock.calls[0]?.[0]?.fetch;
    const response = await customFetch?.('https://api.magnetapi.org/v1/responses', {
      method: 'POST',
      body: JSON.stringify({
        input: [
          { role: 'system', content: 'System prompt' },
          { role: 'user', content: [{ type: 'input_text', text: 'User task' }] },
        ],
      }),
    });
    const forwardedInit = vi.mocked(fetch).mock.calls[0]?.[1];

    expect(response?.headers.get('content-encoding')).toBeNull();
    expect(response?.headers.get('content-length')).toBeNull();
    expect(JSON.parse(String(forwardedInit?.body))).toMatchObject({
      instructions: 'System prompt',
      input: 'USER:\nUser task',
    });
    expect(await response?.json()).toEqual({
      id: 'response-1',
      incomplete_details: null,
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: 'Ready', annotations: [] }],
        },
      ],
    });
  });

  it('converts completed Magnet Responses JSON into SDK-compatible stream events', () => {
    const events = buildHostedFreeResponseStreamEvents({
      id: 'resp-1',
      created_at: 1_788_108_608,
      model: 'gpt-5.6-sol',
      status: 'completed',
      incomplete_details: null,
      output: [
        {
          id: 'message-1',
          type: 'message',
          content: [{ type: 'output_text', text: '<boltArtifact>ready</boltArtifact>', annotations: [] }],
        },
        {
          id: 'function-1',
          type: 'function_call',
          call_id: 'call-1',
          name: 'write_file',
          arguments: '{"path":"src/App.tsx"}',
        },
      ],
      usage: { input_tokens: 40, output_tokens: 20 },
    });

    expect(events.map((event) => event.type)).toEqual([
      'response.created',
      'response.output_text.delta',
      'response.output_item.added',
      'response.function_call_arguments.delta',
      'response.output_item.done',
      'response.completed',
    ]);
    expect(events.at(-1)).toMatchObject({
      response: { usage: { input_tokens: 40, output_tokens: 20 } },
    });
  });

  it('keeps streaming enabled and converts completed JSON responses into stream events', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 'resp-stream-shim',
            created_at: 1_788_108_608,
            model: 'gpt-5.6-sol',
            status: 'completed',
            incomplete_details: null,
            output: [
              {
                id: 'message-stream-shim',
                type: 'message',
                content: [{ type: 'output_text', text: 'streamed through shim', annotations: [] }],
              },
            ],
            usage: { input_tokens: 10, output_tokens: 4 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    const provider = new FreeProvider();
    responsesSpy.mockReturnValue({ id: 'free-model-instance' });
    provider.getModelInstance({
      model: FREE_HOSTED_MODEL,
      serverEnv: { MAGNET_API_KEY: 'magnet-test-key' } as unknown as Env,
    });

    const customFetch = createOpenAISpy.mock.calls[0]?.[0]?.fetch;
    const response = await customFetch?.('https://api.magnetapi.org/v1/responses', {
      method: 'POST',
      body: JSON.stringify({ model: 'gpt-5.6-sol', input: 'Build it', stream: true }),
    });
    const forwardedBody = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body));
    const body = await response?.text();

    expect(forwardedBody.stream).toBe(true);
    expect(response?.headers.get('content-type')).toContain('text/event-stream');
    expect(body).toContain('response.output_text.delta');
    expect(body).toContain('streamed through shim');
    expect(body).toContain('response.completed');
    expect(body).toContain('data: [DONE]');
  });
});
