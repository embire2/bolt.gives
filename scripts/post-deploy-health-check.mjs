#!/usr/bin/env node

import { chromium } from 'playwright';
import { isStaticAssetRequestUrl } from './live-release-smoke-utils.mjs';

const baseUrls = (process.env.BASE_URLS || process.argv.slice(2).join(',') || 'https://alpha1.bolt.gives')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

function output(result) {
  console.log(JSON.stringify(result, null, 2));
}

const browser = await chromium.launch({ headless: true });

try {
  for (const baseUrl of baseUrls) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const page = await context.newPage();
    const asset404s = [];
    const pageErrors = [];

    page.on('response', (response) => {
      if (response.status() === 404 && isStaticAssetRequestUrl(response.url())) {
        asset404s.push(`${response.status()} ${response.url()}`);
      }
    });
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 120000 });

    const promptVisible = await page
      .locator('textarea[placeholder="How can Bolt help you today?"]')
      .isVisible()
      .catch(() => false);

    const result = {
      ok: asset404s.length === 0 && pageErrors.length === 0 && promptVisible,
      baseUrl,
      asset404s,
      pageErrors,
      promptVisible,
      title: await page.title(),
    };

    output(result);

    if (!result.ok) {
      throw new Error(`Post-deploy health check failed for ${baseUrl}`);
    }

    await context.close();
  }
} finally {
  await browser.close();
}
