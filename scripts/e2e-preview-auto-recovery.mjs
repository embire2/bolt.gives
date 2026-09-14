#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { closePageThenCleanupSession, resolveCodingAppUrl, selectBreakTarget } from './live-release-smoke-utils.mjs';

const baseUrl = resolveCodingAppUrl(process.env.BASE_URL || 'https://alpha1.bolt.gives');
const providerName = process.env.E2E_PROVIDER || 'FREE';
const modelName = process.env.E2E_MODEL || 'gpt-5.6-sol';
const outDir = process.env.E2E_OUTPUT_DIR || 'output/playwright';
const secure = baseUrl.startsWith('https://');
const token = `AUTO_RECOVERY_${Date.now().toString(36)}`;
const subtitle = 'Auto recovery baseline';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildCookie(name, value) {
  return {
    name,
    value,
    url: baseUrl,
    sameSite: 'Lax',
    secure,
  };
}

function extractSessionDetailsFromPreviewUrl(previewUrl) {
  const parsed = new URL(previewUrl);
  const match = parsed.pathname.match(/\/runtime\/preview\/([^/]+)\/(\d+)/);

  if (!match) {
    throw new Error(`Could not extract runtime session from preview URL: ${previewUrl}`);
  }

  return {
    sessionId: match[1],
    port: Number(match[2]),
  };
}

async function waitForPromptSurface(page) {
  const prompt = page.locator('textarea:visible').first();
  await prompt.waitFor({ state: 'visible', timeout: 90000 });

  return prompt;
}

async function waitForPreviewToRender(page, expectedText) {
  const previewButton = page.getByRole('button', { name: /^Preview$/i }).first();

  if (await previewButton.isVisible().catch(() => false)) {
    await previewButton.click();
  }

  await page.waitForSelector('iframe[title="preview"]', { timeout: 180000 });
  await page
    .frameLocator('iframe[title="preview"]')
    .first()
    .getByText(expectedText, { exact: true })
    .first()
    .waitFor({ state: 'visible', timeout: 240000 });
}

async function runtimeFetch(page, sessionId, suffix, options = {}) {
  return page.evaluate(
    async ({ requestedSessionId, requestedSuffix, requestedOptions }) => {
      const response = await fetch(`/runtime/sessions/${encodeURIComponent(requestedSessionId)}/${requestedSuffix}`, {
        method: requestedOptions.method || 'GET',
        headers: requestedOptions.body
          ? {
              'Content-Type': 'application/json',
            }
          : undefined,
        body: requestedOptions.body ? JSON.stringify(requestedOptions.body) : undefined,
      });

      const text = await response.text();
      let parsed = null;

      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = text;
      }

      return {
        ok: response.ok,
        status: response.status,
        payload: parsed,
      };
    },
    {
      requestedSessionId: sessionId,
      requestedSuffix: suffix,
      requestedOptions: options,
    },
  );
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
});
const page = await context.newPage();
let ownedSessionId;
let expectedBreak = false;
const unexpectedErrors = [];
const injectedErrors = [];
const chatStreams = [];
page.on('pageerror', (error) => {
  if (expectedBreak && /Unexpected token|Unexpected.*["'];["']/.test(error.message)) {
    injectedErrors.push(error.message);
  } else {
    unexpectedErrors.push(error.message);
  }
});
page.on('response', async (response) => {
  const url = new URL(response.url());

  if (url.pathname === '/api/chat' && response.request().method() === 'POST') {
    const stream = { status: response.status(), complete: false };
    chatStreams.push(stream);
    stream.complete = !(await response.finished());
  }

  if (response.status() >= 500) {
    const failure = `${response.status()} ${url.origin}${url.pathname}`;

    if (expectedBreak && /\/src\/|\/runtime\/preview\//.test(url.pathname)) {
      injectedErrors.push(failure);
    } else {
      unexpectedErrors.push(failure);
    }
  }
});

try {
  await fs.mkdir(outDir, { recursive: true });
  await context.addCookies([buildCookie('selectedProvider', providerName), buildCookie('selectedModel', modelName)]);

  await page.addInitScript(
    ({ provider, model }) => {
      const host = window.location.hostname;
      localStorage.setItem(
        `bolt_instance_selection_v1:${host}`,
        JSON.stringify({
          providerName: provider,
          modelName: model,
          updatedAt: new Date().toISOString(),
        }),
      );
      localStorage.setItem('bolt_provider_model_selection_v1', JSON.stringify({ [provider]: model }));
    },
    {
      provider: providerName,
      model: modelName,
    },
  );

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.getByLabel('Name and Surname').fill('Recovery Acceptance');
  await page.getByLabel('Email address', { exact: true }).fill(`recovery-${Date.now()}@example.invalid`);
  await page.getByLabel('Country', { exact: true }).fill('South Africa');
  await page.getByRole('button', { name: 'Create profile and continue' }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });

  const prompt = await waitForPromptSurface(page);

  await prompt.fill(
    `Build a minimal React app that renders the exact heading "${token}" and the subtitle "${subtitle}". Keep it lightweight and run it.`,
  );
  await prompt.press('Enter');

  await waitForPreviewToRender(page, token);
  await page
    .getByRole('button', { name: 'Stop generation', exact: true })
    .waitFor({ state: 'hidden', timeout: 180000 });

  if (!chatStreams.length || chatStreams.some((stream) => stream.status !== 200 || !stream.complete)) {
    throw new Error('The baseline chat did not complete normally before recovery injection.');
  }

  await page.screenshot({ path: path.join(outDir, 'preview-auto-recovery-before-break.png'), fullPage: true });

  const previewSrc = await page.locator('iframe[title="preview"]').first().getAttribute('src');

  if (!previewSrc) {
    throw new Error('Preview iframe is missing its src attribute.');
  }

  const { sessionId } = extractSessionDetailsFromPreviewUrl(new URL(previewSrc, baseUrl).toString());
  ownedSessionId = sessionId;

  const snapshotResponse = await runtimeFetch(page, sessionId, 'snapshot');

  if (!snapshotResponse.ok || !snapshotResponse.payload?.files) {
    throw new Error(`Failed to fetch runtime snapshot: ${snapshotResponse.status}`);
  }

  const [targetPath, targetDirent] = selectBreakTarget(snapshotResponse.payload.files);
  const originalContent = targetDirent.content;
  const brokenContent = `${originalContent}\nconst __bolt_auto_recovery_break = ;\n`;

  expectedBreak = true;

  const syncResponse = await runtimeFetch(page, sessionId, 'sync', {
    method: 'POST',
    body: {
      files: {
        [targetPath]: {
          ...targetDirent,
          content: brokenContent,
        },
      },
      prune: false,
    },
  });

  if (!syncResponse.ok) {
    throw new Error(`Failed to corrupt generated app for recovery smoke: ${syncResponse.status}`);
  }

  const breakDeadline = Date.now() + 30000;
  let breakApplied = false;

  while (Date.now() < breakDeadline) {
    const brokenSnapshotResponse = await runtimeFetch(page, sessionId, 'snapshot');

    if (brokenSnapshotResponse.ok && brokenSnapshotResponse.payload?.files?.[targetPath]?.content === brokenContent) {
      breakApplied = true;
      break;
    }

    await delay(500);
  }

  if (!breakApplied) {
    throw new Error('Intentional preview break never reached the hosted runtime snapshot.');
  }

  const deadline = Date.now() + 180000;
  const initialRecoveryToken = Number(
    syncResponse.payload?.recovery?.token || snapshotResponse.payload?.recovery?.token || 0,
  );
  let sawError = false;
  let sawRunningRecovery = false;
  let sawRestoredRecovery = false;
  let sawRecoveryTokenAdvance = false;
  let sawRestoredSnapshot = false;
  let sawRestoredPreview = false;
  let lastStatus = null;

  while (Date.now() < deadline) {
    const statusResponse = await runtimeFetch(page, sessionId, 'preview-status');

    if (!statusResponse.ok || !statusResponse.payload) {
      throw new Error(`Failed to read preview status during recovery smoke: ${statusResponse.status}`);
    }

    lastStatus = statusResponse.payload;

    if (lastStatus.status === 'error' || lastStatus.alert) {
      sawError = true;
    }

    if (lastStatus.recovery?.state === 'running') {
      sawRunningRecovery = true;
    }

    if (lastStatus.recovery?.state === 'restored') {
      sawRestoredRecovery = true;
    }

    if (Number(lastStatus.recovery?.token || 0) > initialRecoveryToken) {
      sawRecoveryTokenAdvance = true;
    }

    const livePreviewText = await page
      .frameLocator('iframe[title="preview"]')
      .first()
      .locator('body')
      .innerText({ timeout: 2000 })
      .catch(() => '');

    if (livePreviewText.includes(token) && livePreviewText.includes(subtitle)) {
      sawRestoredPreview = true;
    }

    const liveSnapshotResponse = await runtimeFetch(page, sessionId, 'snapshot');

    if (liveSnapshotResponse.ok && liveSnapshotResponse.payload?.files?.[targetPath]?.content === originalContent) {
      sawRestoredSnapshot = true;
    }

    if (
      (sawError || sawRecoveryTokenAdvance) &&
      sawRestoredSnapshot &&
      sawRestoredPreview &&
      lastStatus.healthy &&
      lastStatus.status === 'ready'
    ) {
      break;
    }

    await delay(1500);
  }

  if (
    !lastStatus ||
    !(
      breakApplied &&
      (sawError || sawRecoveryTokenAdvance) &&
      sawRestoredSnapshot &&
      sawRestoredPreview &&
      lastStatus.healthy
    )
  ) {
    throw new Error(
      `Preview did not auto-recover after intentional break. Last status: ${JSON.stringify(
        {
          breakApplied,
          lastStatus,
          sawError,
          sawRunningRecovery,
          sawRestoredRecovery,
          sawRecoveryTokenAdvance,
          sawRestoredSnapshot,
          sawRestoredPreview,
        },
        null,
        2,
      )}`,
    );
  }

  expectedBreak = false;
  await waitForPreviewToRender(page, token);
  await waitForPreviewToRender(page, subtitle);

  const restoredSnapshotResponse = await runtimeFetch(page, sessionId, 'snapshot');

  if (!restoredSnapshotResponse.ok || !restoredSnapshotResponse.payload?.files?.[targetPath]) {
    throw new Error('Failed to fetch restored runtime snapshot.');
  }

  if (restoredSnapshotResponse.payload.files[targetPath].content !== originalContent) {
    throw new Error('Runtime snapshot did not restore the corrupted file back to the last known good content.');
  }

  if (!(await page.locator('textarea:visible').first().isVisible()) || unexpectedErrors.length) {
    throw new Error(`Recovery lost the composer or produced unexpected errors: ${JSON.stringify(unexpectedErrors)}`);
  }

  await page.screenshot({ path: path.join(outDir, 'preview-auto-recovery-after-restore.png'), fullPage: true });
  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        providerName,
        modelName,
        sessionId,
        targetPath,
        token,
        sawError,
        sawRunningRecovery,
        sawRestoredRecovery,
        sawRecoveryTokenAdvance,
        chatStreams,
        injectedErrors,
        unexpectedErrors,
      },
      null,
      2,
    ),
  );
} finally {
  await closePageThenCleanupSession(
    () => page.close(),
    async () => {
      if (ownedSessionId) {
        const response = await context.request.delete(
          new URL(`/runtime/sessions/${ownedSessionId}/command`, baseUrl).toString(),
        );
        console.log(JSON.stringify({ cleanup: response.status(), ownedSessionId }));
      }
    },
  );
  await context.close();
  await browser.close();
}
