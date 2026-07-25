#!/usr/bin/env node
// e2e: attempt to build a Calendar app via the FREE provider, capture all failure signals.
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { closePageThenCleanupSession, resolveCodingAppUrl } from './live-release-smoke-utils.mjs';

const baseUrl = resolveCodingAppUrl(process.env.BASE_URL || 'http://127.0.0.1:8788');
const outDir = process.env.E2E_OUTPUT_DIR || 'output/e2e-calendar';
const providerName = process.env.E2E_PROVIDER || 'FREE';
const modelName = process.env.E2E_MODEL || 'gpt-5.6-sol';
const appToken = `CAL_${Date.now().toString(36)}`.toUpperCase();
const requireFollowUp = process.env.E2E_REQUIRE_FOLLOWUP === '1';
const requireHistoryRestore = process.env.E2E_REQUIRE_HISTORY_RESTORE === '1';
const requireProjectDatabase = process.env.E2E_REQUIRE_PROJECT_DATABASE === '1';
const followUpModelName = requireFollowUp ? process.env.E2E_FOLLOWUP_MODEL || 'claude-sonnet-5' : null;
const followUpToken = requireFollowUp ? `CAL_FUP_${Date.now().toString(36)}`.toUpperCase() : null;
const totalDeadlineMs = Number(process.env.E2E_DEADLINE_MS || 7 * 60 * 1000);
const runtimeFetchTimeoutMs = Math.max(1000, Number(process.env.E2E_RUNTIME_FETCH_TIMEOUT_MS || '15000'));
const captureChatBody = process.env.E2E_CAPTURE_CHAT_BODY === '1';
const started = Date.now();
const defaultPrompt = `Build a small single-page React calendar app that lets the user add and view events. Render a visible heading that contains the exact text "${appToken}". Implement complete files and run it.`;

function expandTemplate(value) {
  return String(value || '')
    .replace(/\{\{APP_TOKEN\}\}/g, appToken)
    .replace(/\{\{FOLLOW_UP_TOKEN\}\}/g, followUpToken || '');
}

const initialPrompt = expandTemplate(process.env.E2E_PROMPT || defaultPrompt);
const followUpPrompt = expandTemplate(
  process.env.E2E_FOLLOWUP_PROMPT ||
    `Improve the existing calendar project without restarting from scratch. Keep the exact visible text "${appToken}" in the app and add another clearly visible label with the exact text "${followUpToken}". Continue from the current project and keep preview running.`,
);
const expectedInitialTokens = process.env.E2E_EXPECT_TOKENS
  ? expandTemplate(process.env.E2E_EXPECT_TOKENS)
      .split(',')
      .map((token) => token.trim())
      .filter(Boolean)
  : [appToken];

const events = [];
const networkErrors = [];
const consoleErrors = [];
const chatRequests = [];
const chatRequestInputs = [];
const previewStatusEvents = [];
const previewTextHistory = [];
const runtimeSnapshotChecks = [];
let isTearingDown = false;

function elapsed() {
  return ((Date.now() - started) / 1000).toFixed(1);
}
function log(stage, details = '') {
  const line = `[+${elapsed()}s] ${stage}${details ? ' | ' + details : ''}`;
  console.log(line);
  events.push(line);
}
function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function selectVisibleFreeModel(page, model) {
  if (!model) {
    return;
  }

  const selector = page
    .locator('select[aria-label="FREE workspace coding model"]:visible, select[aria-label="FREE coding model"]:visible')
    .first();
  await selector.waitFor({ state: 'visible', timeout: 30000 });
  await selector.selectOption(model);

  if ((await selector.inputValue()) !== model) {
    throw new Error(`FREE model switch did not persist: expected ${model}`);
  }

  log('switched FREE model', model);
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function readPreviewRenderedText(page, timeout = 1500) {
  const body = page.frameLocator('iframe[title="preview"]').first().locator('body');
  await body.waitFor({ state: 'attached', timeout });

  return await body.evaluate((root) => {
    const generatedContent = [];
    const elements = [root, ...root.querySelectorAll('*')];

    for (const element of elements) {
      const elementStyle = getComputedStyle(element);

      if (
        elementStyle.display === 'none' ||
        elementStyle.visibility === 'hidden' ||
        Number(elementStyle.opacity) === 0
      ) {
        continue;
      }

      for (const pseudo of ['::before', '::after']) {
        const style = getComputedStyle(element, pseudo);
        const content = style.content;

        if (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number(style.opacity) !== 0 &&
          content &&
          content !== 'none' &&
          content !== 'normal' &&
          content !== '""' &&
          content !== "''"
        ) {
          generatedContent.push(content);
        }
      }
    }

    return `${root.innerText || ''}\n${generatedContent.join('\n')}`;
  });
}

function extractRuntimeSessionId(previewUrl) {
  if (!previewUrl) {
    return null;
  }

  try {
    const parsed = new URL(previewUrl, baseUrl);
    const match = parsed.pathname.match(/\/runtime\/preview\/([^/]+)\/\d+(?:\/|$)/);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

function fileMapContainsTokens(files, tokens) {
  const text = Object.values(files || {})
    .filter((entry) => entry?.type === 'file' && !entry.isBinary && typeof entry.content === 'string')
    .map((entry) => entry.content)
    .join('\n');

  return tokens.every((token) => text.includes(token));
}

async function fetchRuntimeJson(page, sessionId, endpoint) {
  let timeoutId;
  const timeoutResult = new Promise((resolve) => {
    timeoutId = setTimeout(
      () =>
        resolve({
          ok: false,
          status: 0,
          payload: null,
          error: `${endpoint} timed out after ${runtimeFetchTimeoutMs}ms`,
        }),
      runtimeFetchTimeoutMs + 1000,
    );
  });
  const fetchResult = page
    .evaluate(
      async ({ sessionId, endpoint, timeoutMs }) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const response = await fetch(`/runtime/sessions/${encodeURIComponent(sessionId)}/${endpoint}`, {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
          });

          if (!response.ok) {
            return { ok: false, status: response.status, payload: null };
          }

          return { ok: true, status: response.status, payload: await response.json() };
        } finally {
          clearTimeout(timeout);
        }
      },
      { sessionId, endpoint, timeoutMs: runtimeFetchTimeoutMs },
    )
    .catch((error) => ({
      ok: false,
      status: 0,
      payload: null,
      error: error instanceof Error ? error.message : String(error),
    }));

  try {
    return await Promise.race([fetchResult, timeoutResult]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function terminateRuntimeSession(requestContext, sessionId) {
  if (!sessionId) {
    return { ok: true, skipped: true };
  }

  const cleanupUrl = new URL(`/runtime/sessions/${encodeURIComponent(sessionId)}/command`, baseUrl).toString();

  return await requestContext
    .delete(cleanupUrl, { timeout: runtimeFetchTimeoutMs })
    .then((response) => ({ ok: response.ok(), status: response.status() }))
    .catch((error) => ({
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : String(error),
    }));
}

async function checkRuntimeSnapshotTokens(page, sessionId, tokens) {
  const statusResponse = await fetchRuntimeJson(page, sessionId, 'preview-status');
  const snapshotResponse = await fetchRuntimeJson(page, sessionId, 'snapshot');
  const status = statusResponse.payload || null;
  const snapshotContainsTokens = fileMapContainsTokens(snapshotResponse.payload?.files, tokens);
  const ready = Boolean(status?.preview && status.status === 'ready' && status.healthy);
  const result = {
    elapsedSec: Number(elapsed()),
    ready,
    snapshotContainsTokens,
    status: status?.status || null,
    healthy: status?.healthy ?? null,
    recovery: status?.recovery?.state || null,
    statusFetchOk: statusResponse.ok,
    snapshotFetchOk: snapshotResponse.ok,
    statusFetchError: statusResponse.error || null,
    snapshotFetchError: snapshotResponse.error || null,
    tokens,
  };
  runtimeSnapshotChecks.push(result);

  return {
    ok: ready && snapshotContainsTokens,
    result,
  };
}

function isBenignNetworkFailure(entry) {
  return (
    /REQFAIL HEAD .*\/api\/health :: net::ERR_ABORTED/.test(entry) ||
    /REQFAIL GET .*\/api\/system\/performance :: net::ERR_INSUFFICIENT_RESOURCES/.test(entry) ||
    /REQFAIL POST .*\/api\/chat :: net::ERR_ABORTED/.test(entry) ||
    /REQFAIL GET .*\/runtime\/sessions\/[^/]+\/preview-events :: net::ERR_ABORTED/.test(entry) ||
    /REQFAIL GET .*\/runtime\/preview\/[^/]+\/\d+\/.* :: net::ERR_ABORTED/.test(entry) ||
    /REQFAIL POST .*\/runtime\/sessions\/[^/]+\/command :: net::ERR_ABORTED/.test(entry)
  );
}

function isFatalConsoleError(entry) {
  return (
    /\[error\].*\[chat:.*:diagnostics\]/i.test(entry) ||
    /BOLT_STREAM_TIMEOUT/i.test(entry) ||
    /Custom error: (?:Network error|Generation stream timed out)/i.test(entry)
  );
}

async function keepPreviewSurfaceVisible(page) {
  const workspaceTab = page.getByRole('tab', { name: /^Workspace$/i }).first();

  if (await workspaceTab.isVisible().catch(() => false)) {
    await workspaceTab.click().catch(() => {});
  }

  const previewButton = page.getByRole('button', { name: /^Preview$/i }).first();

  if (await previewButton.isVisible().catch(() => false)) {
    await previewButton.click().catch(() => {});
  }
}

async function ensureChatComposerVisible(page) {
  const chatTab = page.getByRole('tab', { name: /^Chat$/i }).first();

  if (await chatTab.isVisible().catch(() => false)) {
    await chatTab.click().catch(() => {});
  }

  const textarea = page.locator('textarea:visible').first();
  await textarea.waitFor({ state: 'visible', timeout: 90000 });
  await page.waitForFunction(
    () => {
      const elements = Array.from(document.querySelectorAll('textarea'));

      return elements.some((element) => {
        if (!(element instanceof HTMLTextAreaElement)) {
          return false;
        }

        const style = window.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && !element.disabled;
      });
    },
    undefined,
    { timeout: 90000 },
  );

  return textarea;
}

async function waitForChatIdle(page, timeout = 180000) {
  await ensureChatComposerVisible(page);
  await page.waitForFunction(
    () => {
      const visible = (element) => {
        if (!(element instanceof HTMLElement)) {
          return false;
        }

        const style = window.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden';
      };
      const stopButtons = Array.from(document.querySelectorAll('button[aria-label="Stop generation"]'));
      const textareas = Array.from(document.querySelectorAll('textarea'));
      return !stopButtons.some(visible) && textareas.some((element) => visible(element) && !element.disabled);
    },
    undefined,
    { timeout },
  );
  await page.waitForTimeout(1500);
  log('chat stream idle');
}

async function inspectPersistedProject(page, projectPath, expectedTokens) {
  const urlId = decodeURIComponent(String(projectPath || '').replace(/^\/chat\//, ''));

  return page.evaluate(
    async ({ requestedUrlId, tokens }) => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open('boltHistory', 2);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const chat = await new Promise((resolve, reject) => {
        const transaction = database.transaction('chats', 'readonly');
        const request = transaction.objectStore('chats').index('urlId').get(requestedUrlId);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });

      if (!chat) {
        database.close();
        return null;
      }

      const snapshotRecord = await new Promise((resolve, reject) => {
        const transaction = database.transaction('snapshots', 'readonly');
        const request = transaction.objectStore('snapshots').get(chat.id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
      database.close();

      const serializedMessages = JSON.stringify(chat.messages || []);
      const snapshot = snapshotRecord?.snapshot || null;

      return {
        id: chat.id,
        urlId: chat.urlId,
        messageCount: Array.isArray(chat.messages) ? chat.messages.length : 0,
        messagesContainTokens: tokens.every((token) => serializedMessages.includes(token)),
        snapshotFileCount: snapshot?.files ? Object.keys(snapshot.files).length : 0,
        snapshotChatIndex: snapshot?.chatIndex || null,
        runtimeSessionId: snapshot?.runtimeSessionId || null,
      };
    },
    {
      requestedUrlId: urlId,
      tokens: expectedTokens,
    },
  );
}

async function verifyPersistedProjectRestore(page, options) {
  const { projectPath, originalRuntimeSessionId, expectedTokens } = options;
  const persisted = await inspectPersistedProject(page, projectPath, expectedTokens);

  if (
    !persisted ||
    persisted.messageCount < 2 ||
    !persisted.messagesContainTokens ||
    persisted.snapshotFileCount === 0 ||
    persisted.runtimeSessionId !== originalRuntimeSessionId
  ) {
    return {
      ok: false,
      persisted,
      reason: 'The saved chat record, source snapshot, or runtime binding was incomplete.',
    };
  }

  const origin = new URL(baseUrl).origin;
  await page.goto(`${origin}/chat`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await ensureChatComposerVisible(page);
  await page.getByRole('button', { name: 'Open sidebar' }).first().click();

  const escapedProjectPath = projectPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const historyLink = page.locator(`a[href="${escapedProjectPath}"]`).first();
  await historyLink.waitFor({ state: 'visible', timeout: 30000 });
  await Promise.all([page.waitForURL((url) => url.pathname === projectPath, { timeout: 90000 }), historyLink.click()]);
  await ensureChatComposerVisible(page);
  await page.waitForFunction(
    (tokens) => tokens.every((token) => document.body.innerText.includes(token)),
    expectedTokens,
    { timeout: 90000 },
  );
  await keepPreviewSurfaceVisible(page);

  const deadline = Date.now() + 180000;
  let restoredRuntimeSessionId = null;
  let restoredPreviewContainsTokens = false;
  let restoredStatus = null;

  while (Date.now() < deadline) {
    const preview = page.locator('iframe[title="preview"]').first();
    const previewSrc = await preview.getAttribute('src').catch(() => null);

    if (previewSrc) {
      restoredRuntimeSessionId = extractRuntimeSessionId(previewSrc);
    }

    if (await preview.isVisible().catch(() => false)) {
      const previewText = await readPreviewRenderedText(page).catch(() => '');
      restoredPreviewContainsTokens = expectedTokens.every((token) => previewText.includes(token));
    }

    if (restoredRuntimeSessionId) {
      const statusResult = await fetchRuntimeJson(page, restoredRuntimeSessionId, 'preview-status');
      restoredStatus = statusResult.payload;
    }

    if (
      restoredRuntimeSessionId === originalRuntimeSessionId &&
      restoredPreviewContainsTokens &&
      restoredStatus?.status === 'ready' &&
      restoredStatus?.healthy === true
    ) {
      break;
    }

    await delay(1500);
  }

  return {
    ok:
      restoredRuntimeSessionId === originalRuntimeSessionId &&
      restoredPreviewContainsTokens &&
      restoredStatus?.status === 'ready' &&
      restoredStatus?.healthy === true,
    persisted,
    restoredRuntimeSessionId,
    restoredPreviewContainsTokens,
    restoredStatus,
  };
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();

  page.on('console', async (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      const argumentValues = await Promise.all(
        msg.args().map((argument) => argument.jsonValue().catch(() => argument.toString())),
      );
      const serializedArguments = argumentValues
        .map((value) => (typeof value === 'string' ? value : JSON.stringify(value)))
        .join(' ');
      const entry = `[${msg.type()}] ${serializedArguments || msg.text()}`;
      consoleErrors.push(entry);
      log('browser console', entry.slice(0, 800));
    }
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(`[pageerror] ${err.message}`);
  });
  page.on('requestfailed', (req) => {
    if (isTearingDown) {
      return;
    }

    networkErrors.push(`REQFAIL ${req.method()} ${req.url()} :: ${req.failure()?.errorText}`);
  });
  page.on('request', (req) => {
    if (!req.url().includes('/api/chat') || req.method() !== 'POST') {
      return;
    }

    try {
      const payload = req.postDataJSON();
      const requestMessages = Array.isArray(payload?.messages) ? payload.messages : [];
      const latestUserMessage = requestMessages.findLast((message) => message?.role === 'user');
      const latestUserContent =
        typeof latestUserMessage?.content === 'string'
          ? latestUserMessage.content
          : JSON.stringify(latestUserMessage?.content || '');

      chatRequestInputs.push({
        selectedProvider: payload?.selectedProvider || null,
        selectedModel: payload?.selectedModel || null,
        messageCount: requestMessages.length,
        messageRoles: requestMessages.map((message) => message?.role || 'unknown'),
        latestUserContent: normalizeText(latestUserContent).slice(0, 500),
        fileCount: payload?.files && typeof payload.files === 'object' ? Object.keys(payload.files).length : 0,
        hostedRuntimeSessionId: payload?.hostedRuntimeSessionId || null,
        chatMode: payload?.chatMode || null,
      });
    } catch {
      chatRequestInputs.push({ parseError: true });
    }
  });
  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('/api/chat')) {
      const headers = res.headers();
      log(
        'api/chat response',
        `status=${res.status()} deadlineMs=${headers['x-bolt-stream-deadline-ms'] || 'missing'}`,
      );
      let bodyPreview = '';

      if (captureChatBody) {
        try {
          bodyPreview = (await res.text()).slice(0, 12000);
        } catch {}
      }

      chatRequests.push({ status: res.status(), url, headers, bodyPreview });
    }
    if (res.status() >= 400 && !url.includes('/api/chat')) {
      const entry = `HTTP ${res.status()} ${url}`;
      networkErrors.push(entry);
      log('HTTP failure', entry);
    }
  });

  // Pin the requested provider/model in localStorage so the smoke bypasses provider setup.
  await page.addInitScript(
    ({ provider, model }) => {
      const host = window.location.hostname;
      document.cookie = `selectedProvider=${encodeURIComponent(provider)}; Path=/; SameSite=Lax`;
      document.cookie = `selectedModel=${encodeURIComponent(model)}; Path=/; SameSite=Lax`;
      localStorage.setItem(
        `bolt_instance_selection_v1:${host}`,
        JSON.stringify({ providerName: provider, modelName: model, updatedAt: new Date().toISOString() }),
      );
      localStorage.setItem('bolt_provider_model_selection_v1', JSON.stringify({ [provider]: model }));
    },
    { provider: providerName, model: modelName },
  );

  log('goto', baseUrl);
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  const textarea = await ensureChatComposerVisible(page);
  log('prompt surface ready');
  await page.screenshot({ path: path.join(outDir, '01-loaded.png'), fullPage: true });

  log('submit prompt', `token=${appToken} expected=${expectedInitialTokens.join('|')}`);
  await textarea.fill(initialPrompt);
  await textarea.press('Enter');
  await page.screenshot({ path: path.join(outDir, '02-submitted.png'), fullPage: true });

  // Wait: either we see streaming text/commentary OR we hit a failure.
  const checkDeadline = started + totalDeadlineMs;
  let sawAssistantContent = false;
  let sawFiles = false;
  let sawPreview = false;
  let sawError = false;
  let previewContainsToken = false;
  let snapshotContainsToken = false;
  let followUpSubmitted = false;
  let followUpPreviewContainsTokens = false;
  let followUpSnapshotContainsTokens = false;
  let chatBecameIdle = false;
  let finalRuntimeStatus = null;
  let historyRestore = null;
  let historyRestoreVerified = !requireHistoryRestore;
  let projectDatabaseVerified = !requireProjectDatabase;
  let bodyTextLast = '';
  let lastPreviewText = '';
  let lastPreviewSrc = '';
  let hostedRuntimeSessionId = null;
  let lastPreviewStatusKey = '';
  let loggedInitialSnapshotWait = false;
  let loggedFollowUpSnapshotWait = false;

  while (Date.now() < checkDeadline) {
    await keepPreviewSurfaceVisible(page);
    const bodyText =
      (await page
        .locator('body')
        .innerText()
        .catch(() => '')) || '';
    bodyTextLast = bodyText;

    if (
      !sawAssistantContent &&
      bodyText.length > 600 &&
      /assistant|boltArtifact|Creating|Installing|Analyz/i.test(bodyText)
    ) {
      sawAssistantContent = true;
      log('assistant activity detected');
    }
    if (!sawFiles && /package\.json|src\/App|App\.jsx|App\.tsx/.test(bodyText)) {
      sawFiles = true;
      log('file actions detected in UI');
    }
    const iframe = await page
      .locator('iframe[title="preview"]')
      .first()
      .isVisible()
      .catch(() => false);
    const previewSrc = await page
      .locator('iframe[title="preview"]')
      .first()
      .getAttribute('src')
      .catch(() => null);

    if (previewSrc && previewSrc !== lastPreviewSrc) {
      lastPreviewSrc = previewSrc;
      log('preview src', previewSrc);
      hostedRuntimeSessionId = extractRuntimeSessionId(previewSrc);
    }

    if (!sawPreview && iframe) {
      sawPreview = true;
      log('preview iframe mounted');
    }

    if (iframe) {
      try {
        const inner = (await readPreviewRenderedText(page).catch(() => '')) || '';
        const normalizedPreview = normalizeText(inner);

        if (normalizedPreview && normalizedPreview !== lastPreviewText) {
          lastPreviewText = normalizedPreview;
          previewTextHistory.push({
            elapsedSec: Number(elapsed()),
            text: normalizedPreview.slice(0, 500),
          });
          log('preview text', normalizedPreview.slice(0, 200));
        }

        if (expectedInitialTokens.every((token) => inner.includes(token))) {
          previewContainsToken = true;

          if (!hostedRuntimeSessionId) {
            log('SUCCESS: preview contains expected tokens');
            break;
          }

          const snapshotCheck = await checkRuntimeSnapshotTokens(page, hostedRuntimeSessionId, expectedInitialTokens);

          if (snapshotCheck.ok) {
            snapshotContainsToken = true;
            log('SUCCESS: runtime snapshot contains token');
            break;
          }

          if (!loggedInitialSnapshotWait) {
            loggedInitialSnapshotWait = true;
            log('runtime snapshot pending token', JSON.stringify(snapshotCheck.result));
          }
        }
      } catch {
        // Keep polling; cross-origin preview startup can transiently fail reads.
      }
    }

    if (hostedRuntimeSessionId) {
      const runtimeStatus = await page
        .evaluate(async (sessionId) => {
          const response = await fetch(`/runtime/sessions/${encodeURIComponent(sessionId)}/preview-status`);

          if (!response.ok) {
            return null;
          }

          return await response.json();
        }, hostedRuntimeSessionId)
        .catch(() => null);

      if (runtimeStatus) {
        const statusKey = [
          runtimeStatus.status,
          runtimeStatus.healthy,
          runtimeStatus.alert?.description || '',
          runtimeStatus.preview?.baseUrl || '',
        ].join('::');

        if (statusKey !== lastPreviewStatusKey) {
          lastPreviewStatusKey = statusKey;
          const statusSummary = {
            elapsedSec: Number(elapsed()),
            status: runtimeStatus.status,
            healthy: runtimeStatus.healthy,
            alert: runtimeStatus.alert?.description || null,
            recovery: runtimeStatus.recovery?.state || null,
          };
          previewStatusEvents.push(statusSummary);
          log('preview status', JSON.stringify(statusSummary));
        }
      }
    }

    // Surface common error toasts / messages
    const errMatch = bodyText.match(
      /(Something went wrong|Request failed|403|Forbidden|CSRF|Unable to start|preview verification failed|cannot read properties of undefined|Unexpected token|ReferenceError|TypeError|Application Error)/i,
    );
    if (errMatch && !sawError) {
      sawError = true;
      log('UI error text', errMatch[0]);
    }

    await delay(3000);
  }

  if (previewContainsToken && followUpToken) {
    await waitForChatIdle(page);
    chatBecameIdle = true;
    followUpSubmitted = true;
    log('submit follow-up prompt', `token=${followUpToken}`);
    await selectVisibleFreeModel(page, followUpModelName);
    const followUpTextarea = await ensureChatComposerVisible(page);
    await followUpTextarea.fill(followUpPrompt);
    await followUpTextarea.press('Enter');
    chatBecameIdle = false;
    await page.screenshot({ path: path.join(outDir, '03-followup-submitted.png'), fullPage: true });

    while (Date.now() < checkDeadline) {
      await keepPreviewSurfaceVisible(page);
      const bodyText =
        (await page
          .locator('body')
          .innerText()
          .catch(() => '')) || '';
      bodyTextLast = bodyText;

      const previewSrc = await page
        .locator('iframe[title="preview"]')
        .first()
        .getAttribute('src')
        .catch(() => null);

      if (previewSrc && previewSrc !== lastPreviewSrc) {
        lastPreviewSrc = previewSrc;
        log('preview src', previewSrc);
        hostedRuntimeSessionId = extractRuntimeSessionId(previewSrc);
      }

      const iframe = await page
        .locator('iframe[title="preview"]')
        .first()
        .isVisible()
        .catch(() => false);

      if (iframe) {
        try {
          const inner = (await readPreviewRenderedText(page).catch(() => '')) || '';
          const normalizedPreview = normalizeText(inner);

          if (normalizedPreview && normalizedPreview !== lastPreviewText) {
            lastPreviewText = normalizedPreview;
            previewTextHistory.push({
              elapsedSec: Number(elapsed()),
              text: normalizedPreview.slice(0, 500),
            });
            log('preview text', normalizedPreview.slice(0, 200));
          }

          if (inner.includes(appToken) && inner.includes(followUpToken)) {
            followUpPreviewContainsTokens = true;

            if (!hostedRuntimeSessionId) {
              log('SUCCESS: follow-up preview contains both tokens');
              break;
            }

            const snapshotCheck = await checkRuntimeSnapshotTokens(page, hostedRuntimeSessionId, [
              appToken,
              followUpToken,
            ]);

            if (snapshotCheck.ok) {
              followUpSnapshotContainsTokens = true;
              log('SUCCESS: follow-up runtime snapshot contains both tokens');
              break;
            }

            if (!loggedFollowUpSnapshotWait) {
              loggedFollowUpSnapshotWait = true;
              log('follow-up runtime snapshot pending tokens', JSON.stringify(snapshotCheck.result));
            }
          }
        } catch {
          // Keep polling; preview swaps can transiently fail reads.
        }
      }

      const errMatch = bodyText.match(
        /(Something went wrong|Request failed|403|Forbidden|CSRF|Unable to start|preview verification failed|cannot read properties of undefined|Unexpected token|ReferenceError|TypeError|Application Error)/i,
      );
      if (errMatch && !sawError) {
        sawError = true;
        log('UI error text', errMatch[0]);
      }

      await delay(3000);
    }
  }

  await waitForChatIdle(page)
    .then(() => {
      chatBecameIdle = true;
    })
    .catch((error) => {
      log('chat idle wait failed', error instanceof Error ? error.message : String(error));
    });
  bodyTextLast =
    (await page
      .locator('body')
      .innerText()
      .catch(() => bodyTextLast)) || bodyTextLast;
  const finalUiError = bodyTextLast.match(
    /(Server Error|Network error|BOLT_STREAM_TIMEOUT|Needs repair|Something went wrong|Application Error)/i,
  );

  if (finalUiError && !sawError) {
    sawError = true;
    log('final UI error text', finalUiError[0]);
  }

  if (hostedRuntimeSessionId) {
    const finalStatusResult = await fetchRuntimeJson(page, hostedRuntimeSessionId, 'preview-status');
    finalRuntimeStatus = finalStatusResult.payload;
    projectDatabaseVerified = !requireProjectDatabase || finalRuntimeStatus?.projectDatabase?.status === 'connected';
  }

  if (requireHistoryRestore && hostedRuntimeSessionId) {
    const projectUrl = new URL(page.url());
    const restoreTokens = followUpToken ? [appToken, followUpToken] : expectedInitialTokens;

    if (projectUrl.pathname.startsWith('/chat/') && projectUrl.pathname.length > '/chat/'.length) {
      log('verify saved project restore', projectUrl.pathname);
      historyRestore = await verifyPersistedProjectRestore(page, {
        projectPath: projectUrl.pathname,
        originalRuntimeSessionId: hostedRuntimeSessionId,
        expectedTokens: restoreTokens,
      });
      historyRestoreVerified = historyRestore.ok;

      if (historyRestore.restoredStatus) {
        finalRuntimeStatus = historyRestore.restoredStatus;
        projectDatabaseVerified =
          !requireProjectDatabase || finalRuntimeStatus?.projectDatabase?.status === 'connected';
      }

      log('saved project restore result', JSON.stringify(historyRestore));
      await page.screenshot({ path: path.join(outDir, '04-history-restored.png'), fullPage: true });
    } else {
      historyRestore = {
        ok: false,
        reason: `Project did not navigate to a saved /chat/:id route: ${projectUrl.pathname}`,
      };
      historyRestoreVerified = false;
    }
  }

  await page.screenshot({ path: path.join(outDir, '04-final.png'), fullPage: true }).catch((error) => {
    log('final screenshot failed', error instanceof Error ? error.message : String(error));
  });
  const finalBody = bodyTextLast.replace(/\s+/g, ' ').slice(0, 4000);
  await fs.writeFile(path.join(outDir, 'final-body.txt'), bodyTextLast);
  isTearingDown = true;
  const runtimeCleanup = await closePageThenCleanupSession(
    () => page.close(),
    () => terminateRuntimeSession(context.request, hostedRuntimeSessionId),
  );

  if (hostedRuntimeSessionId) {
    log('runtime session cleanup', JSON.stringify(runtimeCleanup));
  }

  const initialSelectionOk = chatRequestInputs.some(
    (input) =>
      input.selectedProvider === providerName &&
      input.selectedModel === modelName &&
      String(input.latestUserContent || '').includes(appToken),
  );
  const followUpSelectionOk =
    !requireFollowUp ||
    chatRequestInputs.some(
      (input) =>
        input.selectedProvider === providerName &&
        input.selectedModel === followUpModelName &&
        String(input.latestUserContent || '').includes(followUpToken),
    );
  const summary = {
    ok:
      previewContainsToken &&
      (!hostedRuntimeSessionId || snapshotContainsToken) &&
      (!requireFollowUp ||
        (followUpPreviewContainsTokens && (!hostedRuntimeSessionId || followUpSnapshotContainsTokens))) &&
      chatBecameIdle &&
      !sawError &&
      chatRequests.some((request) => request.status === 200) &&
      consoleErrors.every((entry) => !isFatalConsoleError(entry)) &&
      networkErrors.every(isBenignNetworkFailure) &&
      (!hostedRuntimeSessionId || (finalRuntimeStatus?.status === 'ready' && finalRuntimeStatus?.healthy === true)) &&
      historyRestoreVerified &&
      projectDatabaseVerified &&
      initialSelectionOk &&
      followUpSelectionOk &&
      runtimeCleanup.ok,
    baseUrl,
    providerName,
    modelName,
    followUpModelName,
    appToken,
    requireFollowUp,
    requireHistoryRestore,
    requireProjectDatabase,
    followUpToken,
    elapsedSec: Number(elapsed()),
    sawAssistantContent,
    sawFiles,
    sawPreview,
    sawError,
    previewContainsToken,
    snapshotContainsToken,
    followUpSubmitted,
    followUpPreviewContainsTokens,
    followUpSnapshotContainsTokens,
    initialSelectionOk,
    followUpSelectionOk,
    chatBecameIdle,
    hostedRuntimeSessionId,
    finalRuntimeStatus,
    historyRestore,
    historyRestoreVerified,
    projectDatabaseVerified,
    runtimeCleanup,
    chatRequestInputs,
    chatRequests,
    consoleErrors: consoleErrors.slice(0, 60),
    fatalConsoleErrors: consoleErrors.filter(isFatalConsoleError).slice(0, 60),
    networkErrors: networkErrors.slice(0, 60),
    fatalNetworkErrors: networkErrors.filter((entry) => !isBenignNetworkFailure(entry)).slice(0, 60),
    previewStatusEvents,
    previewTextHistory,
    runtimeSnapshotChecks,
    events,
    bodyExcerpt: finalBody,
  };

  await fs.writeFile(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log('\n===== E2E CALENDAR SUMMARY =====');
  console.log(
    JSON.stringify(
      {
        ok: summary.ok,
        sawAssistantContent,
        sawFiles,
        sawPreview,
        sawError,
        previewContainsToken,
        snapshotContainsToken,
        followUpSubmitted,
        followUpPreviewContainsTokens,
        followUpSnapshotContainsTokens,
        historyRestoreVerified,
        projectDatabaseVerified,
        initialSelectionOk,
        followUpSelectionOk,
        chatBecameIdle,
        elapsedSec: summary.elapsedSec,
        chatRequestStatuses: chatRequests.map((r) => r.status),
        consoleErrorCount: consoleErrors.length,
        fatalConsoleErrorCount: summary.fatalConsoleErrors.length,
        networkErrorCount: networkErrors.length,
        fatalNetworkErrorCount: summary.fatalNetworkErrors.length,
      },
      null,
      2,
    ),
  );

  await context.close();
  await browser.close();
  if (!summary.ok) process.exit(2);
}

main().catch(async (err) => {
  console.error('E2E FATAL', err);
  await fs.writeFile(path.join(outDir, 'fatal.txt'), String(err?.stack || err)).catch(() => {});
  process.exit(1);
});
