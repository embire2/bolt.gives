#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { completeProfileOnboardingForScreenshot } from './screenshot-profile-onboarding.mjs';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:8788';
const outDir = process.env.E2E_OUTPUT_DIR || 'output/playwright';

function getChatUrl(value) {
  const url = new URL(value);

  if (!url.pathname.startsWith('/chat')) {
    url.pathname = '/chat';
    url.search = '';
    url.hash = '';
  }

  return url.toString();
}

const browser = await chromium.launch({ headless: true, chromiumSandbox: false });
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
});
const page = await context.newPage();

try {
  await fs.mkdir(outDir, { recursive: true });

  const chatUrl = getChatUrl(baseUrl);

  await page.goto(chatUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await completeProfileOnboardingForScreenshot(page);
  await page.waitForFunction(
    () => {
      const comboboxText = Array.from(document.querySelectorAll('[role="combobox"]')).map(
        (node) => node.textContent || '',
      );

      return (
        comboboxText.some((text) => text.includes('FREE')) &&
        comboboxText.some((text) => text.includes('GLM 5.3 Flash'))
      );
    },
    undefined,
    { timeout: 90000 },
  );

  const magnetBanner = page.getByRole('complementary', { name: 'MagnetAPI provider notice' });
  await magnetBanner.waitFor({ state: 'visible', timeout: 30000 });

  if ((await magnetBanner.count()) !== 1) {
    throw new Error(`Expected exactly one MagnetAPI banner, received: ${await magnetBanner.count()}`);
  }

  const magnetLink = magnetBanner.getByRole('link', { name: 'Visit MagnetAPI' });

  if ((await magnetLink.getAttribute('href')) !== 'https://magnetapi.org') {
    throw new Error(
      `Expected the MagnetAPI banner to link to magnetapi.org, received: ${await magnetLink.getAttribute('href')}`,
    );
  }

  await page.screenshot({
    path: path.join(outDir, 'magnet-api-banner.png'),
    fullPage: true,
  });

  await magnetBanner.getByRole('button', { name: /do not show it again/i }).click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.localStorage.getItem('bolt_magnet_api_banner_dismissed_v1') === '1');
  await page.waitForTimeout(250);

  if ((await page.getByRole('complementary', { name: 'MagnetAPI provider notice' }).count()) !== 0) {
    throw new Error('Expected the dismissed MagnetAPI banner to stay hidden after reload.');
  }

  const providerText = (await page.getByRole('combobox').filter({ hasText: 'FREE' }).first().textContent()) || '';
  const modelSelect = page.locator('[role="combobox"][aria-controls="model-listbox"]');
  await modelSelect.click();

  const modelLabels = (await page.locator('#model-listbox [role="option"] .truncate > span').allTextContents()).map(
    (label) => label.trim(),
  );
  const expectedModelLabels = ['GLM 5.3 Flash'];

  if (!providerText.includes('FREE')) {
    throw new Error(`Expected FREE provider on startup, received: ${providerText}`);
  }

  if (JSON.stringify(modelLabels) !== JSON.stringify(expectedModelLabels)) {
    throw new Error(
      `Expected FREE model choices ${expectedModelLabels.join(', ')}, received: ${modelLabels.join(', ')}`,
    );
  }

  if (!(await modelSelect.textContent())?.includes('GLM 5.3 Flash')) {
    throw new Error(`Expected GLM 5.3 Flash on startup, received: ${await modelSelect.textContent()}`);
  }

  await page.locator('#model-listbox [role="option"]').filter({ hasText: 'GLM 5.3 Flash' }).click();

  const selectedFreeModel = (await context.cookies()).find((cookie) => cookie.name === 'selectedModel')?.value;

  if (decodeURIComponent(selectedFreeModel || '') !== 'z-ai/glm-5.3-flash') {
    throw new Error('The selected FREE model did not persist the current model ID.');
  }

  const providerSelect = page.locator('[role="combobox"][aria-controls="provider-listbox"]');
  await providerSelect.click();
  await page.getByRole('option', { name: 'MagnetAPI', exact: true }).click();
  await page.getByText(/Sign in to MagnetAPI, buy a plan, create a User API Key/i).waitFor({ timeout: 30000 });

  const magnetModelSelect = page.locator('[role="combobox"][aria-controls="model-listbox"]');
  await magnetModelSelect.click();

  const magnetModelLabels = (await page.locator('#model-listbox [role="option"]').allTextContents()).map((label) =>
    label.trim(),
  );
  const expectedMagnetModels = ['ChatGPT-5.6 Ultra', 'Opus 5', 'Fable 5.1'];

  for (const expectedLabel of expectedMagnetModels) {
    if (!magnetModelLabels.some((label) => label.includes(expectedLabel))) {
      throw new Error(`Expected MagnetAPI model ${expectedLabel}, received: ${magnetModelLabels.join(', ')}`);
    }
  }

  await page.locator('#model-listbox [role="option"]').filter({ hasText: 'ChatGPT-5.6 Ultra' }).first().click();

  const selectedMagnetModel = (await magnetModelSelect.textContent())?.trim() || '';

  if (!selectedMagnetModel.includes('ChatGPT-5.6 Ultra')) {
    throw new Error(`Expected ChatGPT-5.6 Ultra after selection, received: ${selectedMagnetModel}`);
  }

  await page.screenshot({
    path: path.join(outDir, 'magnet-api-provider.png'),
    fullPage: true,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl: chatUrl,
        provider: providerText.trim(),
        model: selectedFreeModel,
        modelChoices: modelLabels,
        bannerDismissalPersisted: true,
        selectedMagnetModel,
        magnetApiModelChoices: magnetModelLabels,
      },
      null,
      2,
    ),
  );
} finally {
  await context.close();
  await browser.close();
}
