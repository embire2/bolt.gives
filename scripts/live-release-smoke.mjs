#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.BASE_URL || 'https://alpha1.bolt.gives';
const providerName = process.env.E2E_PROVIDER || 'OpenAI';
const modelName = process.env.E2E_MODEL || 'gpt-5.4';
const outDir = process.env.E2E_OUTPUT_DIR || 'output/playwright';
const secure = baseUrl.startsWith('https://');
const appToken = `LUMA_${Date.now().toString(36)}`;

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

function selectBreakTarget(files) {
  const preferredPatterns = [
    /(^|\/)src\/App\.(tsx|jsx|js|ts)$/i,
    /(^|\/)app\/page\.(tsx|jsx|js|ts)$/i,
    /(^|\/)src\/main\.(tsx|jsx|js|ts)$/i,
  ];

  for (const pattern of preferredPatterns) {
    const match = Object.entries(files).find(([filePath, dirent]) => {
      return dirent?.type === 'file' && !dirent.isBinary && typeof dirent.content === 'string' && pattern.test(filePath);
    });

    if (match) {
      return match;
    }
  }

  throw new Error('Could not find a generated application entry file to corrupt for recovery testing.');
}

async function waitForPromptSurface(page) {
  await page.waitForSelector('textarea[placeholder="How can Bolt help you today?"]', { timeout: 90000 });
}

async function waitForCommentaryInCurrentSurface(page, label) {
  await page.waitForFunction(
    (expectedLabel) => {
      const bodyText = document.body.innerText || '';
      return bodyText.includes(expectedLabel) && bodyText.includes('Live Commentary');
    },
    label,
    { timeout: 180000 },
  );
}

async function waitForPreviewToRender(page) {
  await page.getByRole('tab', { name: /^Workspace$/i }).click();
  await waitForCommentaryInCurrentSurface(page, 'Live Commentary');

  const previewButton = page.getByRole('button', { name: /^Preview$/i }).first();

  if (await previewButton.isVisible().catch(() => false)) {
    await previewButton.click();
  }

  await page.waitForSelector('iframe[title="preview"]', { timeout: 180000 });
  await page.waitForFunction(
    ({ expectedToken }) => {
      const frame = document.querySelector('iframe[title="preview"]');
      const previewText = frame?.contentDocument?.body?.innerText || '';

      return (
        previewText.includes(expectedToken) ||
        (previewText.includes('Doctor') &&
          previewText.includes('Appointment') &&
          (previewText.includes('SMTP') || previewText.includes('Reminder')))
      );
    },
    { expectedToken: appToken },
    { timeout: 240000 },
  );
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

try {
  await fs.mkdir(outDir, { recursive: true });
  await context.addCookies([
    buildCookie('selectedProvider', providerName),
    buildCookie('selectedModel', modelName),
  ]);

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
  await waitForPromptSurface(page);
  await page.screenshot({ path: path.join(outDir, 'live-smoke-before-submit.png'), fullPage: true });

  await page.fill(
    'textarea[placeholder="How can Bolt help you today?"]',
    `Build a React doctor appointment scheduling website for a clinic with calendar slots, patient booking form, doctor selection, SMTP reminder settings, and a visible heading "${appToken}". Implement it and run it.`,
  );
  await page.press('textarea[placeholder="How can Bolt help you today?"]', 'Enter');

  await waitForCommentaryInCurrentSurface(page, 'Live Commentary');
  await waitForPreviewToRender(page);
  await page.screenshot({ path: path.join(outDir, 'live-smoke-preview-ready.png'), fullPage: true });

  const previewSrc = await page.locator('iframe[title="preview"]').first().getAttribute('src');

  if (!previewSrc) {
    throw new Error('Preview iframe is missing its src attribute.');
  }

  const { sessionId } = extractSessionDetailsFromPreviewUrl(new URL(previewSrc, baseUrl).toString());
  const snapshotResponse = await runtimeFetch(page, sessionId, 'snapshot');

  if (!snapshotResponse.ok || !snapshotResponse.payload?.files) {
    throw new Error(`Failed to fetch runtime snapshot: ${snapshotResponse.status}`);
  }

  const [targetPath, targetDirent] = selectBreakTarget(snapshotResponse.payload.files);
  const originalContent = targetDirent.content;
  const brokenContent = `${originalContent}\nconst __bolt_live_release_smoke_break = ;\n`;

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
  const initialRecoveryToken = Number(syncResponse.payload?.recovery?.token || snapshotResponse.payload?.recovery?.token || 0);
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

    const livePreviewText = await page.evaluate(() => {
      const frame = document.querySelector('iframe[title="preview"]');
      return frame?.contentDocument?.body?.innerText || '';
    });

    if (
      livePreviewText.includes(appToken) ||
      (livePreviewText.includes('Doctor') &&
        livePreviewText.includes('Appointment') &&
        (livePreviewText.includes('SMTP') || livePreviewText.includes('Reminder')))
    ) {
      sawRestoredPreview = true;
    }

    const liveSnapshotResponse = await runtimeFetch(page, sessionId, 'snapshot');

    if (liveSnapshotResponse.ok && liveSnapshotResponse.payload?.files?.[targetPath]?.content === originalContent) {
      sawRestoredSnapshot = true;
    }

    if (sawError && sawRestoredSnapshot && sawRestoredPreview && lastStatus.healthy && lastStatus.status === 'ready') {
      break;
    }

    await delay(1500);
  }

  if (!lastStatus || !(breakApplied && sawError && sawRestoredSnapshot && sawRestoredPreview && lastStatus.healthy)) {
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

  await page.screenshot({ path: path.join(outDir, 'live-smoke-after-restore.png'), fullPage: true });
  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        providerName,
        modelName,
        sessionId,
        targetPath,
        appToken,
        sawError,
        sawRunningRecovery,
        sawRestoredRecovery,
        sawRecoveryTokenAdvance,
      },
      null,
      2,
    ),
  );
} finally {
  await context.close();
  await browser.close();
}
