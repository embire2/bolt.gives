import { describe, expect, it } from 'vitest';
import { shouldUseClientStarterBootstrap } from './starter-bootstrap';

describe('shouldUseClientStarterBootstrap', () => {
  it('uses client bootstrap for local providers', () => {
    expect(shouldUseClientStarterBootstrap('LMStudio', 'llama-3.2')).toBe(true);
    expect(shouldUseClientStarterBootstrap('Ollama', 'qwen2.5-coder:7b')).toBe(true);
  });

  it('uses client bootstrap for smaller remote models', () => {
    expect(shouldUseClientStarterBootstrap('OpenAI', 'gpt-4o-mini')).toBe(true);
    expect(shouldUseClientStarterBootstrap('Anthropic', 'claude-3-haiku-20240307')).toBe(true);
  });

  it('skips client bootstrap for larger capable models', () => {
    expect(shouldUseClientStarterBootstrap('OpenAI', 'gpt-5.4')).toBe(false);
    expect(shouldUseClientStarterBootstrap('OpenAI', 'gpt-5-codex')).toBe(false);
    expect(shouldUseClientStarterBootstrap('Anthropic', 'claude-3-7-sonnet-latest')).toBe(false);
  });
});
