import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAGNET_API_BASE_URL, MAGNET_API_PROVIDER_NAME } from '@bolt/agent/lib/modules/llm/magnet-api-provider-config';
import MagnetApiProvider from './magnet-api';

const { anthropicModelSpy, createAnthropicSpy, responsesSpy, createOpenAISpy } = vi.hoisted(() => {
  const anthropicModelSpy = vi.fn();
  const createAnthropicSpy = vi.fn((_options?: { fetch?: typeof fetch }) => anthropicModelSpy);
  const responsesSpy = vi.fn();
  const createOpenAISpy = vi.fn((_options?: { fetch?: typeof fetch }) => ({ responses: responsesSpy }));

  return { anthropicModelSpy, createAnthropicSpy, responsesSpy, createOpenAISpy };
});

vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: createAnthropicSpy }));
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: createOpenAISpy }));

describe('MagnetApiProvider', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('exposes the requested Frontier model choices with verified MagnetAPI model IDs', () => {
    const provider = new MagnetApiProvider();

    expect(provider.staticModels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'gpt-5.6-sol', label: 'ChatGPT-Luna - Medium effort' }),
        expect.objectContaining({ name: 'gpt-5.6-sol-ultra', label: 'ChatGPT-5.6 Ultra' }),
        expect.objectContaining({ name: 'claude-opus-5', label: 'Opus 5' }),
        expect.objectContaining({ name: 'claude-fable-5', label: expect.stringContaining('Fable 5.1') }),
      ]),
    );
  });

  it('never falls back to the operator-funded FREE credential', () => {
    const provider = new MagnetApiProvider();

    expect(() =>
      provider.getModelInstance({
        model: 'gpt-5.6-sol-ultra',
        serverEnv: { MAGNET_API_KEY: 'operator-secret' } as unknown as Env,
      }),
    ).toThrow('Missing API key for MagnetAPI provider');
    expect(createOpenAISpy).not.toHaveBeenCalled();
  });

  it('routes GPT models through MagnetAPI Responses with the user key', () => {
    const provider = new MagnetApiProvider();
    responsesSpy.mockReturnValue({ id: 'magnet-gpt' });

    const result = provider.getModelInstance({
      model: 'gpt-5.6-sol-ultra',
      serverEnv: {} as Env,
      apiKeys: { MagnetAPI: 'magnet-user-key' },
      providerSettings: { MagnetAPI: { baseUrl: 'http://127.0.0.1:4321/private' } },
    });

    expect(createOpenAISpy).toHaveBeenCalledWith({
      apiKey: 'magnet-user-key',
      baseURL: MAGNET_API_BASE_URL,
      compatibility: 'strict',
      fetch: expect.any(Function),
    });
    expect(responsesSpy).toHaveBeenCalledWith('gpt-5.6-sol-ultra');
    expect(result).toEqual({ id: 'magnet-gpt' });
  });

  it('routes Claude models through MagnetAPI Messages with the user key', () => {
    const provider = new MagnetApiProvider();
    anthropicModelSpy.mockReturnValue({ id: 'magnet-claude' });

    const result = provider.getModelInstance({
      model: 'claude-opus-5',
      serverEnv: {} as Env,
      apiKeys: { MagnetAPI: 'magnet-user-key' },
    });

    expect(createAnthropicSpy).toHaveBeenCalledWith({
      apiKey: 'magnet-user-key',
      baseURL: MAGNET_API_BASE_URL,
      fetch: expect.any(Function),
    });
    expect(anthropicModelSpy).toHaveBeenCalledWith('claude-opus-5');
    expect(result).toEqual({ id: 'magnet-claude' });
  });

  it('loads and normalizes the live key-scoped model catalog', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      Response.json({
        data: [
          { id: 'claude-opus-5', display_name: 'Opus 5', context_window: 200000 },
          { id: 'claude-fable-5', display_name: 'Fable 5' },
          { id: 'claude-opus-5', display_name: 'Duplicate' },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const provider = new MagnetApiProvider();

    const models = await provider.getDynamicModels({ MagnetAPI: 'magnet-user-key' });

    expect(fetchSpy).toHaveBeenCalledWith(`${MAGNET_API_BASE_URL}/models`, {
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer magnet-user-key',
      },
      signal: expect.any(AbortSignal),
    });
    expect(models).toEqual([
      expect.objectContaining({
        name: 'claude-opus-5',
        label: 'Opus 5',
        provider: MAGNET_API_PROVIDER_NAME,
        maxTokenAllowed: 200000,
      }),
      expect.objectContaining({
        name: 'claude-fable-5',
        label: expect.stringContaining('Fable 5.1'),
        provider: MAGNET_API_PROVIDER_NAME,
      }),
    ]);
  });
});
