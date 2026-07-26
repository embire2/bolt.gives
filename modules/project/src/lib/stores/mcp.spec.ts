// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { csrfCookieName, csrfHeaderName } from '@bolt/project/lib/hooks/useCsrf';
import { useMCPStore } from './mcp';

describe('MCP settings store', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    });
  });

  afterEach(() => {
    localStorage.clear();
    document.cookie = `${csrfCookieName}=; Max-Age=0; Path=/`;
    useMCPStore.setState({
      isInitialized: false,
      settings: {
        maxLLMSteps: 5,
        mcpConfig: {
          mcpServers: {},
        },
      },
      serverTools: {},
      error: null,
      isUpdatingConfig: false,
    });
    vi.unstubAllGlobals();
  });

  it('restores saved settings once with the required CSRF credential', async () => {
    localStorage.setItem(
      'mcp_settings',
      JSON.stringify({
        maxLLMSteps: 7,
        mcpConfig: {
          mcpServers: {
            docs: {
              command: 'node',
              args: ['docs-server.mjs'],
            },
          },
        },
      }),
    );

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ docs: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all([useMCPStore.getState().initialize(), useMCPStore.getState().initialize()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);

    expect(url).toBe('/api/mcp-update-config');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect(headers.get(csrfHeaderName)).toBeTruthy();
    expect(document.cookie).toContain(`${csrfCookieName}=`);
    expect(useMCPStore.getState()).toMatchObject({
      isInitialized: true,
      settings: {
        maxLLMSteps: 7,
      },
      serverTools: {
        docs: [],
      },
    });
  });
});
