import { describe, expect, it } from 'vitest';
import { shouldUseClientStarterBootstrap } from './starter-bootstrap';

describe('shouldUseClientStarterBootstrap', () => {
  it('uses client bootstrap for local providers', () => {
    expect(shouldUseClientStarterBootstrap({ providerName: 'LMStudio', modelName: 'llama-3.2', message: '' })).toBe(
      true,
    );
    expect(
      shouldUseClientStarterBootstrap({ providerName: 'Ollama', modelName: 'qwen2.5-coder:7b', message: '' }),
    ).toBe(true);
  });

  it('uses client bootstrap for smaller remote models', () => {
    expect(shouldUseClientStarterBootstrap({ providerName: 'OpenAI', modelName: 'gpt-4o-mini', message: '' })).toBe(
      true,
    );
    expect(
      shouldUseClientStarterBootstrap({
        providerName: 'Anthropic',
        modelName: 'claude-3-haiku-20240307',
        message: '',
      }),
    ).toBe(true);
  });

  it('skips client bootstrap for larger capable models', () => {
    expect(shouldUseClientStarterBootstrap({ providerName: 'OpenAI', modelName: 'gpt-5.4', message: '' })).toBe(false);
    expect(shouldUseClientStarterBootstrap({ providerName: 'OpenAI', modelName: 'gpt-5.3-codex', message: '' })).toBe(
      false,
    );
    expect(
      shouldUseClientStarterBootstrap({
        providerName: 'Anthropic',
        modelName: 'claude-3-7-sonnet-latest',
        message: '',
      }),
    ).toBe(false);
  });

  it('uses client bootstrap for hosted FREE so managed instances never start from an empty workspace', () => {
    expect(
      shouldUseClientStarterBootstrap({
        providerName: 'FREE',
        modelName: 'deepseek/deepseek-v4-pro',
        message: 'Build a React appointment scheduling app for a doctor office',
        hostedRuntimeEnabled: true,
      }),
    ).toBe(true);
  });

  it('keeps client bootstrap available for FREE when hosted runtime is unavailable', () => {
    expect(
      shouldUseClientStarterBootstrap({
        providerName: 'FREE',
        modelName: 'deepseek/deepseek-v4-pro',
        message: 'Build a React appointment scheduling app for a doctor office',
        hostedRuntimeEnabled: false,
      }),
    ).toBe(true);
  });
});
