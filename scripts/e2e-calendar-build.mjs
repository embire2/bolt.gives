#!/usr/bin/env node
// e2e: attempt to build a Calendar app via the FREE provider, capture all failure signals.
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:8788';
const outDir = process.env.E2E_OUTPUT_DIR || 'output/e2e-calendar';
const providerName = process.env.E2E_PROVIDER || 'FREE';
const modelName = process.env.E2E_MODEL || 'deepseek/deepseek-v3.2';
const appToken = `CAL_${Date.now().toString(36)}`;
const requireFollowUp = process.env.E2E_REQUIRE_FOLLOWUP === '1';
const followUpToken = requireFollowUp ? `CAL_FUP_${Date.now().toString(36)}` : null;
const totalDeadlineMs = Number(process.env.E2E_DEADLINE_MS || 7 * 60 * 1000);
const started = Date.now();

const events = [];
const networkErrors = [];
const consoleErrors = [];
const chatRequests = [];
const previewStatusEvents = [];
const previewTextHistory = [];
const runtimeSnapshotChecks = [];

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

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
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
  return await page
    .evaluate(
      async ({ sessionId, endpoint }) => {
        const response = await fetch(`/runtime/sessions/${encodeURIComponent(sessionId)}/${endpoint}`, {
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
          return { ok: false, status: response.status, payload: null };
        }

        return { ok: true, status: response.status, payload: await response.json() };
      },
      { sessionId, endpoint },
    )
    .catch((error) => ({ ok: false, status: 0, payload: null, error: error instanceof Error ? error.message : String(error) }));
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
    /REQFAIL GET .*\/api\/system\/performance :: net::ERR_INSUFFICIENT_RESOURCES/.test(entry)
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
  await page.waitForFunction(() => {
    const elements = Array.from(document.querySelectorAll('textarea'));

    return elements.some((element) => {
      if (!(element instanceof HTMLTextAreaElement)) {
        return false;
      }

      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && !element.disabled;
    });
  }, { timeout: 90000 });

  return textarea;
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      consoleErrors.push(`[${msg.type()}] ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(`[pageerror] ${err.message}`);
  });
  page.on('requestfailed', (req) => {
    networkErrors.push(`REQFAIL ${req.method()} ${req.url()} :: ${req.failure()?.errorText}`);
  });
  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('/api/chat')) {
      let bodyPreview = '';
      try {
        if (res.request().method() !== 'POST' || res.status() >= 400) {
          bodyPreview = (await res.text()).slice(0, 400);
        }
      } catch {}
      chatRequests.push({ status: res.status(), url, headers: res.headers(), bodyPreview });
      log('api/chat response', `status=${res.status()} body=${bodyPreview.slice(0, 200)}`);
    }
    if (res.status() >= 400 && !url.includes('/api/chat')) {
      networkErrors.push(`HTTP ${res.status()} ${url}`);
    }
  });

  // Pin FREE + deepseek in localStorage so we bypass provider modal.
  await page.addInitScript(({ provider, model }) => {
    const host = window.location.hostname;
    localStorage.setItem(
      `bolt_instance_selection_v1:${host}`,
      JSON.stringify({ providerName: provider, modelName: model, updatedAt: new Date().toISOString() }),
    );
    localStorage.setItem('bolt_provider_model_selection_v1', JSON.stringify({ [provider]: model }));
  }, { provider: providerName, model: modelName });

  log('goto', baseUrl);
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  const textarea = await ensureChatComposerVisible(page);
  log('prompt surface ready');
  await page.screenshot({ path: path.join(outDir, '01-loaded.png'), fullPage: true });

  const prompt = `Build a small single-page React calendar app that lets the user add and view events. Render a visible heading that contains the exact text "${appToken}". Implement complete files and run it.`;
  log('submit prompt', `token=${appToken}`);
  await textarea.fill(prompt);
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
  let bodyTextLast = '';
  let lastPreviewText = '';
  let lastPreviewSrc = '';
  let hostedRuntimeSessionId = null;
  let lastPreviewStatusKey = '';
  let loggedInitialSnapshotWait = false;
  let loggedFollowUpSnapshotWait = false;

  while (Date.now() < checkDeadline) {
    await keepPreviewSurfaceVisible(page);
    const bodyText = (await page.locator('body').innerText().catch(() => '')) || '';
    bodyTextLast = bodyText;

    if (!sawAssistantContent && bodyText.length > 600 && /assistant|boltArtifact|Creating|Installing|Analyz/i.test(bodyText)) {
      sawAssistantContent = true;
      log('assistant activity detected');
    }
    if (!sawFiles && /package\.json|src\/App|App\.jsx|App\.tsx/.test(bodyText)) {
      sawFiles = true;
      log('file actions detected in UI');
    }
    const iframe = await page.locator('iframe[title="preview"]').first().isVisible().catch(() => false);
    const previewSrc = await page.locator('iframe[title="preview"]').first().getAttribute('src').catch(() => null);

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
        const pf = page.frameLocator('iframe[title="preview"]').first();
        const inner = (await pf.locator('body').innerText({ timeout: 1500 }).catch(() => '')) || '';
        const normalizedPreview = normalizeText(inner);

        if (normalizedPreview && normalizedPreview !== lastPreviewText) {
          lastPreviewText = normalizedPreview;
          previewTextHistory.push({
            elapsedSec: Number(elapsed()),
            text: normalizedPreview.slice(0, 500),
          });
          log('preview text', normalizedPreview.slice(0, 200));
        }

        if (inner.includes(appToken)) {
          previewContainsToken = true;

          if (!hostedRuntimeSessionId) {
            log('SUCCESS: preview contains token');
            break;
          }

          const snapshotCheck = await checkRuntimeSnapshotTokens(page, hostedRuntimeSessionId, [appToken]);

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
    followUpSubmitted = true;
    log('submit follow-up prompt', `token=${followUpToken}`);
    const followUpTextarea = await ensureChatComposerVisible(page);
    await followUpTextarea.fill(
      `Improve the existing calendar project without restarting from scratch. Keep the exact visible text "${appToken}" in the app and add another clearly visible label with the exact text "${followUpToken}". Continue from the current project and keep preview running.`,
    );
    await followUpTextarea.press('Enter');
    await page.screenshot({ path: path.join(outDir, '03-followup-submitted.png'), fullPage: true });

    while (Date.now() < checkDeadline) {
      await keepPreviewSurfaceVisible(page);
      const bodyText = (await page.locator('body').innerText().catch(() => '')) || '';
      bodyTextLast = bodyText;

      const previewSrc = await page.locator('iframe[title="preview"]').first().getAttribute('src').catch(() => null);

      if (previewSrc && previewSrc !== lastPreviewSrc) {
        lastPreviewSrc = previewSrc;
        log('preview src', previewSrc);
        hostedRuntimeSessionId = extractRuntimeSessionId(previewSrc);
      }

      const iframe = await page.locator('iframe[title="preview"]').first().isVisible().catch(() => false);

      if (iframe) {
        try {
          const pf = page.frameLocator('iframe[title="preview"]').first();
          const inner = (await pf.locator('body').innerText({ timeout: 1500 }).catch(() => '')) || '';
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

  await page.screenshot({ path: path.join(outDir, '04-final.png'), fullPage: true });
  const finalBody = bodyTextLast.replace(/\s+/g, ' ').slice(0, 4000);
  await fs.writeFile(path.join(outDir, 'final-body.txt'), bodyTextLast);

  const summary = {
    ok:
      previewContainsToken &&
      (!hostedRuntimeSessionId || snapshotContainsToken) &&
      (!requireFollowUp ||
        (followUpPreviewContainsTokens && (!hostedRuntimeSessionId || followUpSnapshotContainsTokens))) &&
      chatRequests.some((request) => request.status === 200),
    baseUrl,
    providerName,
    modelName,
    appToken,
    requireFollowUp,
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
    hostedRuntimeSessionId,
    chatRequests,
    consoleErrors: consoleErrors.slice(0, 60),
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
  console.log(JSON.stringify({
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
    elapsedSec: summary.elapsedSec,
    chatRequestStatuses: chatRequests.map((r) => r.status),
    consoleErrorCount: consoleErrors.length,
    networkErrorCount: networkErrors.length,
    fatalNetworkErrorCount: summary.fatalNetworkErrors.length,
  }, null, 2));

  await context.close();
  await browser.close();
  if (!summary.ok) process.exit(2);
}

main().catch(async (err) => {
  console.error('E2E FATAL', err);
  await fs.writeFile(path.join(outDir, 'fatal.txt'), String(err?.stack || err)).catch(() => {});
  process.exit(1);
});
