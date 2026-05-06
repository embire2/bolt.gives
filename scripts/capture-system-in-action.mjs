#!/usr/bin/env node

import { chromium } from 'playwright';

const baseUrl = process.env.BASE_URL || 'http://localhost:5173';
const chatUrl = new URL('/chat', baseUrl).toString();
const outputPath = process.env.SYSTEM_ACTION_SCREENSHOT_PATH || 'docs/screenshots/system-in-action.png';
const responseToken = `SYSTEM_ACTION_OK_${Date.now().toString(36)}`;
const skipPromptCapture = /^(1|true|yes)$/i.test(process.env.SYSTEM_ACTION_SKIP_PROMPT || '');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1600, height: 900 },
});
const page = await context.newPage();

function getPromptLocator() {
  return page
    .locator(
      'textarea[placeholder="How can Bolt help you today?"], textarea, [contenteditable="true"][role="textbox"], [contenteditable="true"]',
    )
    .first();
}

async function openWorkspaceTabIfAvailable() {
  const workspaceTab = page.getByRole('tab', { name: /^Workspace$/i }).first();

  if (await workspaceTab.isVisible().catch(() => false)) {
    await workspaceTab.click();
    await page.waitForTimeout(750);
  }
}

try {
  // Force a stable provider/model pair to avoid failing screenshot captures due to
  // stale provider defaults (for example invalid Bedrock credentials).
  await context.addCookies([
    {
      name: 'selectedProvider',
      value: 'OpenAI',
      url: baseUrl,
      sameSite: 'Lax',
      secure: baseUrl.startsWith('https://'),
    },
    {
      name: 'selectedModel',
      value: 'gpt-4o',
      url: baseUrl,
      sameSite: 'Lax',
      secure: baseUrl.startsWith('https://'),
    },
  ]);

  await page.goto(chatUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  const promptInput = getPromptLocator();

  await promptInput.waitFor({ state: 'visible', timeout: 90000 });

  if (!skipPromptCapture) {
    await promptInput.fill(
      `Reply exactly with ${responseToken} on the first line. Then add two short bullets under the heading Next actions.`,
    );
    await promptInput.press('Enter');

    await page.waitForFunction(
      (token) => {
        const text = document.body.innerText || '';
        const tokenCount = text.split(token).length - 1;
        const headingCount = text.split('Next actions').length - 1;
        const hasAssistantToken = tokenCount >= 2;
        const hasAssistantHeading = headingCount >= 2;
        const hasError = /server error|error details/i.test(text);
        return hasAssistantToken && hasAssistantHeading && !hasError;
      },
      responseToken,
      { timeout: 180000 },
    );
  } else {
    const text = await page.evaluate(() => document.body.innerText || '');

    if (/server error|error details|custom error/i.test(text)) {
      throw new Error('Cannot capture system-in-action screenshot: page contains a server error marker.');
    }
  }

  await openWorkspaceTabIfAvailable();
  await page.screenshot({ path: outputPath, fullPage: true });
  console.log(`Wrote ${outputPath}`);
} finally {
  await context.close();
  await browser.close();
}
