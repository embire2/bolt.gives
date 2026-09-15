#!/usr/bin/env node
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { protectBrowserContext, resolvePublicDestination } from '@bolt/agent/server/public-web-fetch.mjs';

const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const blocked = [];
  const allowed = [];
  const check = await protectBrowserContext(context, {
    fetchPage: async (url, options) => {
      try {
        await resolvePublicDestination(url, {
          signal: options.signal,
          resolve: async (host) => [
            { address: host === 'private.example.com' ? '10.0.0.1' : '93.184.216.34', family: 4 },
          ],
        });
      } catch (error) {
        blocked.push(url);
        throw error;
      }
      allowed.push(url);

      return {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: Buffer.from(
          '<h1>Public browsing fixture</h1><img src="http://127.0.0.1/private"><iframe src="https://private.example.com/secret"></iframe>',
        ),
      };
    },
  });
  const page = await context.newPage();
  await page.goto('https://example.com/fixture');
  assert.equal(await page.locator('h1').innerText(), 'Public browsing fixture');
  assert.equal(allowed.length, 1);
  assert.equal(blocked.length, 2);
  check();
  await context.close();
  console.log(
    JSON.stringify({
      ok: true,
      checks: ['real-chromium-public-document', 'loopback-subresource-blocked', 'private-dns-iframe-blocked'],
      privateNetworkRequests: 0,
    }),
  );
} finally {
  await browser.close();
}
