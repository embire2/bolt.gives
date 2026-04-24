#!/usr/bin/env node
// Observe: after the chat SSE completes, check the workbench files state.
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:8788';
const outDir = 'output/e2e-calendar';
await fs.mkdir(outDir, { recursive: true });
const token = `CAL_OBS_${Date.now().toString(36)}`;

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

  // Expose workbench for diagnostics
  const orig = Object.defineProperty;
  // nothing - we'll import via eval later
}, { provider: 'FREE', model: 'deepseek/deepseek-v3.2' });

let sseDone = false;
const sseChunks = [];
await page.route('**/api/chat', async (route) => {
  const req = route.request();
  try {
    const resp = await fetch(baseUrl + new URL(req.url()).pathname, {
      method: req.method(),
      headers: await req.allHeaders(),
      body: req.postData(),
    });
    const chunks = [];
    const reader = resp.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
      sseChunks.push(Buffer.from(value));
    }
    sseDone = true;
    await route.fulfill({
      status: resp.status,
      headers: Object.fromEntries(resp.headers.entries()),
      body: Buffer.concat(chunks),
    });
  } catch (e) { await route.abort(); }
});

await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('textarea', { timeout: 60000 });

const ta = page.locator('textarea').first();
await ta.fill(`Build a React calendar app. The heading must contain "${token}". Keep it minimal.`);
await ta.press('Enter');

// Wait for SSE
const deadline = Date.now() + 180000;
while (Date.now() < deadline && !sseDone) await new Promise(r => setTimeout(r, 500));
console.log('sseDone=', sseDone);

// Give runner a moment to drain after stream
await new Promise(r => setTimeout(r, 8000));

// Read workbench store state via dynamic import
const snapshot = await page.evaluate(async () => {
  try {
    const mod = await import('/app/lib/stores/workbench.ts');
    // unlikely resolvable path; fallback to global
    return { err: 'tried-import', mod: String(Object.keys(mod).slice(0, 10)) };
  } catch (e) {
    // Try reading the workbench files store via nanostores — there's usually a global in dev
    const g = globalThis;
    const keys = Object.keys(g).filter(k => /workbench|bolt|webcontainer|__/i.test(k));
    return { err: String(e), globalKeys: keys.slice(0, 40) };
  }
});
console.log('snapshot', snapshot);

// Capture the Files panel in the Code tab instead:
await page.getByRole('tab', { name: /^Workspace$/i }).click().catch(() => {});
await new Promise(r => setTimeout(r, 1500));
const codeBtn = page.getByRole('button', { name: /^Code$/i }).first();
if (await codeBtn.isVisible().catch(() => false)) {
  await codeBtn.click();
  await new Promise(r => setTimeout(r, 1500));
}
const bodyAfterCode = (await page.locator('body').innerText().catch(() => '')) || '';
await fs.writeFile(path.join(outDir, 'obs-body-after-code.txt'), bodyAfterCode);
console.log('---- Code tab body excerpt ----');
console.log(bodyAfterCode.slice(0, 4000).replace(/\s+/g, ' '));

// Check preview text
const hasIframe = await page.locator('iframe[title="preview"]').first().isVisible().catch(() => false);
if (hasIframe) {
  const pf = page.frameLocator('iframe[title="preview"]').first();
  const prev = (await pf.locator('body').innerText({ timeout: 3000 }).catch(() => '')) || '';
  console.log('---- preview body ----');
  console.log(prev.slice(0, 600).replace(/\s+/g, ' '));
  await fs.writeFile(path.join(outDir, 'obs-preview.txt'), prev);
}

await fs.writeFile(path.join(outDir, 'obs-stream.raw.txt'), Buffer.concat(sseChunks).toString('utf8'));
await page.screenshot({ path: path.join(outDir, 'obs-final.png'), fullPage: true });
await ctx.close();
await browser.close();
