#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:8788';
const outDir = process.env.E2E_OUTPUT_DIR || 'output/playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
});
const page = await context.newPage();

try {
  await fs.mkdir(outDir, { recursive: true });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('textarea[placeholder="How can Bolt help you today?"]', { timeout: 90000 });

  const comboboxes = page.getByRole('combobox');
  const providerText = (await comboboxes.nth(0).textContent()) || '';
  const modelText = (await comboboxes.nth(1).textContent()) || '';

  if (!providerText.includes('FREE')) {
    throw new Error(`Expected FREE provider on startup, received: ${providerText}`);
  }

  if (!modelText.includes('DeepSeek V3.2')) {
    throw new Error(`Expected DeepSeek V3.2 model label on startup, received: ${modelText}`);
  }

  await page.screenshot({
    path: path.join(outDir, 'free-startup-label.png'),
    fullPage: true,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        provider: providerText.trim(),
        model: modelText.trim(),
      },
      null,
      2,
    ),
  );
} finally {
  await context.close();
  await browser.close();
}
