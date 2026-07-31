// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

let FreePlanPausedModal: (typeof import('./FreePlanPausedModal.client'))['FreePlanPausedModal'];

describe('FreePlanPausedModal', () => {
  beforeAll(async () => {
    (window as { __vite_plugin_react_preamble_installed__?: boolean }).__vite_plugin_react_preamble_installed__ = true;
    FreePlanPausedModal = (await import('./FreePlanPausedModal.client')).FreePlanPausedModal;
  });

  afterEach(cleanup);

  it('shows the paused allocation and monthly launch offer', () => {
    render(<FreePlanPausedModal open resetAt="2026-07-29T22:00:00.000Z" onDismiss={() => undefined} />);

    expect(screen.getByText('FREE service paused')).toBeTruthy();
    expect(screen.getByText(/daily allocation of 100 Agent tokens/i)).toBeTruthy();
    expect(screen.getByText('$5')).toBeTruthy();
    expect(screen.getByText(/\$20\/month/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Upgrade for \$5\/month/i })).toBeTruthy();
  });

  it('lets own-key users dismiss the interruption', () => {
    const onDismiss = vi.fn();
    render(<FreePlanPausedModal open onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole('button', { name: /use my own API key/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
