#!/usr/bin/env node
// Disposable platform-DB browser matrix. Never reads operator env or sends mail/payments.
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium, expect } from 'playwright/test';

const run = promisify(execFile);
const repo = process.cwd();
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bolt-phase1-accounts-'));
const out = path.join(repo, 'output/playwright/phase1-accounts-20260912');
await fs.mkdir(out, { recursive: true });
await fs.chmod(root, 0o755);

const uid = process.getuid() === 0 ? 65534 : process.getuid();
const gid = process.getuid() === 0 ? 65534 : process.getgid();
const childOptions = {
  cwd: root,
  uid,
  gid,
  env: { PATH: '/usr/bin:/bin', HOME: path.join(root, 'home'), NODE_ENV: 'development' },
};
const children = [];
const fds = [];
const report = { stages: [], errors: [] };
let browser;
let page;

function stage(name) {
  report.stages.push(name);
  console.log(name);
}

async function port() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  const value = server.address().port;
  await new Promise((resolve) => server.close(resolve));

  return value;
}

function start(name, command, args, env = {}, nonRoot = true) {
  const fd = fsSync.openSync(path.join(out, `${name}.log`), 'w', 0o600);
  fds.push(fd);

  const child = spawn(command, args, {
    ...childOptions,
    ...(nonRoot ? {} : { uid: process.getuid(), gid: process.getgid(), cwd: repo }),
    env: { ...childOptions.env, ...env },
    stdio: ['ignore', fd, fd],
  });
  children.push(child);

  return child;
}

async function healthy(url) {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (
      await fetch(url)
        .then((r) => r.ok)
        .catch(() => false)
    ) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Fixture did not start: ${new URL(url).pathname}`);
}

async function chooseOpenAI(tab) {
  await tab.locator('[role="combobox"][aria-controls="provider-listbox"]').click();
  await tab.getByRole('searchbox', { name: 'Search providers', exact: true }).fill('OpenAI');
  await tab
    .getByRole('option', { name: /OpenAI/ })
    .first()
    .click();
  await expect(tab.getByText('OpenAI API Key:', { exact: true })).toBeVisible();
}

try {
  for (const name of ['home', 'pg', 'workspaces']) {
    await fs.mkdir(path.join(root, name), { mode: 0o700 });
    await fs.chown(path.join(root, name), uid, gid);
  }

  for (const name of ['node_modules', 'modules', 'scripts']) {
    await run('cp', [name === 'node_modules' ? '-al' : '-a', path.join(repo, name), path.join(root, name)]);
  }
  await fs.copyFile(path.join(repo, 'package.json'), path.join(root, 'package.json'));

  const pgBin = process.env.BOLT_E2E_PG_BIN || '/usr/lib/postgresql/16/bin';
  const pgPort = await port();
  const runtimePort = await port();
  const appPort = await port();
  await run(
    `${pgBin}/initdb`,
    ['-D', path.join(root, 'pg'), '-A', 'trust', '-U', 'phase1', '--no-locale'],
    childOptions,
  );
  start('postgres', `${pgBin}/postgres`, [
    '-D',
    path.join(root, 'pg'),
    '-h',
    '127.0.0.1',
    '-p',
    String(pgPort),
    '-k',
    path.join(root, 'home'),
  ]);

  for (let attempt = 0; attempt < 40; attempt++) {
    if (
      await run(`${pgBin}/pg_isready`, ['-h', '127.0.0.1', '-p', String(pgPort), '-U', 'phase1'], childOptions)
        .then(() => true)
        .catch(() => false)
    ) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const runtimeBase = `http://127.0.0.1:${runtimePort}/runtime`;
  const quota = crypto.randomBytes(32).toString('hex');
  start('runtime', '/usr/bin/node', [path.join(root, 'scripts/runtime-server.mjs')], {
    RUNTIME_HOST: '127.0.0.1',
    RUNTIME_PORT: String(runtimePort),
    RUNTIME_WORKSPACE_DIR: path.join(root, 'workspaces'),
    BOLT_ADMIN_DATABASE_URL: `postgresql://phase1@127.0.0.1:${pgPort}/postgres`,
    BOLT_ADMIN_DATABASE_SSL: 'disable',
    BOLT_PROJECT_DATABASE_ENABLED: 'false',
    RUNTIME_MANAGED_INSTANCE_SYNC_INTERVAL_MS: '0',
    BOLT_FREE_USAGE_QUOTA_SECRET: quota,
  });
  await healthy(`${runtimeBase}/health`);

  const base = `http://phase1.localhost:${appPort}`;
  start(
    'app',
    '/usr/bin/node',
    [path.join(repo, 'scripts/e2e-phase1-server.mjs')],
    {
      PORT: String(appPort),
      BOLT_E2E_REPO: repo,
      BOLT_APP_PUBLIC_URL: base,
      BOLT_RUNTIME_CONTROL_URL: runtimeBase,
      BOLT_RUNTIME_CONTROL_PUBLIC_URL: runtimeBase,
      BOLT_PROFILE_COOKIE_SECRET: crypto.randomBytes(32).toString('hex'),
      BOLT_FREE_USAGE_QUOTA_SECRET: quota,
    },
    false,
  );
  await healthy(`http://127.0.0.1:${appPort}/pricing`);
  stage('disposable-platform-database-started');

  const nativeZoom = process.env.BOLT_E2E_NATIVE_ZOOM === '1';
  browser = await chromium.launch({
    headless: !nativeZoom,
    args: ['--host-resolver-rules=MAP phase1.localhost 127.0.0.1'],
  });

  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  page = await context.newPage();
  context.on('page', (tab) => tab.on('pageerror', (error) => report.errors.push(error.message)));
  page.on('pageerror', (error) => report.errors.push(error.message));
  await page.goto(`${base}/pricing`);
  await page.getByRole('button', { name: 'Upgrade securely' }).click();
  await page.waitForURL('**/login?returnTo=%2Fpricing');
  stage('signed-out-upgrade-goes-to-login-not-chat-loop');
  await page.setViewportSize({ width: 390, height: 500 });

  const loginSubmit = page.getByRole('button', { name: 'Email my secure login link' });
  await loginSubmit.scrollIntoViewIfNeeded();

  let bounds = await loginSubmit.boundingBox();

  if (!bounds || bounds.y < 0 || bounds.y + bounds.height > 500) {
    throw new Error('Login submit is clipped in a short mobile window.');
  }

  await page.screenshot({ path: path.join(out, 'login-short-window.png') });

  if (nativeZoom) {
    await page.bringToFront();
    await run('xdotool', [
      'key',
      '--clearmodifiers',
      'ctrl+0',
      'ctrl+plus',
      'ctrl+plus',
      'ctrl+plus',
      'ctrl+plus',
      'ctrl+plus',
    ]);
    await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(2);
    await loginSubmit.scrollIntoViewIfNeeded();
    bounds = await loginSubmit.boundingBox();

    const viewportHeight = await page.evaluate(() => innerHeight);

    if (!bounds || bounds.y < 0 || bounds.y + bounds.height > viewportHeight) {
      throw new Error('Login submit is clipped at native browser 200% zoom.');
    }

    await page.screenshot({ path: path.join(out, 'login-native-200-percent-zoom.png') });
    await run('xdotool', ['key', '--clearmodifiers', 'ctrl+0']);
    stage('short-window-login-and-native-200-percent-browser-zoom-scroll');
  } else {
    stage('short-window-login-scroll-native-zoom-not-run');
  }

  async function register(name) {
    await page.goto(`${base}/chat`);

    if (name === 'Alice') {
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();

      for (let tab = 0; tab < 12; tab++) {
        await page.keyboard.press('Tab');

        if (!(await dialog.evaluate((element) => element.contains(document.activeElement)))) {
          throw new Error('Onboarding allowed keyboard focus to escape into the background.');
        }
      }
      await page.keyboard.press('Escape');
      await expect(dialog).toBeVisible();
      await page.getByRole('link', { name: 'Login securely' }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(out, 'onboarding-short-window.png') });
      stage('native-modal-focus-contained-with-reachable-short-window-controls');
    }

    await page.getByLabel('Name and Surname').fill(`${name} Fixture`);
    await page.getByLabel('Email address', { exact: true }).fill(`${name.toLowerCase()}@example.com`);
    await page.getByLabel('Country', { exact: true }).fill('South Africa');
    await page.getByRole('button', { name: 'Create profile and continue' }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await expect(page.locator('textarea').filter({ visible: true }).first()).toBeVisible();
  }
  await register('Alice');
  await page.setViewportSize({ width: 1600, height: 1000 });
  await chooseOpenAI(page);
  await page.getByTitle('Edit API Key', { exact: true }).click();

  const dummy = 'fixture-only-not-a-provider-secret';
  await page.getByPlaceholder('Enter API Key', { exact: true }).fill(dummy);
  await page.getByTitle('Save API Key', { exact: true }).click();
  await expect(page.getByText('Set via UI', { exact: true })).toBeVisible();
  stage('alice-key-saved-through-ui');

  const staleTab = await context.newPage();
  await staleTab.goto(`${base}/chat`);
  await chooseOpenAI(staleTab);
  await staleTab.getByTitle('Edit API Key', { exact: true }).click();
  await expect(staleTab.getByPlaceholder('Enter API Key', { exact: true })).toHaveValue(dummy);
  await page.goto(`${base}/profile`);
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(staleTab.getByRole('dialog')).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => (await context.cookies()).some((c) => c.name === 'apiKeys')).toBe(false);
  await expect.poll(() => staleTab.locator(`input[value="${dummy}"]`).count()).toBe(0);

  const legacy = await staleTab.evaluate(() =>
    ['cody-agent:api-keys:v1', 'cody-agent:api-keys:key:v1'].some((key) => localStorage.getItem(key)),
  );

  if (legacy) {
    throw new Error('Legacy provider key copy survived logout.');
  }

  stage('logout-clears-key-and-stale-tab-editor');
  await register('Bob');
  await chooseOpenAI(page);
  await page.getByTitle('Edit API Key', { exact: true }).click();
  await expect(page.getByPlaceholder('Enter API Key', { exact: true })).toHaveValue('');
  await expect(staleTab.getByRole('dialog')).toBeHidden({ timeout: 20_000 });
  await expect(staleTab.getByText('Set via UI', { exact: true })).toHaveCount(0);
  stage('bob-cannot-inherit-alice-key-in-either-tab');

  await page.getByRole('button', { name: 'Open database connection' }).click();
  await page.getByLabel('Project URL').fill('https://unreachable-db.example.com');
  await page.getByLabel('Publishable or anon key').fill('fixture-public-anon-key');
  await page.getByRole('button', { name: 'Connect Supabase', exact: true }).click();
  await page.getByRole('button', { name: 'Open database connection' }).click();
  await expect(page.getByText('Supabase configured, not verified', { exact: true })).toBeVisible();
  await expect(page.getByText(/Restart Preview after changing or removing credentials/)).toBeVisible();
  await page.getByRole('button', { name: 'Replace credentials' }).click();
  await page.getByLabel('Project URL').fill('https://unreachable-db.example.com');
  await page.getByLabel('Publishable or anon key').fill('replacement-public-anon-key');
  await page.getByRole('button', { name: 'Connect Supabase', exact: true }).click();
  await page.getByRole('button', { name: 'Open database connection' }).click();
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(page.getByText('Supabase configured, not verified', { exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  stage('supabase-configured-not-healthy-rotation-and-disconnect');

  await page.goto(`${base}/pricing`);

  const checkout = page.getByRole('button', { name: 'Upgrade securely' });
  await checkout.click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(checkout).toBeEnabled();

  // No Stripe test key is injected: an explicit local fixture tests only UI routing.
  await page.route('**/api/billing/checkout', (route) =>
    route.fulfill({ status: 200, json: { checkoutUrl: `${base}/pricing?billing=cancelled` } }),
  );
  await checkout.click();
  await page.waitForURL('**/pricing?billing=cancelled');
  await expect(page.getByText(/No upgrade is confirmed for this account/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upgrade securely' })).toBeEnabled();
  stage('checkout-error-retry-and-cancel-fixture-not-stripe-payment');
  await page.screenshot({ path: path.join(out, 'pricing-cancelled.png') });
  await page.goto(`${base}/pricing?billing=success`);
  await expect(page.getByText(/No upgrade is confirmed for this account/)).toBeVisible();
  await expect(page.getByText(/Payment received|plan is active/)).toHaveCount(0);
  stage('forged-payment-success-does-not-activate-or-confirm-a-plan');

  if (report.errors.length) {
    throw new Error('Unexpected browser exceptions in account matrix.');
  }

  report.ok = true;
} catch (error) {
  report.failure = error.message;

  if (page) {
    await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
  }

  process.exitCode = 1;
} finally {
  await browser?.close();

  for (const child of children.reverse()) {
    if (child.exitCode !== null) {
      continue;
    }

    child.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ]);

    if (child.exitCode === null) {
      child.kill('SIGKILL');
    }
  }

  for (const fd of fds) {
    fsSync.closeSync(fd);
  }
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
  await fs.rm(root, { recursive: true, force: true });
  console.log(JSON.stringify(report));
}
