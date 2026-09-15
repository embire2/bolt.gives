import { describe, expect, it, vi } from 'vitest';

import {
  completeProfileOnboardingForScreenshot,
  hideProfileOnboardingForScreenshot,
  PROFILE_ONBOARDING_SELECTOR,
} from './screenshot-profile-onboarding.mjs';

describe('README screenshot profile onboarding handling', () => {
  it('completes native onboarding through the actual registration button', async () => {
    const fill = vi.fn();
    const click = vi.fn();
    const waitFor = vi.fn().mockResolvedValue(undefined);
    const dialog = {
      waitFor,
      getAttribute: async () => 'profile-onboarding-title',
      getByLabel: vi.fn(() => ({ fill })),
      getByRole: vi.fn(() => ({ click })),
    };
    const page = { locator: vi.fn(() => ({ first: () => dialog })) };
    await expect(completeProfileOnboardingForScreenshot(page)).resolves.toBe(true);
    expect(page.locator).toHaveBeenCalledWith(
      expect.stringContaining('dialog[aria-labelledby="profile-onboarding-title"]'),
    );
    expect(fill).toHaveBeenCalledWith(expect.stringMatching(/^release-screenshot-\d+@example.invalid$/));
    expect(dialog.getByRole).toHaveBeenCalledWith('button', { name: 'Create profile and continue' });
    expect(click).toHaveBeenCalledOnce();
    expect(waitFor).toHaveBeenLastCalledWith({ state: 'hidden', timeout: 15000 });
  });

  it('does not register a profile when onboarding is absent', async () => {
    const dialog = { waitFor: vi.fn().mockRejectedValue(new Error('absent')) };
    const page = { locator: () => ({ first: () => dialog }) };
    await expect(completeProfileOnboardingForScreenshot(page)).resolves.toBe(false);
  });

  it('uses only an explicitly supplied owner token for a no-database fixture', async () => {
    const fill = vi.fn();
    const click = vi.fn();
    const dialog = {
      waitFor: vi.fn().mockResolvedValue(undefined),
      getAttribute: async () => 'owner-login-title',
      getByLabel: vi.fn(() => ({ fill })),
      getByRole: vi.fn(() => ({ click })),
    };
    const page = { locator: () => ({ first: () => dialog }) };
    await expect(completeProfileOnboardingForScreenshot(page, 'explicit-owner-fixture-token')).resolves.toBe(true);
    expect(fill).toHaveBeenCalledWith('explicit-owner-fixture-token');
    expect(dialog.getByRole).toHaveBeenCalledWith('button', { name: 'Open my workspace' });
    expect(click).toHaveBeenCalledOnce();
  });

  it('refuses to bypass owner login when no test credential was provided', async () => {
    const dialog = { waitFor: vi.fn().mockResolvedValue(undefined), getAttribute: async () => 'owner-login-title' };
    const page = { locator: () => ({ first: () => dialog }) };
    await expect(completeProfileOnboardingForScreenshot(page, '')).rejects.toThrow('BOLT_E2E_OWNER_ACCESS_TOKEN');
  });

  it('hides the mandatory profile modal only inside the screenshot page', async () => {
    const waitFor = vi.fn();
    const addStyleTag = vi.fn();
    const page = {
      locator: vi.fn(() => ({
        first: () => ({
          isVisible: async () => true,
          waitFor,
        }),
      })),
      addStyleTag,
    };

    await expect(hideProfileOnboardingForScreenshot(page as any)).resolves.toBe(true);
    expect(page.locator).toHaveBeenCalledWith(PROFILE_ONBOARDING_SELECTOR);
    expect(addStyleTag).toHaveBeenCalledWith({
      content: `${PROFILE_ONBOARDING_SELECTOR} { display: none !important; }`,
    });
    expect(waitFor).toHaveBeenCalledWith({ state: 'hidden', timeout: 5000 });
  });

  it('leaves pages without onboarding unchanged', async () => {
    const addStyleTag = vi.fn();
    const page = {
      locator: () => ({
        first: () => ({
          isVisible: async () => false,
        }),
      }),
      addStyleTag,
    };

    await expect(hideProfileOnboardingForScreenshot(page as any)).resolves.toBe(false);
    expect(addStyleTag).not.toHaveBeenCalled();
  });
});
