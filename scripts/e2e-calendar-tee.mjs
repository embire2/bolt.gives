#!/usr/bin/env node
// Submit a Calendar prompt via the UI and tee the /api/chat SSE stream to a file.
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:8788';
const outDir = 'output/e2e-calendar';
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

// CDP-based SSE tee: use Fetch.enable + Fetch.requestPaused
const client = await ctx.newCDPSession(page);
const sseChunks = [];
let sseDone = false;

page.on('response', async (res) => {
  if (res.url().endsWith('/api/chat') && res.request().method() === 'POST') {
    console.log('[tee] /api/chat response headers captured status=', res.status());
  }
});

// Simpler: use chromium CDP Network.getResponseBody after finish — SSE doesn't have a single body.
// Instead, use page.route with a fetch proxy that tees the streaming body.
await page.route('**/api/chat', async (route) => {
  const req = route.request();
  const body = req.postData();
  const headers = { ...(await req.allHeaders()) };
  try {
    const resp = await fetch(baseUrl + new URL(req.url()).pathname + new URL(req.url()).search, {
      method: req.method(),
      headers,
      body,
    });
    const buf = Buffer.alloc(0);
    const chunks = [];
    const reader = resp.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
      sseChunks.push(Buffer.from(value));
    }
    const all = Buffer.concat(chunks);
    sseDone = true;
    await route.fulfill({
      status: resp.status,
      headers: Object.fromEntries(resp.headers.entries()),
      body: all,
    });
  } catch (e) {
    console.error('proxy failed', e);
    await route.abort();
  }
});

await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('textarea', { timeout: 60000 });

const ta = page.locator('textarea').first();
await ta.fill('Build a small single-page React calendar app that lets the user add and view events. Render a visible heading that contains the exact text "CAL_DIAG". Implement complete files and run it.');
await ta.press('Enter');

// Wait up to 180s for the SSE stream to finish OR for content to accumulate.
const deadline = Date.now() + 180000;
while (Date.now() < deadline) {
  if (sseDone) break;
  await new Promise(r => setTimeout(r, 500));
}

const blob = Buffer.concat(sseChunks).toString('utf8');
await fs.writeFile(path.join(outDir, 'chat-stream.raw.txt'), blob);
console.log('captured bytes:', blob.length, 'done:', sseDone);
console.log('---- first 3000 ----');
console.log(blob.slice(0, 3000));
console.log('---- last 3000 ----');
console.log(blob.slice(-3000));

await ctx.close();
await browser.close();
