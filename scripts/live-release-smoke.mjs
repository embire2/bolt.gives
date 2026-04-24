#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { isStaticAssetRequestUrl, selectBreakTarget } from './live-release-smoke-utils.mjs';

const baseUrl = process.env.BASE_URL || 'https://alpha1.bolt.gives';
const providerName = process.env.E2E_PROVIDER || 'OpenAI';
const modelName = process.env.E2E_MODEL || 'gpt-5.4';
const outDir = process.env.E2E_OUTPUT_DIR || 'output/playwright';
const secure = baseUrl.startsWith('https://');
const appToken = `LUMA_${Date.now().toString(36)}`;
const progressStartMs = Date.now();

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function elapsedSeconds() {
  return Math.round((Date.now() - progressStartMs) / 1000);
}

function logProgress(stage, details = '') {
  const suffix = details ? ` | ${details}` : '';
  console.log(`[live-smoke +${elapsedSeconds()}s] ${stage}${suffix}`);
}

async function readPreviewText(page) {
  const previewFrame = page.frameLocator('iframe[title="preview"]').first();

  return previewFrame
    .locator('body')
    .innerText({ timeout: 1500 })
    .catch(() => '');
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
  const deadline = Date.now() + 90000;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt += 1;

    const promptVisible = await page
      .locator('textarea')
      .first()
      .isVisible()
      .catch(() => false);

    if (promptVisible) {
      logProgress('Prompt surface ready');
      return;
    }

    const bodyText = ((await page.locator('body').innerText().catch(() => '')) || '').slice(0, 300).replace(/\s+/g, ' ');
    logProgress('Waiting for prompt surface', `attempt=${attempt} body="${bodyText}"`);
    await delay(3000);
  }

  throw new Error('Prompt surface never became visible.');
}

async function waitForCommentaryInCurrentSurface(page, label) {
  const deadline = Date.now() + 180000;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt += 1;

    const ready = await page
      .evaluate((expectedLabel) => {
        const bodyText = document.body.innerText || '';
        return bodyText.includes(expectedLabel) && bodyText.includes('Live Commentary');
      }, label)
      .catch(() => false);

    if (ready) {
      logProgress('Commentary visible', `label=${label}`);
      return;
    }

    logProgress('Waiting for commentary', `attempt=${attempt} label=${label}`);
    await delay(4000);
  }

  throw new Error(`Commentary did not become visible for label: ${label}`);
}

async function waitForPreviewToRender(page) {
  await page.getByRole('tab', { name: /^Workspace$/i }).click();
  logProgress('Switched to workspace tab');
  await waitForCommentaryInCurrentSurface(page, 'Live Commentary');

  const previewButton = page.getByRole('button', { name: /^Preview$/i }).first();

  if (await previewButton.isVisible().catch(() => false)) {
    await previewButton.click();
    logProgress('Selected preview pane');
  }

  const iframeDeadline = Date.now() + 180000;

  while (Date.now() < iframeDeadline) {
    const iframeVisible = await page.locator('iframe[title="preview"]').isVisible().catch(() => false);

    if (iframeVisible) {
      logProgress('Preview iframe mounted');
      break;
    }

    logProgress('Waiting for preview iframe');
    await delay(4000);
  }

  const previewDeadline = Date.now() + 240000;
  let attempt = 0;

  while (Date.now() < previewDeadline) {
    attempt += 1;
    const previewText = await readPreviewText(page);

    if (
      previewText.includes(appToken) ||
      (previewText.includes('Doctor') &&
        previewText.includes('Appointment') &&
        (previewText.includes('SMTP') || previewText.includes('Reminder')))
    ) {
      logProgress('Preview rendered expected application', `attempt=${attempt}`);
      return;
    }

    logProgress('Waiting for preview content', `attempt=${attempt} previewExcerpt="${previewText.slice(0, 160).replace(/\s+/g, ' ')}"`);
    await delay(5000);
  }

  throw new Error('Preview never rendered the expected application content.');
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
const asset404s = [];

try {
  page.on('response', (response) => {
    if (response.status() === 404 && isStaticAssetRequestUrl(response.url())) {
      asset404s.push(`${response.status()} ${response.url()}`);
    }
  });

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

  logProgress('Opening application', `baseUrl=${baseUrl} provider=${providerName} model=${modelName}`);
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await waitForPromptSurface(page);
  if (asset404s.length > 0) {
    throw new Error(`Asset 404s detected during startup: ${asset404s.join(', ')}`);
  }
  await page.screenshot({ path: path.join(outDir, 'live-smoke-before-submit.png'), fullPage: true });

  logProgress('Submitting prompt');
  const promptTextarea = page.locator('textarea').first();
  await promptTextarea.fill(
    `Build a React doctor appointment scheduling website for a clinic with calendar slots, patient booking form, doctor selection, SMTP reminder settings, and a visible heading "${appToken}". Implement it and run it.`,
  );
  await promptTextarea.press('Enter');

  await waitForCommentaryInCurrentSurface(page, 'Live Commentary');
  await waitForPreviewToRender(page);
  if (asset404s.length > 0) {
    throw new Error(`Asset 404s detected before preview became ready: ${asset404s.join(', ')}`);
  }
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
  logProgress('Injected intentional preview break', `targetPath=${targetPath}`);

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

    const livePreviewText = await readPreviewText(page);

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
      logProgress('Preview recovery confirmed');
      break;
    }

    logProgress(
      'Waiting for recovery',
      `status=${lastStatus.status} healthy=${lastStatus.healthy} sawError=${sawError} restoredSnapshot=${sawRestoredSnapshot} restoredPreview=${sawRestoredPreview}`,
    );
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
  if (asset404s.length > 0) {
    throw new Error(`Asset 404s detected during smoke: ${asset404s.join(', ')}`);
  }
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
