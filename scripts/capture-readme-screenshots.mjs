#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.BASE_URL || 'http://localhost:5173';
const outDir = process.env.README_SCREENSHOT_DIR || 'docs/screenshots';
const secure = baseUrl.startsWith('https://');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1600, height: 900 },
});
const page = await context.newPage();

await fs.mkdir(outDir, { recursive: true });

async function forceProviderDefaults() {
  await context.addCookies([
    {
      name: 'selectedProvider',
      value: 'OpenAI',
      url: baseUrl,
      sameSite: 'Lax',
      secure,
    },
    {
      name: 'selectedModel',
      value: 'gpt-4o',
      url: baseUrl,
      sameSite: 'Lax',
      secure,
    },
  ]);
}

async function waitReady() {
  await page.waitForSelector('textarea[placeholder="How can Bolt help you today?"]', { timeout: 90000 });
}

async function captureHome() {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await waitReady();
  await page.screenshot({ path: path.join(outDir, 'home.png'), fullPage: true });
}

async function runPromptCapture({ prompt, token, outputName }) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await waitReady();
  await page.fill('textarea[placeholder="How can Bolt help you today?"]', `${prompt}\n\nInclude token: ${token}`);
  await page.press('textarea[placeholder="How can Bolt help you today?"]', 'Enter');

  await page.waitForFunction(
    (tok) => {
      const text = document.body.innerText || '';
      const tokenCount = text.split(tok).length - 1;
      const hasError = /server error|error details|custom error/i.test(text);
      return tokenCount >= 2 && !hasError;
    },
    token,
    { timeout: 180000 },
  );

  await page.screenshot({ path: path.join(outDir, outputName), fullPage: true });
}

async function captureChangelog() {
  await page.goto(`${baseUrl}/changelog`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => {
    const text = document.body.innerText || '';
    return text.includes('Current version: v1.0.3');
  });
  await page.screenshot({ path: path.join(outDir, 'changelog.png'), fullPage: true });
}

try {
  await forceProviderDefaults();
  await captureHome();
  await runPromptCapture({
    prompt: 'Say hello from bolt.gives in one short sentence.',
    token: `CHAT_OK_${Date.now().toString(36)}`,
    outputName: 'chat.png',
  });
  await runPromptCapture({
    prompt: 'Plan a simple task in 3 steps and then wait.',
    token: `PLAN_OK_${Math.random().toString(36).slice(2, 8)}`,
    outputName: 'chat-plan.png',
  });
  await captureChangelog();
  console.log(`Wrote README screenshots to ${outDir}`);
} finally {
  await context.close();
  await browser.close();
}
