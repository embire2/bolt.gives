// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderInfo } from '@bolt/agent/types/model';

const localStorageState = new Map<string, string>();

const localStorageMock = {
  getItem: vi.fn((key: string) => localStorageState.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageState.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    localStorageState.delete(key);
  }),
  clear: vi.fn(() => {
    localStorageState.clear();
  }),
  key: vi.fn((index: number) => Array.from(localStorageState.keys())[index] ?? null),
  get length() {
    return localStorageState.size;
  },
};

const freeProvider: ProviderInfo = {
  name: 'FREE',
  allowsUserApiKey: false,
  staticModels: [
    {
      name: 'gpt-5.6-sol',
      label: 'ChatGPT-5.6 SOL',
      provider: 'FREE',
      maxTokenAllowed: 64000,
    },
    { name: 'claude-opus-4-8', label: 'Opus 4.8', provider: 'FREE', maxTokenAllowed: 64000 },
    { name: 'claude-sonnet-5', label: 'Sonnet 5', provider: 'FREE', maxTokenAllowed: 64000 },
    { name: 'claude-fable-5', label: 'Fable 5', provider: 'FREE', maxTokenAllowed: 64000 },
  ],
};

let ModelSelector: (typeof import('./ModelSelector'))['ModelSelector'];

describe('ModelSelector', () => {
  beforeAll(async () => {
    (window as any).__vite_plugin_react_preamble_installed__ = true;
    vi.stubGlobal('localStorage', localStorageMock);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ providers: [] }),
      })),
    );
    ModelSelector = (await import('./ModelSelector')).ModelSelector;
  });

  beforeEach(() => {
    vi.stubGlobal('localStorage', localStorageMock);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ providers: [] }),
      })),
    );
  });

  afterEach(() => {
    cleanup();
    localStorageMock.clear();
    vi.unstubAllGlobals();
  });

  it('shows the default FREE model label even before async model options load', () => {
    render(
      <ModelSelector
        provider={freeProvider}
        providerList={[freeProvider]}
        model="gpt-5.6-sol"
        modelList={[]}
        apiKeys={{}}
      />,
    );

    expect(screen.getAllByRole('combobox')[1].textContent).toContain('ChatGPT-5.6 SOL');
    expect(screen.queryByText('Select model')).toBeNull();
  });

  it('lets users choose any approved FREE model', () => {
    const setModel = vi.fn();

    render(
      <ModelSelector
        provider={freeProvider}
        providerList={[freeProvider]}
        model="gpt-5.6-sol"
        setModel={setModel}
        modelList={freeProvider.staticModels}
        apiKeys={{}}
      />,
    );

    fireEvent.click(screen.getAllByRole('combobox')[1]);
    fireEvent.click(screen.getByRole('option', { name: /Sonnet 5/i }));

    expect(setModel).toHaveBeenCalledWith('claude-sonnet-5');
  });
});
