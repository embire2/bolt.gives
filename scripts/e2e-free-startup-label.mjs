#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

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

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
});
const page = await context.newPage();

try {
  await fs.mkdir(outDir, { recursive: true });

  const chatUrl = getChatUrl(baseUrl);

  await page.goto(chatUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(
    () => {
      const comboboxText = Array.from(document.querySelectorAll('[role="combobox"]')).map(
        (node) => node.textContent || '',
      );

      return (
        comboboxText.some((text) => text.includes('FREE')) &&
        comboboxText.some((text) => text.includes('ChatGPT-5.6 SOL'))
      );
    },
    undefined,
    { timeout: 90000 },
  );

  const providerText = (await page.getByRole('combobox').filter({ hasText: 'FREE' }).first().textContent()) || '';
  const modelSelect = page.getByRole('combobox', { name: 'FREE coding model' });
  const modelLabels = (await modelSelect.locator('option').allTextContents()).map((label) => label.trim());
  const expectedModelLabels = ['ChatGPT-5.6 SOL', 'Opus 4.8', 'Sonnet 5', 'Fable 5'];

  if (!providerText.includes('FREE')) {
    throw new Error(`Expected FREE provider on startup, received: ${providerText}`);
  }

  if (JSON.stringify(modelLabels) !== JSON.stringify(expectedModelLabels)) {
    throw new Error(
      `Expected FREE model choices ${expectedModelLabels.join(', ')}, received: ${modelLabels.join(', ')}`,
    );
  }

  if ((await modelSelect.inputValue()) !== 'gpt-5.6-sol') {
    throw new Error(`Expected ChatGPT-5.6 SOL on startup, received: ${await modelSelect.inputValue()}`);
  }

  await modelSelect.selectOption('claude-sonnet-5');

  if ((await modelSelect.inputValue()) !== 'claude-sonnet-5') {
    throw new Error('Expected FREE model selection to switch to Sonnet 5.');
  }

  await modelSelect.selectOption('gpt-5.6-sol');

  await page.screenshot({
    path: path.join(outDir, 'free-startup-label.png'),
    fullPage: true,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl: chatUrl,
        provider: providerText.trim(),
        model: await modelSelect.inputValue(),
        modelChoices: modelLabels,
      },
      null,
      2,
    ),
  );
} finally {
  await context.close();
  await browser.close();
}
