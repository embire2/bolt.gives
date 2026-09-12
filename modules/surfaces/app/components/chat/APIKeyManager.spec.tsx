// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('~/lib/profile-context', () => ({ useProfile: () => ({ id: 'alice' }) }));
vi.mock('@bolt/agent/lib/runtime/api-key-storage', () => ({
  getApiKeysFromCookies: () => ({ Example: 'dummy' }),
  setApiKeysCookie: vi.fn(),
}));
beforeAll(() => {
  (window as any).__vite_plugin_react_preamble_installed__ = true;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ isSet: false }))),
  );
});
afterEach(cleanup);

describe('API key editor ownership', () => {
  it('does not write keys or reload the model catalog while reading saved settings', async () => {
    const { APIKeyManager: ApiKeyManager } = await import('./APIKeyManager');
    const save = vi.fn();
    render(<ApiKeyManager provider={{ name: 'Example' } as any} apiKey="dummy" setApiKey={save} />);
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTitle('Edit API Key'));
    expect((screen.getByPlaceholderText('Enter API Key') as HTMLInputElement).value).toBe('dummy');
    expect(save).not.toHaveBeenCalled();
  });
  it('discards an open secret input when logout clears its parent key', async () => {
    const { APIKeyManager: ApiKeyManager } = await import('./APIKeyManager');
    const props = { provider: { name: 'Example' } as any, setApiKey: vi.fn() };
    const view = render(<ApiKeyManager {...props} apiKey="dummy" />);
    fireEvent.click(screen.getByTitle('Edit API Key'));
    view.rerender(<ApiKeyManager {...props} apiKey="" />);
    expect(screen.queryByPlaceholderText('Enter API Key')).toBeNull();
    expect(props.setApiKey).not.toHaveBeenCalled();
  });
});
