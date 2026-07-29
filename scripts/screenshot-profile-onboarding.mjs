export const PROFILE_ONBOARDING_SELECTOR = '[role="dialog"][aria-labelledby="profile-onboarding-title"]';

export async function hideProfileOnboardingForScreenshot(page) {
  const dialog = page.locator(PROFILE_ONBOARDING_SELECTOR).first();
  const visible = await dialog.isVisible().catch(() => false);

  if (!visible) {
    return false;
  }

  await page.addStyleTag({
    content: `${PROFILE_ONBOARDING_SELECTOR} { display: none !important; }`,
  });
  await dialog.waitFor({ state: 'hidden', timeout: 5000 });

  return true;
}
