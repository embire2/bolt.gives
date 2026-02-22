import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProviderInfo } from '~/types/model';
import { getTemplates, inferTemplateFromPrompt, selectStarterTemplate } from './selectStarterTemplate';

const openAIProvider: ProviderInfo = {
  name: 'OpenAI',
  staticModels: [],
};

describe('getTemplates', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses built-in local fallback files when remote template fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'failed' }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
          },
        }),
      ) as unknown as typeof fetch,
    );

    const result = await getTemplates('Vite React', 'Fallback Test');

    expect(result).not.toBeNull();
    expect(result?.assistantMessage).toContain('<boltAction type="shell">');
    expect(result?.assistantMessage).toContain('Using built-in Vite React starter files');
    expect(result?.assistantMessage).toContain('pnpm install');
    expect(result?.assistantMessage).toContain('<boltAction type="start">');
    expect(result?.assistantMessage).toContain('pnpm run dev');
    expect(result?.assistantMessage).toContain('filePath="README.md"');
    expect(result?.assistantMessage).toContain('filePath="package.json"');

    const packageIndex = result?.assistantMessage.indexOf('filePath="package.json"') ?? -1;
    const installIndex = result?.assistantMessage.indexOf('pnpm install') ?? -1;
    expect(packageIndex).toBeGreaterThanOrEqual(0);
    expect(installIndex).toBeGreaterThanOrEqual(0);
    expect(packageIndex).toBeLessThan(installIndex);
    expect(result?.userMessage).toContain('Fallback starter note');
    expect(result?.userMessage).toContain('queued automatically');
  });

  it('uses remote files when the template API succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            {
              name: 'package.json',
              path: 'package.json',
              content: '{"name":"demo"}',
            },
            {
              name: 'prompt',
              path: '.bolt/prompt',
              content: 'Use remote prompt',
            },
          ]),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      ) as unknown as typeof fetch,
    );

    const result = await getTemplates('Vite React', 'Remote Test');

    expect(result).not.toBeNull();
    expect(result?.assistantMessage).toContain('filePath="package.json"');
    expect(result?.userMessage).toContain('Use remote prompt');
    expect(result?.userMessage).not.toContain('Fallback starter note');
  });
});

describe('selectStarterTemplate heuristics', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('infers a React website template without waiting for LLM selection', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);

    const result = await selectStarterTemplate({
      message: 'Build me a React website with a landing page and contact form',
      model: 'gpt-4o',
      provider: openAIProvider,
    });

    expect(result.template).toBe('Vite React');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('infers a Node Express API template for backend prompts', () => {
    const inferred = inferTemplateFromPrompt('Create a Node Express API with a health endpoint');

    expect(inferred).toEqual({
      template: 'Node Express API',
      title: 'Node Express API starter',
    });
  });

  it('falls back to prompt heuristics when LLM output is invalid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ text: 'this is not valid xml' }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }),
      ) as unknown as typeof fetch,
    );

    const result = await selectStarterTemplate({
      message: 'Create a small React dashboard app',
      model: 'gpt-4o',
      provider: openAIProvider,
    });

    expect(result.template).toBe('Vite React');
  });
});
