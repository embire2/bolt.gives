export const PROFILE_ONBOARDING_SELECTOR = '[role="dialog"][aria-labelledby="profile-onboarding-title"]';

export async function completeProfileOnboardingForScreenshot(
  page,
  ownerAccessToken = process.env.BOLT_E2E_OWNER_ACCESS_TOKEN,
) {
  const dialog = page
    .locator(
      'dialog[aria-labelledby="owner-login-title"], dialog[aria-labelledby="profile-onboarding-title"], ' +
        PROFILE_ONBOARDING_SELECTOR,
    )
    .first();
  const visible = await dialog.waitFor({ state: 'visible', timeout: 3000 }).then(
    () => true,
    () => false,
  );

  if (!visible) {
    return false;
  }

  if ((await dialog.getAttribute('aria-labelledby')) === 'owner-login-title') {
    if (!ownerAccessToken) {
      throw new Error('Set BOLT_E2E_OWNER_ACCESS_TOKEN for an explicitly authorized self-host screenshot test.');
    }

    await dialog.getByLabel('Owner access token').fill(ownerAccessToken);
    await dialog.getByRole('button', { name: 'Open my workspace' }).click();
    await dialog.waitFor({ state: 'hidden', timeout: 15000 });

    return true;
  }

  await dialog.getByLabel('Name and Surname').fill('Release Screenshot');
  await dialog.getByLabel('Email address', { exact: true }).fill(`release-screenshot-${Date.now()}@example.invalid`);
  await dialog.getByLabel('Country', { exact: true }).fill('South Africa');
  await dialog.getByRole('button', { name: 'Create profile and continue' }).click();
  await dialog.waitFor({ state: 'hidden', timeout: 15000 });

  return true;
}

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
