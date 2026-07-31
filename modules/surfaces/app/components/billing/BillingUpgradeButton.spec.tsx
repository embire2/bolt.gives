// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  securedFetch: vi.fn(),
}));

vi.mock('@bolt/project/lib/hooks/useCsrf', () => ({
  securedFetch: mocks.securedFetch,
}));

let BillingUpgradeButton: (typeof import('./BillingUpgradeButton.client'))['BillingUpgradeButton'];

describe('BillingUpgradeButton', () => {
  beforeAll(async () => {
    (window as { __vite_plugin_react_preamble_installed__?: boolean }).__vite_plugin_react_preamble_installed__ = true;
    BillingUpgradeButton = (await import('./BillingUpgradeButton.client')).BillingUpgradeButton;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.securedFetch.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Checkout unavailable in test.' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('uses the CSRF-protected fetch path when starting Checkout', async () => {
    render(<BillingUpgradeButton>Upgrade</BillingUpgradeButton>);

    fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }));

    await waitFor(() => {
      expect(mocks.securedFetch).toHaveBeenCalledWith('/api/billing/checkout', {
        method: 'POST',
        headers: { Accept: 'application/json' },
      });
    });
    expect(await screen.findByText('Checkout unavailable in test.')).toBeTruthy();
  });
});
