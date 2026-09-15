#!/usr/bin/env node
// Isolated production-build acceptance. No fleet, public DNS or live database changes.
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { parse } from 'dotenv';

const exec = promisify(execFile);
const repo = process.cwd();
const out = path.resolve(process.env.BOLT_E2E_OUTPUT_DIR || path.join(repo, 'output/playwright/phase1-20260912'));
await fs.mkdir(out, { recursive: true });

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bolt-phase1-e2e-'));
await fs.chmod(root, 0o755);

// Keep the selected toolchain accessible to the unprivileged fixture without opening the operator's home.
const fixtureNode = path.join(root, 'node');
await fs.copyFile(process.execPath, fixtureNode);
await fs.chmod(fixtureNode, 0o755);

const rootless = process.env.BOLT_E2E_ROOTLESS === '1';
const originIsolation = process.env.BOLT_E2E_ORIGIN_ISOLATION === '1';
const uid = rootless ? Number(process.env.BOLT_PROJECT_RUNNER_UID) : process.getuid() === 0 ? 65534 : process.getuid();
const gid = rootless ? Number(process.env.BOLT_PROJECT_RUNNER_GID) : process.getuid() === 0 ? 65534 : process.getgid();
const children = [];
const logs = [];
const report = { stages: [], errors: [], expectedErrors: [], chatRequests: [], streams: [], runtimeUid: uid };
const stage = (name, detail = {}) => {
  const entry = { name, at: new Date().toISOString(), ...detail };
  report.stages.push(entry);
  console.log(JSON.stringify(entry));
};

async function port() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  const value = server.address().port;
  await new Promise((resolve) => server.close(resolve));

  return value;
}

const appPort = await port();
const runtimePort = await port();
const browsePort = await port();
const tlsPort = originIsolation ? await port() : undefined;
const base = `${originIsolation ? 'https' : 'http'}://phase1.localhost:${tlsPort || appPort}`;
const runtimeBase = `http://127.0.0.1:${runtimePort}/runtime`;
const ownerToken = crypto.randomBytes(32).toString('hex');
const quotaSecret = crypto.randomBytes(32).toString('hex');
const replay = process.env.BOLT_E2E_HOOK_REPLAY === '1';
const local = replay ? {} : parse(await fs.readFile(path.join(repo, '.env.local')).catch(() => Buffer.from('')));
const magnetKey = replay
  ? 'magnet-user-owned-replay-fixture-not-a-key'
  : process.env.MAGNET_API_KEY || local.MAGNET_API_KEY;

if (!magnetKey) {
  throw new Error('Set MAGNET_API_KEY in the ignored operator .env.local to run live generation.');
}

const secrets = [magnetKey, ownerToken];
const redact = (value) => secrets.reduce((text, secret) => text.split(secret).join('[redacted]'), String(value));
let runtime;
let previewGateway;
let browser;
let page;
let expectedFailure = false;
let ownerLoggedIn = false;
const guestRequests = new WeakSet();
const securityProbeRequests = new WeakSet();
const securityProbeResponses = [];
let injectedStreamFailure = false;

async function start(label, script, env, nonRoot = false) {
  const fd = fsSync.openSync(path.join(out, `${label}.log`), 'w', 0o600);
  logs.push(fd);

  const child = spawn(fixtureNode, [script], {
    cwd: nonRoot ? root : repo,
    env: { PATH: '/usr/bin:/bin', HOME: path.join(root, 'home'), NODE_ENV: 'development', ...env },
    ...(nonRoot ? { uid, gid } : {}),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => fsSync.writeSync(fd, redact(chunk)));
  }
  children.push(child);

  return child;
}

async function stop(child) {
  if (!child || child.exitCode !== null) {
    return;
  }

  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 8000)),
  ]);

  if (child.exitCode === null) {
    child.kill('SIGKILL');
  }
}

async function healthy(url) {
  const end = Date.now() + 40_000;

  while (Date.now() < end) {
    if (
      await fetch(url)
        .then((response) => response.ok)
        .catch(() => false)
    ) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Isolated service did not become healthy: ${new URL(url).pathname}`);
}

async function previewContains(values, timeout = 360_000) {
  const end = Date.now() + timeout;
  let nextUpdate = Date.now() + 15_000;

  while (Date.now() < end) {
    if (report.errors.length) {
      throw new Error(`Unexpected browser/HTTP error: ${report.errors[0]}`);
    }

    const text = await page
      .frameLocator('iframe[title="preview"]')
      .first()
      .locator('body')
      .innerText({ timeout: 1000 })
      .catch(() => '');

    if (values.every((value) => text.includes(value))) {
      return;
    }

    if (Date.now() >= nextUpdate) {
      stage('waiting-for-preview', {
        markers: values.length,
        chatRequests: report.chatRequests.length,
        errors: [...new Set(report.errors)],
      });
      nextUpdate = Date.now() + 15_000;
    }

    await page.waitForTimeout(1500);
  }
  throw new Error(`Preview did not contain the requested ${values.length} acceptance markers.`);
}

try {
  stage('preparing-isolated-runtime');

  for (const name of ['node_modules', 'modules', 'scripts']) {
    await exec('cp', [name === 'node_modules' ? '-al' : '-a', path.join(repo, name), path.join(root, name)]);
  }
  await fs.copyFile(path.join(repo, 'package.json'), path.join(root, 'package.json'));
  await fs.copyFile(path.join(repo, 'pnpm-lock.yaml'), path.join(root, 'pnpm-lock.yaml'));

  for (const name of ['home', 'workspaces']) {
    await fs.mkdir(path.join(root, name), { mode: 0o700 });

    if (process.getuid() === 0) {
      await fs.chown(path.join(root, name), uid, gid);
    }
  }

  let previewOriginEnv = {};

  if (originIsolation) {
    const gatewayPort = tlsPort;
    const signingSecret = crypto.randomBytes(32).toString('hex');
    const keyPath = path.join(root, 'preview-test.key');
    const certPath = path.join(root, 'preview-test.crt');
    await exec('openssl', [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      keyPath,
      '-out',
      certPath,
      '-subj',
      '/CN=*.localhost',
      '-days',
      '1',
    ]);
    secrets.push(signingSecret);
    previewOriginEnv = {
      BOLT_PREVIEW_ORIGIN_TEMPLATE: `https://{id}.localhost:${gatewayPort}`,
      BOLT_PREVIEW_SIGNING_SECRET: signingSecret,
    };
    previewGateway = https.createServer(
      { key: await fs.readFile(keyPath), cert: await fs.readFile(certPath) },
      (request, response) => {
        if (
          process.env.BOLT_E2E_STREAM_FAILURE === '1' &&
          !injectedStreamFailure &&
          request.headers.host === `phase1.localhost:${tlsPort}` &&
          new URL(request.url, base).pathname === '/api/chat'
        ) {
          injectedStreamFailure = true;
          request.resume();
          stage('fixture-first-stream-error');
          response.writeHead(200, {
            'Content-Type': 'text/plain; charset=utf-8',
            'x-vercel-ai-data-stream': 'v1',
            'Cache-Control': 'no-store',
          });
          response.end(
            'f:{"messageId":"empty-failure-fixture"}\n0:""\n3:"Custom error: Generation stream timed out while waiting for model output."\n',
          );

          return;
        }

        const upstream = http.request(
          {
            host: '127.0.0.1',
            port: request.headers.host === `phase1.localhost:${tlsPort}` ? appPort : runtimePort,
            path: request.url,
            method: request.method,
            headers: { ...request.headers, 'x-forwarded-proto': 'https' },
          },
          (incoming) => {
            if (new URL(request.url, base).searchParams.has('__bolt_isolation_probe')) {
              securityProbeResponses.push({
                status: incoming.statusCode,
                method: request.method,
                origin: request.headers.origin,
              });
            }

            response.writeHead(incoming.statusCode, incoming.headers);
            incoming.pipe(response);
          },
        );
        upstream.on('error', () => {
          response.writeHead(503);
          response.end('Runtime intentionally unavailable');
        });
        request.pipe(upstream);
      },
    );
    previewGateway.on('upgrade', (request, socket, head) => {
      const upstream = net.connect(runtimePort, '127.0.0.1', () => {
        upstream.write(
          `${request.method} ${request.url} HTTP/1.1\r\n${Object.entries(request.headers)
            .map(([key, value]) => `${key}: ${value}`)
            .join('\r\n')}\r\n\r\n`,
        );
        upstream.write(head);
        socket.pipe(upstream).pipe(socket);
      });
      upstream.on('error', () => socket.destroy());
      socket.on('error', () => upstream.destroy());
      socket.on('close', () => upstream.destroy());
    });
    await new Promise((resolve) => previewGateway.listen(gatewayPort, '127.0.0.1', resolve));
  }

  // The runtime must not inherit any operator/provider/Cloudflare/Stripe/SMTP keys.
  const runtimeEnv = {
    ...previewOriginEnv,
    ...(rootless
      ? Object.fromEntries(
          Object.entries(process.env).filter(([key]) =>
            [
              'BOLT_PROJECT_EXECUTION_MODE',
              'BOLT_PROJECT_RUNNER_UID',
              'BOLT_PROJECT_RUNNER_GID',
              'BOLT_PROJECT_RUNNER_HOME',
              'BOLT_PROJECT_CONTAINER_IMAGE',
            ].includes(key),
          ),
        )
      : {}),
    RUNTIME_HOST: '127.0.0.1',
    RUNTIME_PORT: String(runtimePort),
    RUNTIME_WORKSPACE_DIR: path.join(root, 'workspaces'),
    RUNTIME_PREVIEW_PORT_START: '6200',
    RUNTIME_PREVIEW_PORT_END: '6299',
    RUNTIME_NODE_OPTIONS: '--max-old-space-size=1024',
    RUNTIME_MANAGED_INSTANCE_SYNC_INTERVAL_MS: '0',
    BOLT_PROJECT_DATABASE_ENABLED: 'false',
    BOLT_SELF_HOST_MODE: 'single-user',
    BOLT_SELF_HOST_ACCESS_TOKEN: ownerToken,
    BOLT_FREE_USAGE_QUOTA_SECRET: quotaSecret,
  };
  runtime = await start('runtime', path.join(root, 'scripts/runtime-server.mjs'), runtimeEnv, true);
  await healthy(`${runtimeBase}/health`);
  await start('app', path.join(repo, 'scripts/e2e-phase1-server.mjs'), {
    PORT: String(appPort),
    BOLT_E2E_REPO: repo,
    BOLT_E2E_HOOK_REPLAY: process.env.BOLT_E2E_HOOK_REPLAY,
    BOLT_E2E_REPLAY_DELAY_MS: process.env.BOLT_E2E_REPLAY_DELAY_MS,
    BOLT_RUNTIME_CONTROL_URL: runtimeBase,
    BOLT_RUNTIME_CONTROL_PUBLIC_URL: runtimeBase,
    BOLT_APP_PUBLIC_URL: base,
    BOLT_PROFILE_COOKIE_SECRET: crypto.randomBytes(32).toString('hex'),
    BOLT_SELF_HOST_MODE: 'single-user',
    MAGNET_API_KEY: magnetKey,
    BOLT_FREE_USAGE_QUOTA_SECRET: quotaSecret,
    WEB_BROWSE_SERVICE_URL: `http://127.0.0.1:${browsePort}`,
  });
  await healthy(`http://127.0.0.1:${appPort}/pricing`);
  stage('production-build-ssr-healthy');

  browser = await chromium.launch({ headless: true, args: ['--host-resolver-rules=MAP *.localhost 127.0.0.1'] });

  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    ignoreHTTPSErrors: originIsolation,
  });
  page = await context.newPage();
  report.simulatedProvider = process.env.BOLT_E2E_HOOK_REPLAY === '1';

  const diagnosticSession = await context.newCDPSession(page);
  const executionContexts = new Map();
  diagnosticSession.on('Runtime.executionContextCreated', ({ context }) => {
    executionContexts.set(context.id, { origin: context.origin, frameId: context.auxData?.frameId });
  });
  diagnosticSession.on('Runtime.executionContextDestroyed', ({ executionContextId }) => {
    executionContexts.delete(executionContextId);
  });
  diagnosticSession.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
    report.browserExceptions ||= [];
    report.browserExceptions.push({
      context: executionContexts.get(exceptionDetails.executionContextId),
      text: redact(exceptionDetails.exception?.description || exceptionDetails.text).slice(0, 4000),
      frames: exceptionDetails.stackTrace?.callFrames.slice(0, 15).map((frame) => ({
        function: frame.functionName,
        url: redact(frame.url),
        line: frame.lineNumber,
        column: frame.columnNumber,
      })),
    });
  });
  await diagnosticSession.send('Runtime.enable');
  page.on('pageerror', (error) => {
    report.errors.push(redact(error.message).slice(0, 300));
    report.errorStacks ||= [];
    report.errorStacks.push(redact(error.stack || error.message).slice(0, 4000));
  });
  page.on('response', async (response) => {
    const url = new URL(response.url());
    const isolatedProject =
      originIsolation && url.hostname.endsWith('.localhost') && url.hostname !== 'phase1.localhost';

    if (
      !(isolatedProject || url.pathname.startsWith('/runtime/preview/')) ||
      !/(?:\/src\/(?:App|main)\.|\/node_modules\/\.vite\/deps\/(?:react|chunk))/.test(url.pathname) ||
      !response.ok()
    ) {
      return;
    }

    report.previewModules ||= [];

    if (report.previewModules.length >= 80) {
      return;
    }

    const body = await response.text().catch(() => '');
    report.previewModules.push({
      origin: url.origin,
      url: redact(`${url.pathname}${url.search}`),
      imports: [...body.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => redact(match[1])).slice(0, 30),
    });
  });
  page.on('response', async (response) => {
    if (new URL(response.url()).pathname !== '/api/chat') {
      return;
    }

    const entry = { status: response.status(), startedAt: new Date().toISOString() };
    report.streams.push(entry);

    try {
      const body = redact(await response.text());
      entry.finishedAt = new Date().toISOString();
      entry.bytes = body.length;
      entry.tail = body.slice(-6000);
    } catch (error) {
      entry.failure = redact(error.message);
    }
  });
  page.on('response', async (response) => {
    const responseUrl = new URL(response.url());

    if (
      response.status() >= 400 &&
      (responseUrl.hostname === 'phase1.localhost' || (originIsolation && responseUrl.hostname.endsWith('.localhost')))
    ) {
      const entry = `${response.status()} ${responseUrl.origin}${responseUrl.pathname}`;
      (expectedFailure ||
      (response.status() === 409 && new URL(response.url()).pathname.endsWith('/snapshot')) ||
      (response.status() === 403 && securityProbeRequests.has(response.request())) ||
      (response.status() === 401 && guestRequests.has(response.request()))
        ? report.expectedErrors
        : report.errors
      ).push(entry);

      if (response.status() >= 500) {
        const detail = redact(await response.text().catch(() => 'Response body unavailable')).slice(0, 500);
        stage('http-failure-detail', { response: entry, detail });
      }
    }
  });
  page.on('request', (request) => {
    if (new URL(request.url()).searchParams.has('__bolt_isolation_probe')) {
      securityProbeRequests.add(request);
    }

    if (/\/sessions\/[^/]+\/sync$/.test(new URL(request.url()).pathname)) {
      const body = request.postDataJSON();
      stage('browser-source-sync', {
        prune: body?.prune,
        files: Object.entries(body?.files || {})
          .filter(([name]) => /App\.[jt]sx?$/.test(name))
          .map(([name, file]) => ({
            name,
            followup: /_FOLLOWUP/.test(file.content || ''),
            bytes: file.content?.length,
          })),
      });
    }

    if (!ownerLoggedIn) {
      guestRequests.add(request);
    }

    if (new URL(request.url()).pathname === '/api/chat' && request.method() === 'POST') {
      const body = request.postDataJSON();
      report.chatRequests.push({
        origin: new URL(request.url()).origin,
        model: body.model || body.selectedModel,
        provider: body.provider?.name || body.selectedProvider,
        messageCount: body.messages?.length,
      });
    }
  });

  const pricing = await page.goto(`${base}/pricing`);

  if (pricing.status() !== 200) {
    throw new Error('Pricing SSR failed.');
  }

  await page.screenshot({ path: path.join(out, 'pricing.png') });
  stage('pricing-rendered');
  await page.goto(`${base}/chat`);
  await page.getByLabel('Owner access token').fill(ownerToken);
  await page.getByRole('button', { name: 'Open my workspace' }).click();
  await page.getByRole('dialog', { name: 'Your private workspace' }).waitFor({ state: 'hidden', timeout: 30_000 });
  stage('owner-login-through-ui-no-database');
  ownerLoggedIn = true;

  const prompt = page.locator('textarea').filter({ visible: true }).first();
  await prompt.waitFor({ state: 'visible' });

  const marker = `PHASE1_${Date.now().toString(36)}`;
  const followup = `${marker}_FOLLOWUP`;
  await prompt.fill(
    `Build a small React task board with the exact heading ${marker}, three task cards, an input with the exact placeholder "Task title", and an Add task button. Typing a title then clicking Add task must append that title as a visible task card without opening a dialog. Implement the working app and run Preview.`,
  );
  await prompt.press('Enter');
  stage('first-prompt-submitted');

  if (process.env.BOLT_E2E_STREAM_FAILURE === '1') {
    const deadline = Date.now() + 60_000;

    while (report.chatRequests.length < 2 && Date.now() < deadline) {
      await page.waitForTimeout(500);
    }

    if (!injectedStreamFailure) {
      throw new Error('The stream-failure fixture was not exercised.');
    }

    if (report.chatRequests.length < 2) {
      throw new Error('The empty failed stream did not dispatch an automatic continuation.');
    }

    stage('empty-stream-failure-retried-automatically');
  }

  await previewContains([marker]);
  await page
    .getByRole('button', { name: 'Stop generation', exact: true })
    .waitFor({ state: 'hidden', timeout: 120_000 });
  await previewContains([marker]);
  await page.screenshot({ path: path.join(out, 'first-preview.png') });

  const frame = page.frameLocator('iframe[title="preview"]').first();
  const addedTask = `${marker}_ADDED`;
  await frame.getByPlaceholder('Task title', { exact: true }).fill(addedTask);
  await frame.getByRole('button', { name: /Add task/i }).click();
  await frame.getByText(addedTask, { exact: true }).waitFor({ timeout: 5000 });

  stage('first-preview-interactive');

  if (originIsolation) {
    const isolatedFrame = page.frames().find((candidate) => new URL(candidate.url(), base).hostname.startsWith('pv-'));

    if (!isolatedFrame || new URL(isolatedFrame.url()).origin === new URL(base).origin) {
      throw new Error('Preview did not load on its isolated browser origin.');
    }

    const boundary = await isolatedFrame.evaluate(() => {
      let parentStorage = false;
      let parentDocument = false;

      try {
        void parent.localStorage.length;
        parentStorage = true;
      } catch {}

      try {
        void parent.document.body;
        parentDocument = true;
      } catch {}
      localStorage.setItem('preview-owned-fixture', 'retained');

      return {
        parentStorage,
        parentDocument,
        ownStorage: localStorage.getItem('preview-owned-fixture'),
        platformCookie: document.cookie.includes('bolt_profile_session'),
      };
    });

    if (
      boundary.parentStorage ||
      boundary.parentDocument ||
      boundary.platformCookie ||
      boundary.ownStorage !== 'retained'
    ) {
      throw new Error('Preview browser isolation/storage failed.');
    }

    const target = `${base}/runtime/sessions/isolated-fixture/command?__bolt_isolation_probe=1`;
    await isolatedFrame.evaluate(async (url) => {
      try {
        await fetch(url, { method: 'POST', credentials: 'include', body: '{}' });
      } catch {}
    }, target);

    // Chromium can suppress response events for CORS failures; inspect the actual fixture proxy result.
    if (
      !securityProbeResponses.some(
        (response) =>
          response.status === 403 &&
          response.method === 'POST' &&
          response.origin === new URL(isolatedFrame.url()).origin,
      )
    ) {
      throw new Error(
        `Cross-origin runtime mutation was not denied by the server: ${JSON.stringify(securityProbeResponses)}`,
      );
    }

    stage('preview-origin-and-platform-mutation-isolation-passed', boundary);

    if (process.env.BOLT_E2E_HOOK_REPLAY === '1') {
      const reported = page.waitForResponse(
        (response) =>
          new URL(response.url()).origin === new URL(isolatedFrame.url()).origin &&
          new URL(response.url()).pathname === '/__bolt/error' &&
          response.request().method() === 'POST',
      );
      await isolatedFrame.evaluate(() => {
        window.dispatchEvent(new ErrorEvent('error', { message: 'Owned browser reporting acceptance fixture' }));
      });

      const response = await reported;

      if (response.status() !== 202) {
        throw new Error(`Isolated browser error report failed: ${response.status()}`);
      }

      await previewContains([marker]);
      stage('isolated-browser-error-reported-and-project-retained');
    }
  }

  await page.getByRole('button', { name: 'Code', exact: true }).click();
  await page.waitForTimeout(3000);

  if (await page.locator('iframe[title="preview"]').first().isVisible()) {
    throw new Error('Code selection switched back to Preview.');
  }

  if (!(await prompt.isVisible())) {
    throw new Error('Follow-up prompt is hidden in Code.');
  }

  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  stage('code-selection-preserved');
  await prompt.fill(
    `Keep the existing task board, exact heading and all features. Add the exact visible subtitle ${followup}.`,
  );
  await prompt.press('Enter');
  await previewContains([marker, followup]);
  await page
    .getByRole('button', { name: 'Stop generation', exact: true })
    .waitFor({ state: 'hidden', timeout: 120_000 });
  stage('followup-preview-rendered');
  await page.waitForTimeout(5000);

  const projectUrl = page.url();
  report.projectPath = new URL(projectUrl).pathname;

  const previewUrl = await page.locator('iframe[title="preview"]').first().getAttribute('src');
  const sessionId = previewUrl.match(/\/runtime\/preview\/([^/]+)/)?.[1];

  if (!sessionId) {
    throw new Error('No managed runtime identity in Preview.');
  }

  const snapshotStarted = performance.now();
  const snapshotResponse = await fetch(`${runtimeBase}/sessions/${sessionId}/snapshot`);

  if (!snapshotResponse.ok) {
    throw new Error(`Snapshot returned ${snapshotResponse.status}.`);
  }

  const snapshot = await snapshotResponse.json();

  if (Object.keys(snapshot.files).some((name) => /\/(\.cache|\.local|node_modules|dist|build)\//.test(name))) {
    throw new Error('Generated trees leaked into the snapshot.');
  }

  report.snapshotBytes = Buffer.byteLength(JSON.stringify(snapshot));
  report.snapshotEntries = Object.keys(snapshot.files).length;
  report.snapshotElapsedMs = Math.round(performance.now() - snapshotStarted);

  const assertDiskSource = async (checkpoint) => {
    const content = await fs.readFile(path.join(root, 'workspaces', sessionId, 'src/App.tsx'), 'utf8');

    if (!content.includes(marker) || !content.includes(followup)) {
      throw new Error(`Runtime source lost the requested change at ${checkpoint}`);
    }
  };
  await assertDiskSource('before navigation');

  const runtimeMemory = await fs.readFile(`/proc/${runtime.pid}/status`, 'utf8');
  report.runtimeHighWaterKiB = Number(runtimeMemory.match(/^VmHWM:\s+(\d+)/m)?.[1]);
  await page.goto(`${base}/pricing`);
  await page.goto(projectUrl);
  await previewContains([marker, followup], 60_000);
  stage('project-restored-after-navigation');
  await assertDiskSource('after navigation');
  await page.reload();
  await previewContains([marker, followup], 60_000);
  await page.getByText('Preview is healthy and ready for inspection.', { exact: true }).waitFor({ timeout: 30_000 });

  if (await page.getByText('Waiting for the first concrete runtime step.', { exact: false }).count()) {
    throw new Error('Restored healthy Preview still shows first-step waiting commentary.');
  }

  await page.screenshot({ path: path.join(out, 'restored-preview.png') });
  stage('history-and-preview-restored-after-reload');
  await assertDiskSource('after reload');
  expectedFailure = true;
  await stop(runtime);
  await assertDiskSource('after runtime shutdown');
  runtime = await start('runtime-restarted', path.join(root, 'scripts/runtime-server.mjs'), runtimeEnv, true);
  await healthy(`${runtimeBase}/health`);
  await assertDiskSource('after runtime startup');
  await page.reload();
  await previewContains([marker, followup], 90_000);
  expectedFailure = false;
  stage('owner-history-and-preview-survive-runtime-restart');

  const repeats = Math.min(30, Math.max(0, Number(process.env.BOLT_E2E_RELOAD_REPEATS) || 0));

  if (repeats) {
    const devtools = await context.newCDPSession(page);
    await devtools.send('Network.enable');
    await devtools.send('Network.setCacheDisabled', { cacheDisabled: true });

    for (let index = 0; index < repeats; index++) {
      await page.reload();
      await previewContains([marker, followup], 60_000);

      if (!(await prompt.isVisible())) {
        throw new Error('Follow-up prompt disappeared during cold reload soak.');
      }

      stage('cold-reload-soak-passed', { iteration: index + 1 });
    }
    await devtools.detach();
  }

  if (!(await prompt.isVisible())) {
    throw new Error('Follow-up prompt is hidden after restart.');
  }

  if (report.errors.length) {
    throw new Error('Unexpected browser or HTTP errors were recorded.');
  }

  report.ok = true;
} catch (error) {
  report.failure = redact(error.message);
  stage('failed', { reason: report.failure });

  if (page) {
    const previewUrl = await page
      .locator('iframe[title="preview"]')
      .first()
      .getAttribute('src')
      .catch(() => null);
    const failedSessionId = previewUrl?.match(/\/runtime\/preview\/([^/]+)/)?.[1];

    if (failedSessionId) {
      report.runtimeFailure = await fetch(`${runtimeBase}/sessions/${failedSessionId}/preview-status`)
        .then((response) => response.json())
        .catch(() => ({ unavailable: true }));

      const snapshot = await fetch(`${runtimeBase}/sessions/${failedSessionId}/snapshot`)
        .then((response) => response.json())
        .catch(() => ({ files: {} }));
      report.sourceDiagnostics = Object.entries(snapshot.files || {}).map(([name, file]) => ({
        name,
        bytes: typeof file.content === 'string' ? file.content.length : 0,
        requestedApp: /PHASE1_/.test(file.content || ''),
        fallbackStarter: /Your fallback starter is ready/.test(file.content || ''),
      }));
    }

    await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    report.visibleText = redact(
      await page
        .locator('body')
        .innerText()
        .catch(() => ''),
    ).slice(-5000);
  }

  process.exitCode = 1;
} finally {
  await browser?.close();

  if (previewGateway) {
    previewGateway.closeAllConnections();
    await new Promise((resolve) => previewGateway.close(resolve));
  }

  for (const child of children.reverse()) {
    await stop(child);
  }

  for (const fd of logs) {
    fsSync.closeSync(fd);
  }
  report.errors = [...new Set(report.errors)];
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
  await fs.rm(root, { recursive: true, force: true });
  stage('isolated-services-stopped');
}
