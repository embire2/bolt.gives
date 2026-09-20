import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http2 from 'node:http2';
import { execFileSync } from 'node:child_process';
import { createGzip } from 'node:zlib';
import { build } from 'vite';
import { chromium } from 'playwright';

// Synthetic transport regression, not real-provider acceptance. TLS is loopback-only.
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'bolt-chat-transport-'));
const key = path.join(temporary, 'key.pem');
const cert = path.join(temporary, 'cert.pem');
execFileSync(
  'openssl',
  [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    key,
    '-out',
    cert,
    '-subj',
    '/CN=localhost',
    '-days',
    '1',
  ],
  { stdio: 'ignore' },
);

const bundle = await build({
  configFile: false,
  logLevel: 'error',
  build: {
    write: false,
    minify: false,
    lib: { entry: 'modules/project/src/lib/hooks/chat-fetch.ts', name: 'BoltChatTransport', formats: ['iife'] },
  },
});
let clientCancelled = false;
const server = http2.createSecureServer({ key: await fs.readFile(key), cert: await fs.readFile(cert) });
const sessions = new Set();
server.on('session', (session) => {
  sessions.add(session);
  session.on('close', () => sessions.delete(session));
});
server.on('request', async (request, response) => {
  if (request.url === '/') {
    response.end('<!doctype html><title>Owned stream fixture</title>');
    return;
  }

  if (request.headers['x-csrf-token'] === undefined) {
    response.writeHead(403);
    response.end();

    return;
  }

  response.on('error', () => {});
  response.on('close', () => {
    if (request.url === '/cancel' && response.stream.rstCode === http2.constants.NGHTTP2_CANCEL) {
      clientCancelled = true;
    }
  });
  response.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Encoding': 'gzip',
    'Cache-Control': 'no-store',
  });

  const gzip = createGzip();
  gzip.on('error', () => {});
  gzip.pipe(response);

  const chunks = request.url === '/cancel' ? 1000 : 12;

  for (let index = 0; index < chunks && !response.destroyed; index++) {
    gzip.write(`0:${JSON.stringify('fixture '.repeat(100))}\n`);
    gzip.flush();
    await new Promise((resolve) => setTimeout(resolve, 10));

    if (request.url === '/failure' && index === 2) {
      response.stream.close(http2.constants.NGHTTP2_INTERNAL_ERROR);
      break;
    }
  }
  gzip.end('d:{"finishReason":"stop"}\n');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true });
  const failures = [];
  const finished = [];
  page.on('requestfailed', (request) => {
    if (new URL(request.url()).pathname === '/complete') {
      failures.push(request.failure());
    }
  });
  page.on('requestfinished', (request) => {
    if (new URL(request.url()).pathname === '/complete') {
      finished.push(request.url());
    }
  });
  await page.goto(`https://127.0.0.1:${server.address().port}/`);
  await page.addScriptTag({ content: (Array.isArray(bundle) ? bundle[0] : bundle).output[0].code });

  const complete = await page.evaluate(async () => {
    for (let run = 0; run < 20; run++) {
      const response = await BoltChatTransport.securedChatFetch('/complete', { method: 'POST' });
      const reader = response.body.getReader();
      let content = '';
      const decoder = new TextDecoder();

      for (;;) {
        const next = await reader.read();

        if (next.done) {
          break;
        }

        content += decoder.decode(next.value);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      reader.releaseLock();

      if (!content.endsWith('d:{"finishReason":"stop"}\n')) {
        return false;
      }
    }
    return true;
  });
  assert(complete);

  const negative = await page.evaluate(async () => {
    let failure = false;

    try {
      const response = await BoltChatTransport.securedChatFetch('/failure', { method: 'POST' });
      await response.text();
    } catch {
      failure = true;
    }

    const controller = new AbortController();
    const response = await BoltChatTransport.securedChatFetch('/cancel', { method: 'POST', signal: controller.signal });
    const reader = response.body.getReader();
    await reader.read();
    controller.abort();

    let cancelled = false;

    try {
      for (;;) {
        if ((await reader.read()).done) {
          break;
        }
      }
    } catch (error) {
      cancelled = error.name === 'AbortError';
    }
    reader.releaseLock();

    return { failure, cancelled };
  });
  await page.waitForTimeout(500);
  assert.deepEqual(failures, []);
  assert.equal(finished.length, 20);
  assert(negative.failure && negative.cancelled && clientCancelled, JSON.stringify({ ...negative, clientCancelled }));
  console.log(
    JSON.stringify({
      ok: true,
      fixture: 'loopback HTTP/2 TLS, synthetic bytes',
      completeStreams: 20,
      realNetworkFailure: true,
      userCancellation: true,
    }),
  );
} finally {
  await browser.close();

  for (const session of sessions) {
    session.destroy();
  }
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(temporary, { recursive: true, force: true });
}
