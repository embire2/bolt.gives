// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ProviderInfo } from '~/types/model';

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
      name: 'openai/gpt-oss-120b:free',
      label: 'OpenAI gpt-oss-120b (free)',
      provider: 'FREE',
      maxTokenAllowed: 131072,
    },
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

  afterEach(() => {
    cleanup();
    localStorageMock.clear();
    vi.unstubAllGlobals();
  });

  it('shows the locked FREE model label even before async model options load', () => {
    vi.stubGlobal('localStorage', localStorageMock);

    render(
      <ModelSelector
        provider={freeProvider}
        providerList={[freeProvider]}
        model="openai/gpt-oss-120b:free"
        modelList={[]}
        apiKeys={{}}
      />,
    );

    expect(screen.getAllByRole('combobox')[1].textContent).toContain('OpenAI gpt-oss-120b (free)');
    expect(screen.queryByText('Select model')).toBeNull();
  });
});
