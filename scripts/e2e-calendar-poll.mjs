#!/usr/bin/env node
// Poll the preview iframe text over time to see when (if ever) the Calendar replaces the starter.
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:8788';
const outDir = 'output/e2e-calendar';
const token = `CAL_POLL_${Date.now().toString(36)}`;
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();

await page.addInitScript(({ provider, model }) => {
  const host = window.location.hostname;
  localStorage.setItem(
    `bolt_instance_selection_v1:${host}`,
    JSON.stringify({ providerName: provider, modelName: model, updatedAt: new Date().toISOString() }),
  );
  localStorage.setItem('bolt_provider_model_selection_v1', JSON.stringify({ [provider]: model }));
}, { provider: 'FREE', model: 'deepseek/deepseek-v3.2' });

const started = Date.now();
function t() { return ((Date.now() - started) / 1000).toFixed(1); }

await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('textarea', { timeout: 60000 });
console.log(`[+${t()}s] loaded`);

const ta = page.locator('textarea').first();
await ta.fill(`Build a tiny React calendar app with a month grid and an Add Event button. The root <h1> must contain the exact string "${token}". Keep it to 5 small files max.`);
await ta.press('Enter');
console.log(`[+${t()}s] submitted token=${token}`);

// Track both action-runner progress and preview content over 6 minutes.
const deadline = Date.now() + 6 * 60 * 1000;
let lastPreview = '';
let lastBodyTail = '';
let iframeSeen = false;

while (Date.now() < deadline) {
  const hasIframe = await page.locator('iframe[title="preview"]').first().isVisible().catch(() => false);
  if (hasIframe && !iframeSeen) {
    iframeSeen = true;
    console.log(`[+${t()}s] iframe mounted`);
  }
  let previewText = '';
  if (hasIframe) {
    try {
      const pf = page.frameLocator('iframe[title="preview"]').first();
      previewText = (await pf.locator('body').innerText({ timeout: 1500 }).catch(() => '')) || '';
    } catch {}
  }
  if (previewText && previewText !== lastPreview) {
    const excerpt = previewText.replace(/\s+/g, ' ').slice(0, 140);
    console.log(`[+${t()}s] preview="${excerpt}"`);
    lastPreview = previewText;
    if (previewText.includes(token)) {
      console.log(`[+${t()}s] SUCCESS token visible in preview`);
      break;
    }
  }

  const body = (await page.locator('body').innerText().catch(() => '')) || '';
  const tail = body.slice(-350).replace(/\s+/g, ' ');
  if (tail !== lastBodyTail) {
    lastBodyTail = tail;
    const m = body.match(/DOING in-progress[^\n]{0,300}|npm install|pnpm install|Start application[^\n]{0,200}|Error[^\n]{0,200}|Preview startup[^\n]{0,200}|preview not yet verified[^\n]{0,200}|verified ready[^\n]{0,200}/i);
    if (m) console.log(`[+${t()}s] ui-status: ${m[0].slice(0, 240)}`);
  }

  await new Promise(r => setTimeout(r, 3000));
}

await page.screenshot({ path: path.join(outDir, 'poll-final.png'), fullPage: true });
await fs.writeFile(path.join(outDir, 'poll-final-preview.txt'), lastPreview || '(none)');
await fs.writeFile(path.join(outDir, 'poll-final-body.txt'), (await page.locator('body').innerText().catch(() => '')) || '');

console.log('final preview:', lastPreview?.slice(0, 200));
await ctx.close();
await browser.close();
