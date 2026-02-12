// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('~/lib/hooks/useSettings', () => {
  return {
    useSettings: () => ({
      autoSelectTemplate: true,
      isLatestBranch: true,
      contextOptimizationEnabled: true,
      eventLogs: true,
      setAutoSelectTemplate: vi.fn(),
      enableLatestBranch: vi.fn(),
      enableContextOptimization: vi.fn(),
      setEventLogs: vi.fn(),
      setPromptId: vi.fn(),
      promptId: 'default',
    }),
  };
});

vi.mock('~/lib/common/prompt-library', () => {
  return {
    PromptLibrary: {
      getList: () => [{ id: 'default', label: 'Default' }],
    },
  };
});

vi.mock('~/lib/services/pluginManager', () => {
  return {
    PluginManager: {
      listInstalled: () => [],
      fetchMarketplace: async () => [],
      install: (plugin: any) => [plugin],
      uninstall: () => [],
    },
  };
});

const createFile = vi.fn().mockResolvedValue(true);
const saveFile = vi.fn().mockResolvedValue(undefined);

vi.mock('~/lib/stores/workbench', () => {
  return {
    workbenchStore: {
      createFile,
      saveFile,
    },
  };
});

vi.mock('react-toastify', () => {
  return {
    toast: {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    },
  };
});

let FeaturesTab: (typeof import('./FeaturesTab'))['default'];

describe('FeaturesTab deployment wizard', () => {
  beforeAll(() => {
    (window as any).__vite_plugin_react_preamble_installed__ = true;
  });

  beforeAll(async () => {
    FeaturesTab = (await import('./FeaturesTab')).default;
  });

  afterEach(() => {
    cleanup();
    createFile.mockClear();
    saveFile.mockClear();
    vi.unstubAllGlobals();
  });

  it('writes generated workflow files when clicking Generate Deployment Files', async () => {
    render(<FeaturesTab />);

    fireEvent.click(screen.getByText('Generate Deployment Files'));

    await waitFor(() => {
      expect(createFile).toHaveBeenCalled();
    });

    const [pathArg, contentArg] = createFile.mock.calls[0] as [string, string];
    expect(pathArg).toBe('/home/project/.github/workflows/deploy-netlify.yml');
    expect(contentArg).toContain('name: deploy-netlify');
    expect(saveFile).toHaveBeenCalledWith('/home/project/.github/workflows/deploy-netlify.yml');
  });

  it('sends rollback requests via the rollback api route', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
      text: async () => '',
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<FeaturesTab />);

    fireEvent.change(screen.getByPlaceholderText('Deployment/Site ID'), { target: { value: 'dep_123' } });
    fireEvent.change(screen.getByPlaceholderText('API token'), { target: { value: 'token' } });
    fireEvent.click(screen.getByText('Rollback'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const [url, options] = fetchMock.mock.calls[0] as [string, any];
    expect(url).toBe('/api/deployment/rollback');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(options?.body)).toEqual({
      provider: 'vercel',
      deploymentId: 'dep_123',
      token: 'token',
    });
  });
});
