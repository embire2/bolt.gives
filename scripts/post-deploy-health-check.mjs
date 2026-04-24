#!/usr/bin/env node

import { chromium } from 'playwright';
import { isStaticAssetRequestUrl } from './live-release-smoke-utils.mjs';
import {
  detectPromptSurface,
  inferExpectedSurface,
  matchesExpectedSurface,
} from './post-deploy-health-check-utils.mjs';

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

    const expectedSurface = inferExpectedSurface(baseUrl);
    const promptVisible = await detectPromptSurface(page);
    const title = await page.title();
    const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
    const expectedSurfaceVisible =
      expectedSurface === 'chat' ? promptVisible : matchesExpectedSurface(expectedSurface, { title, bodyText });

    const result = {
      ok: asset404s.length === 0 && pageErrors.length === 0 && expectedSurfaceVisible,
      baseUrl,
      expectedSurface,
      asset404s,
      pageErrors,
      promptVisible,
      expectedSurfaceVisible,
      title,
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
