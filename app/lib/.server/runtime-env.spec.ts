import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveRuntimeEnv } from './runtime-env';

describe('resolveRuntimeEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('preserves a real process secret when a later source only provides a placeholder', () => {
    vi.stubEnv('FREE_OPENROUTER_API_KEY', 'sk-or-v1-real-secret');

    const env = resolveRuntimeEnv({
      FREE_OPENROUTER_API_KEY: 'your_openrouter_api_key_here',
    });

    expect(env.FREE_OPENROUTER_API_KEY).toBe('sk-or-v1-real-secret');
  });

  it('drops placeholder sensitive values when no real secret exists', () => {
    vi.stubEnv('FREE_OPENROUTER_API_KEY', '');

    const env = resolveRuntimeEnv({
      FREE_OPENROUTER_API_KEY: 'your_openrouter_api_key_here',
    });

    expect(env.FREE_OPENROUTER_API_KEY).toBeUndefined();
  });

  it('still allows a later real secret to replace an earlier placeholder', () => {
    vi.stubEnv('OPENAI_API_KEY', 'ROTATE_REQUIRED');

    const env = resolveRuntimeEnv({
      OPENAI_API_KEY: 'sk-real-openai-key',
    });

    expect(env.OPENAI_API_KEY).toBe('sk-real-openai-key');
  });
});
