#!/usr/bin/env node
// Capture raw /api/chat SSE bytes for a Calendar prompt from inside the page context.
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

await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('textarea', { timeout: 60000 });

// pull the csrf cookie + build a chat request from inside the page
const { status, bytes, err } = await page.evaluate(async () => {
  try {
    const cookies = Object.fromEntries(document.cookie.split(';').map(s => s.trim().split('=').map(decodeURIComponent)));
    const csrf = cookies['csrf_token'] || '';
    const body = {
      messages: [
        { role: 'user', content: 'Build a React calendar app with month view and an Add Event button. Render a visible heading "CAL_DIAG". Implement it.' }
      ],
      providerName: 'FREE',
      modelName: 'deepseek/deepseek-v3.2',
      chatId: 'diag-' + Date.now(),
      files: {},
      promptId: 'default',
      contextOptimization: false,
      supabase: null,
    };
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': csrf,
        'accept': 'text/event-stream',
      },
      body: JSON.stringify(body),
    });
    const reader = res.body.getReader();
    const chunks = [];
    const started = Date.now();
    const deadline = started + 120000;
    while (Date.now() < deadline) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(new TextDecoder().decode(value, { stream: true }));
      if (chunks.join('').length > 64 * 1024) break;
    }
    return { status: res.status, bytes: chunks.join(''), err: null };
  } catch (e) {
    return { status: -1, bytes: '', err: String(e?.stack || e) };
  }
});

await fs.writeFile(path.join(outDir, 'chat-sse.raw.txt'), bytes || '');
console.log('status', status, 'bytes', bytes?.length || 0, 'err', err);
console.log('---- first 4000 chars ----');
console.log((bytes || '').slice(0, 4000));
console.log('---- last 2000 chars ----');
console.log((bytes || '').slice(-2000));
await ctx.close();
await browser.close();
