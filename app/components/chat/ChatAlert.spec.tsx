// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ActionAlert } from '~/types/actions';

let ChatAlert: typeof import('./ChatAlert').default;

const previewAlert: ActionAlert = {
  type: 'error',
  title: 'Preview Error',
  description: 'Uncaught ReferenceError: foo is not defined',
  content: 'ReferenceError: foo is not defined',
  source: 'preview',
};

describe('ChatAlert', () => {
  beforeAll(async () => {
    if (typeof window !== 'undefined') {
      (window as { __vite_plugin_react_preamble_installed__?: boolean }).__vite_plugin_react_preamble_installed__ =
        true;
    }

    ChatAlert = (await import('./ChatAlert')).default;
  });

  afterEach(() => {
    cleanup();
  });

  it('shows queued preview auto-fix messaging and disables manual ask', () => {
    const clearAlert = vi.fn();
    const postMessage = vi.fn();

    render(<ChatAlert alert={previewAlert} clearAlert={clearAlert} postMessage={postMessage} autoFixState="queued" />);

    expect(screen.queryByText(/queued an automatic preview repair/i)).toBeTruthy();

    const askButton = screen.getByRole('button', { name: /queued/i });
    expect(askButton.getAttribute('disabled')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(clearAlert).toHaveBeenCalledTimes(1);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('shows running preview auto-fix messaging', () => {
    const clearAlert = vi.fn();
    const postMessage = vi.fn();

    render(<ChatAlert alert={previewAlert} clearAlert={clearAlert} postMessage={postMessage} autoFixState="running" />);

    expect(screen.queryByText(/Architect is fixing the preview error now/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /auto-fixing/i }).getAttribute('disabled')).not.toBeNull();
  });
});
