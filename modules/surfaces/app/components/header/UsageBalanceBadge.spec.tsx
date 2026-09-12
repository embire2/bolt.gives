// @vitest-environment jsdom
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('~/lib/profile-context', () => ({ useProfile: () => null }));
vi.mock('./FreePlanPausedModal.client', () => ({ FreePlanPausedModal: () => null }));
vi.mock('~/components/billing/BillingUpgradeButton', () => ({ BillingUpgradeButton: () => null }));
beforeAll(() => {
  (window as any).__vite_plugin_react_preamble_installed__ = true;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('signed-out usage badge', () => {
  it('does not load the runtime or fetch an old project entitlement before login', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    const { UsageBalanceBadge } = await import('./UsageBalanceBadge.client');
    render(<UsageBalanceBadge />);
    expect(fetch).not.toHaveBeenCalled();
  });
});
