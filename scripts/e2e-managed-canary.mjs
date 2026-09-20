#!/usr/bin/env node
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

if (!process.argv.includes('--live')) {
  throw new Error('Pass --live to create one disposable assigned Cloudflare instance at the selected BASE_URL.');
}

const baseUrl = process.env.BASE_URL || 'https://alpha1.bolt.gives';
const output = process.env.E2E_OUTPUT_DIR || 'output/playwright/managed-canary';
await fs.mkdir(output, { recursive: true, mode: 0o700 });

const subdomain = `release-canary-${Date.now()}`;
const email = `${subdomain}@example.invalid`;
const browser = await chromium.launch({
  headless: true,
  chromiumSandbox: false,
  args: ['--disable-gpu', '--disable-software-rasterizer'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

try {
  await page.goto(new URL('/managed-instances', baseUrl).href);

  const dialog = page.getByRole('dialog').filter({ has: page.locator('#profile-onboarding-title') });
  await dialog.getByLabel('Name and Surname').fill('Release Canary');
  await dialog.getByLabel('Email address', { exact: true }).fill(email);
  await dialog.getByLabel('Country', { exact: true }).fill('South Africa');
  await dialog.getByRole('button', { name: 'Create profile and continue' }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.getByLabel('Full name', { exact: true }).fill('Release Canary');
  await page.getByLabel('Work email', { exact: true }).fill(email);
  await page.getByLabel('Preferred subdomain', { exact: false }).fill(subdomain);
  await page
    .getByLabel('What are you building?')
    .fill('Disposable release acceptance: generate, iterate, restore and publish a Calendar.');
  await page.getByRole('button', { name: 'Spawn managed instance', exact: true }).click({ timeout: 240_000 });

  const link = page.getByRole('link', { name: 'Open live instance', exact: true });
  await link.waitFor({ state: 'visible', timeout: 240_000 });

  const url = await link.getAttribute('href');
  assert.equal(new URL(url).protocol, 'https:');
  assert(new URL(url).hostname.endsWith('.pages.dev') || new URL(url).hostname.endsWith('.bolt.gives'));
  await page.screenshot({ path: `${output}/assigned-instance.png`, fullPage: true });
  await context.storageState({ path: `${output}/operator-fixture-session.json` });
  await fs.chmod(`${output}/operator-fixture-session.json`, 0o600);

  const report = { ok: true, subdomain, email, url };
  await fs.writeFile(`${output}/instance.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(report));
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true, timeout: 5000 }).catch(() => undefined);
  await fs.writeFile(
    `${output}/failure.txt`,
    await page
      .locator('body')
      .innerText({ timeout: 5000 })
      .catch(() => String(error)),
    { mode: 0o600 },
  );
  throw error;
} finally {
  await browser.close();
}
