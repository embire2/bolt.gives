import { describe, expect, it, vi } from 'vitest';

import { hideProfileOnboardingForScreenshot, PROFILE_ONBOARDING_SELECTOR } from './screenshot-profile-onboarding.mjs';

describe('README screenshot profile onboarding handling', () => {
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
