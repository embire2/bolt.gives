import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTemplates } from './selectStarterTemplate';

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
    expect(result?.assistantMessage).toContain('create-vite@7.1.0');
    expect(result?.assistantMessage).toContain('filePath="README.md"');
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
