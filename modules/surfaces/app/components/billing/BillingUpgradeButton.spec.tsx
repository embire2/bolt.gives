// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  securedFetch: vi.fn(),
}));

vi.mock('@bolt/project/lib/hooks/useCsrf', () => ({
  securedFetch: mocks.securedFetch,
}));

let BillingUpgradeButton: (typeof import('./BillingUpgradeButton'))['BillingUpgradeButton'];

describe('BillingUpgradeButton', () => {
  beforeAll(async () => {
    (window as { __vite_plugin_react_preamble_installed__?: boolean }).__vite_plugin_react_preamble_installed__ = true;
    BillingUpgradeButton = (await import('./BillingUpgradeButton')).BillingUpgradeButton;
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

  it('allows retry after a failed checkout without duplicating an in-flight request', async () => {
    let finish!: (response: Response) => void;
    mocks.securedFetch.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
    );
    render(<BillingUpgradeButton>Upgrade</BillingUpgradeButton>);

    const button = screen.getByRole('button', { name: 'Upgrade' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(mocks.securedFetch).toHaveBeenCalledTimes(1);
    finish(new Response(JSON.stringify({ message: 'Try again' }), { status: 502 }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }));
    await waitFor(() => expect(mocks.securedFetch).toHaveBeenCalledTimes(2));
  });
});
