import { afterEach, describe, expect, it, vi } from 'vitest';
import FreeProvider, { clearHostedFreeModelResolution } from './free';
import { FREE_HOSTED_MODEL, FREE_HOSTED_MODEL_LABEL } from '~/lib/modules/llm/free-provider-config';

const { responsesSpy, createOpenAISpy } = vi.hoisted(() => {
  const responsesSpy = vi.fn();
  const createOpenAISpy = vi.fn(() => ({
    responses: responsesSpy,
  }));

  return {
    responsesSpy,
    createOpenAISpy,
  };
});

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: createOpenAISpy,
}));

describe('FreeProvider', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    clearHostedFreeModelResolution();
  });

  it('uses the dedicated server-side MagnetAPI key and Responses transport for the locked FREE model', () => {
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
    });
    expect(responsesSpy).toHaveBeenCalledWith(FREE_HOSTED_MODEL);
    expect(result).toBe(modelInstance);
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
    });
    expect(responsesSpy).toHaveBeenCalledWith(FREE_HOSTED_MODEL);
    expect(result).toBe(modelInstance);
  });

  it('exposes the visible hosted FREE model label expected by the UI', () => {
    const provider = new FreeProvider();
    expect(provider.staticModels[0]?.label).toBe(FREE_HOSTED_MODEL_LABEL);
  });
});
