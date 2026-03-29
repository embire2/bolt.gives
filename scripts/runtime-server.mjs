#!/usr/bin/env node

import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import net from 'node:net';
import {
  createPreviewProbeCoordinator,
  extractPreviewPortFromOutput,
  normalizeStartCommand,
  parsePreviewProxyRequestTarget,
  rewritePreviewAssetUrls,
} from './runtime-preview.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.resolve(path.dirname(SCRIPT_PATH));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const HOST = process.env.RUNTIME_HOST || '127.0.0.1';
const PORT = Number(process.env.RUNTIME_PORT || '4321');
const WORK_DIR = process.env.RUNTIME_WORK_DIR || '/home/project';
export function resolveRuntimeWorkspaceRoot(env = /** @type {Record<string, string | undefined>} */ (process.env), repoRoot = REPO_ROOT) {
  const explicitRoot = env.RUNTIME_WORKSPACE_DIR?.trim();

  if (explicitRoot) {
    return path.resolve(explicitRoot);
  }

  return path.resolve(path.dirname(repoRoot), `${path.basename(repoRoot)}-runtime-workspaces`);
}

const PERSIST_ROOT = resolveRuntimeWorkspaceRoot();
const NODE_OPTIONS = process.env.RUNTIME_NODE_OPTIONS || '--max-old-space-size=6142';
const PREVIEW_READY_TIMEOUT_MS = Number(process.env.RUNTIME_PREVIEW_READY_TIMEOUT_MS || '60000');
const COMMAND_TIMEOUT_MS = Number(process.env.RUNTIME_COMMAND_TIMEOUT_MS || '900000');
const PROJECT_MANIFEST_WAIT_MS = Number(process.env.RUNTIME_PROJECT_MANIFEST_WAIT_MS || '12000');
const PREVIEW_PROXY_UPSTREAM_TIMEOUT_MS = Number(process.env.RUNTIME_PREVIEW_PROXY_UPSTREAM_TIMEOUT_MS || '15000');
const PREVIEW_PORT_RANGE_START = Number(process.env.RUNTIME_PREVIEW_PORT_START || '4100');
const PREVIEW_PORT_RANGE_END = Number(process.env.RUNTIME_PREVIEW_PORT_END || '4999');
const MAX_PREVIEW_LOG_LINES = Number(process.env.RUNTIME_PREVIEW_LOG_LINES || '80');
const AUTO_RESTORE_DELAY_MS = Number(process.env.RUNTIME_PREVIEW_AUTO_RESTORE_DELAY_MS || '3500');
const POST_SYNC_PREVIEW_PROBE_DELAY_MS = Number(process.env.RUNTIME_PREVIEW_PROBE_DELAY_MS || '1200');
const POST_SYNC_PREVIEW_PROBE_WINDOW_MS = Number(process.env.RUNTIME_PREVIEW_PROBE_WINDOW_MS || '12000');
const POST_SYNC_PREVIEW_PROBE_INTERVAL_MS = Number(process.env.RUNTIME_PREVIEW_PROBE_INTERVAL_MS || '1500');
const PREVIEW_PROXY_RETRY_DELAYS_MS = [200, 500, 1000, 1500];
const PRESERVED_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage']);
const PREVIEW_ERROR_PATTERNS = [
  /\[plugin:vite:[^\]]+\]/i,
  /Pre-transform error/i,
  /Transform failed with \d+ error/i,
  /Failed to resolve import/i,
  /Failed to scan for dependencies from entries/i,
  /Unexpected token/i,
  /Expected [^\n]+ but found end of file/i,
  /PREVIEW_UNCAUGHT_EXCEPTION/i,
  /PREVIEW_UNHANDLED_REJECTION/i,
  /ELIFECYCLE/i,
  /Command failed/i,
  /error when starting dev server/i,
  /Uncaught\s+(?:Error|TypeError|ReferenceError|SyntaxError|RangeError)/i,
  /Unhandled\s+Promise\s+Rejection/i,
];

const sessions = new Map();

const PROJECT_MANIFEST_FILES = ['package.json', 'package.json5', 'package.yaml'];

function sendJson(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...extraHeaders,
  });
  res.end(text);
}

export function applyPreviewResponseHeaders(rawHeaders = {}) {
  const headers = { ...rawHeaders };

  delete headers['x-frame-options'];
  delete headers['X-Frame-Options'];
  delete headers['content-security-policy'];
  delete headers['Content-Security-Policy'];
  delete headers['content-security-policy-report-only'];
  delete headers['Content-Security-Policy-Report-Only'];

  return {
    ...headers,
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Opener-Policy': 'same-origin',
  };
}

export function shouldRetryPreviewProxyResponse({ method = 'GET', statusCode = 0, attempt = 0 } = {}) {
  const normalizedMethod = String(method || 'GET').toUpperCase();

  if (normalizedMethod !== 'GET' && normalizedMethod !== 'HEAD') {
    return false;
  }

  if (![502, 503, 504].includes(Number(statusCode))) {
    return false;
  }

  return attempt >= 0 && attempt < PREVIEW_PROXY_RETRY_DELAYS_MS.length;
}

function normalizePreviewText(value) {
  return String(value || '')
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/\u0000/g, '')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractPreviewAlertFromText(rawText) {
  const combinedText = normalizePreviewText(rawText);

  if (!combinedText) {
    return null;
  }

  if (!PREVIEW_ERROR_PATTERNS.some((pattern) => pattern.test(combinedText))) {
    return null;
  }

  const [firstLine = 'Preview failed to compile or run.'] = combinedText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    type: 'error',
    title: 'Preview Error',
    description: firstLine.slice(0, 220),
    content: combinedText.slice(0, 5000),
    source: 'preview',
  };
}

function createPreviewDiagnostics(status = 'idle') {
  return {
    status,
    healthy: false,
    updatedAt: null,
    recentLogs: [],
    alert: null,
  };
}

function createPreviewRecoveryState() {
  return {
    state: 'idle',
    token: 0,
    message: null,
    updatedAt: null,
  };
}

export function buildPreviewStateSummary(session) {
  return {
    sessionId: session.id,
    preview: session.preview || null,
    status: session.previewDiagnostics.status,
    healthy: session.previewDiagnostics.healthy,
    updatedAt: session.previewDiagnostics.updatedAt,
    alert: session.previewDiagnostics.alert,
    recovery: session.previewRecovery,
  };
}

function writePreviewStateEvent(target, payload) {
  target.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcastPreviewState(session) {
  if (!session.previewSubscribers || session.previewSubscribers.size === 0) {
    return;
  }

  const payload = buildPreviewStateSummary(session);

  for (const subscriber of session.previewSubscribers) {
    try {
      writePreviewStateEvent(subscriber, payload);
    } catch {
      session.previewSubscribers.delete(subscriber);
    }
  }
}

function touchPreviewDiagnostics(session, nextState) {
  session.previewDiagnostics = {
    ...session.previewDiagnostics,
    ...nextState,
    updatedAt: new Date().toISOString(),
  };
  broadcastPreviewState(session);
}

function clearPreviewDiagnostics(session, status = 'idle') {
  session.previewDiagnostics = createPreviewDiagnostics(status);
  broadcastPreviewState(session);
}

function setPreviewRecoveryState(session, state, message = null) {
  const previous = session.previewRecovery || createPreviewRecoveryState();

  session.previewRecovery = {
    state,
    token: previous.token + 1,
    message,
    updatedAt: new Date().toISOString(),
  };
  broadcastPreviewState(session);
}

function clearPreviewRecoveryState(session) {
  session.previewRecovery = {
    ...(session.previewRecovery || createPreviewRecoveryState()),
    state: 'idle',
    message: null,
    updatedAt: new Date().toISOString(),
  };
  broadcastPreviewState(session);
}

function cloneFileMap(fileMap) {
  return JSON.parse(JSON.stringify(fileMap || {}));
}

export function mergeWorkspaceFileMap(currentFileMap, incomingFileMap, options = {}) {
  const { prune = false } = options;
  const nextFileMap = prune ? {} : cloneFileMap(currentFileMap || {});

  for (const [filePath, dirent] of Object.entries(incomingFileMap || {})) {
    if (dirent === undefined || dirent === null) {
      delete nextFileMap[filePath];
      continue;
    }

    nextFileMap[filePath] = { ...dirent };
  }

  return nextFileMap;
}

function appendPreviewDiagnosticEntries(session, channel, rawText) {
  const normalized = normalizePreviewText(rawText);

  if (!normalized) {
    return session.previewDiagnostics.recentLogs;
  }

  const nextLogs = [
    ...session.previewDiagnostics.recentLogs,
    ...normalized.split('\n').filter(Boolean).map((line) => `[${channel}] ${line}`),
  ].slice(-MAX_PREVIEW_LOG_LINES);

  touchPreviewDiagnostics(session, {
    recentLogs: nextLogs,
  });

  return nextLogs;
}

function cancelPendingPreviewAutoRestore(session) {
  if (session.autoRestoreTimer) {
    clearTimeout(session.autoRestoreTimer);
    session.autoRestoreTimer = null;
  }
}

function cancelPendingPreviewVerification(session) {
  if (session.previewVerificationTimer) {
    clearTimeout(session.previewVerificationTimer);
    session.previewVerificationTimer = null;
  }
}

function buildPreviewAlertFingerprint(alert) {
  if (!alert) {
    return '';
  }

  return `${alert.title}\n${alert.description}\n${String(alert.content || '').slice(0, 2000)}`;
}

function markSessionMutationStart(session) {
  cancelPendingPreviewAutoRestore(session);
  cancelPendingPreviewVerification(session);
  session.workspaceMutationId = Number(session.workspaceMutationId || 0) + 1;
  session.lastAutoRestoreFingerprint = null;

  if (session.previewDiagnostics.healthy && session.currentFileMap && Object.keys(session.currentFileMap).length > 0) {
    session.restorePointFileMap = cloneFileMap(session.currentFileMap);
  }

  clearPreviewRecoveryState(session);
}

export async function probeSessionPreviewHealth(session, requestPath = '/') {
  const port = Number(session.preview?.port || 0);

  if (!Number.isFinite(port) || port <= 0) {
    return {
      healthy: false,
      statusCode: 0,
      alert: {
        type: 'error',
        title: 'Preview Error',
        description: 'Preview is not running on the hosted runtime.',
        content: 'The hosted runtime has no active preview port for this session.',
        source: 'preview',
      },
    };
  }

  try {
    const response = await fetch(`http://${HOST}:${port}${requestPath}`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(PREVIEW_PROXY_UPSTREAM_TIMEOUT_MS),
    });
    const contentType = String(response.headers.get('content-type') || '');
    const shouldReadBody =
      /text\/html|javascript|ecmascript|text\/css/.test(contentType) || requestPath === '/' || requestPath.endsWith('.html');
    const body = shouldReadBody ? await response.text() : '';
    const alert =
      extractPreviewAlertFromText(body) ||
      (response.status >= 500
        ? {
            type: 'error',
            title: 'Preview Error',
            description: `Preview request failed with status ${response.status}`,
            content: normalizePreviewText(body) || `Preview request to ${requestPath} failed with status ${response.status}.`,
            source: 'preview',
          }
        : null);

    return {
      healthy: !alert && response.status >= 200 && response.status < 400,
      statusCode: response.status,
      alert,
    };
  } catch (error) {
    return {
      healthy: false,
      statusCode: 0,
      alert: {
        type: 'error',
        title: 'Preview Error',
        description: error instanceof Error ? error.message : 'Preview health probe failed.',
        content: `Hosted preview probe for ${requestPath} failed.`,
        source: 'preview',
      },
    };
  }
}

export async function restoreSessionLastKnownGoodWorkspace(session, reason = 'preview-error') {
  if (!session.restorePointFileMap || session.autoRestoreInFlight) {
    return false;
  }

  session.autoRestoreInFlight = true;
  setPreviewRecoveryState(
    session,
    'running',
    'The hosted runtime is restoring the last known working workspace after a preview failure.',
  );
  appendPreviewDiagnosticEntries(
    session,
    'recovery',
    `Restoring the last known working workspace snapshot after ${reason}.`,
  );
  touchPreviewDiagnostics(session, {
    status: 'starting',
    healthy: false,
    alert: {
      type: 'info',
      title: 'Preview Recovery In Progress',
      description: 'The hosted runtime is restoring the last known working workspace.',
      content: `Recovery reason: ${reason}.`,
      source: 'preview',
    },
  });

  try {
    await syncWorkspaceSnapshot(session, session.restorePointFileMap, { prune: false });
    session.currentFileMap = cloneFileMap(session.restorePointFileMap);
    let previewRecovered = false;

    if (Number.isFinite(Number(session.preview?.port)) && Number(session.preview?.port) > 0) {
      try {
        await waitForPreview(Number(session.preview.port));
        clearPreviewDiagnostics(session, session.preview ? 'ready' : 'idle');
        appendPreviewDiagnosticEntries(session, 'recovery', 'Preview is healthy again after restoring the last known working workspace snapshot.');
        touchPreviewDiagnostics(session, {
          status: session.preview ? 'ready' : 'idle',
          healthy: true,
          alert: null,
        });
        previewRecovered = true;
      } catch (error) {
        appendPreviewDiagnosticEntries(
          session,
          'recovery',
          `Workspace snapshot restored, but the preview is still warming up: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }

    if (!previewRecovered) {
      appendPreviewDiagnosticEntries(
        session,
        'recovery',
        'Last known working workspace snapshot restored. Waiting for the preview to become healthy again.',
      );
    }

    setPreviewRecoveryState(session, 'restored', 'The last known working workspace snapshot has been restored.');

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to restore the last known working workspace.';
    appendPreviewDiagnosticEntries(session, 'recovery', `Restore failed: ${message}`);
    touchPreviewDiagnostics(session, {
      status: 'error',
      healthy: false,
      alert: {
        type: 'error',
        title: 'Preview Recovery Failed',
        description: 'The hosted runtime could not restore the last known working workspace.',
        content: message,
        source: 'preview',
      },
    });

    return false;
  } finally {
    session.autoRestoreInFlight = false;
  }
}

function schedulePreviewAutoRestore(session, alert) {
  if (!session.restorePointFileMap || session.autoRestoreInFlight) {
    return;
  }

  const fingerprint = buildPreviewAlertFingerprint(alert);

  if (!fingerprint || session.lastAutoRestoreFingerprint === fingerprint) {
    return;
  }

  cancelPendingPreviewAutoRestore(session);
  const mutationId = session.workspaceMutationId;
  session.autoRestoreTimer = setTimeout(() => {
    session.autoRestoreTimer = null;

    void (async () => {
      if (session.autoRestoreInFlight || session.workspaceMutationId !== mutationId) {
        return;
      }

      const probe = await probeSessionPreviewHealth(session);

      if (session.autoRestoreInFlight || session.workspaceMutationId !== mutationId) {
        return;
      }

      if (!probe.alert) {
        if (probe.healthy) {
          touchPreviewDiagnostics(session, {
            status: session.preview ? 'ready' : 'idle',
            healthy: true,
            alert: null,
          });
        }

        return;
      }

      touchPreviewDiagnostics(session, {
        status: 'error',
        healthy: false,
        alert: probe.alert,
      });
      session.lastAutoRestoreFingerprint = fingerprint;
      await restoreSessionLastKnownGoodWorkspace(session, 'a preview compilation failure');
    })();
  }, AUTO_RESTORE_DELAY_MS);
}

function schedulePreviewVerificationAfterMutation(session, reason = 'a workspace update') {
  if (!session.preview || !session.restorePointFileMap || session.autoRestoreInFlight) {
    return;
  }

  cancelPendingPreviewVerification(session);
  const mutationId = session.workspaceMutationId;

  session.previewVerificationTimer = setTimeout(() => {
    session.previewVerificationTimer = null;

    void (async () => {
      const deadline = Date.now() + POST_SYNC_PREVIEW_PROBE_WINDOW_MS;

      while (Date.now() < deadline) {
        if (session.autoRestoreInFlight || session.workspaceMutationId !== mutationId) {
          return;
        }

        const probe = await probeSessionPreviewHealth(session);

        if (session.autoRestoreInFlight || session.workspaceMutationId !== mutationId) {
          return;
        }

        if (probe.alert) {
          appendPreviewDiagnosticEntries(session, 'probe', `Detected preview failure after ${reason}: ${probe.alert.description}`);
          touchPreviewDiagnostics(session, {
            status: 'error',
            healthy: false,
            alert: probe.alert,
          });
          schedulePreviewAutoRestore(session, probe.alert);
          return;
        }

        if (probe.healthy) {
          touchPreviewDiagnostics(session, {
            status: session.preview ? 'ready' : 'idle',
            healthy: true,
            alert: null,
          });
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, POST_SYNC_PREVIEW_PROBE_INTERVAL_MS));
      }

      const timeoutAlert = {
        type: 'error',
        title: 'Preview Error',
        description: `Preview did not recover after ${reason}.`,
        content: 'The hosted runtime could not confirm a healthy preview after the latest workspace mutation.',
        source: 'preview',
      };

      appendPreviewDiagnosticEntries(session, 'probe', timeoutAlert.description);
      touchPreviewDiagnostics(session, {
        status: 'error',
        healthy: false,
        alert: timeoutAlert,
      });
      schedulePreviewAutoRestore(session, timeoutAlert);
    })();
  }, POST_SYNC_PREVIEW_PROBE_DELAY_MS);
}

function recordPreviewLog(session, channel, chunk) {
  const normalized = normalizePreviewText(chunk);

  if (!normalized) {
    return;
  }

  const nextLogs = appendPreviewDiagnosticEntries(session, channel, normalized);
  const detectedAlert = extractPreviewAlertFromText(nextLogs.join('\n'));

  touchPreviewDiagnostics(session, {
    status: detectedAlert ? 'error' : session.previewDiagnostics.status,
    healthy: detectedAlert ? false : session.previewDiagnostics.healthy,
    alert: detectedAlert || session.previewDiagnostics.alert,
  });

  if (detectedAlert) {
    schedulePreviewAutoRestore(session, detectedAlert);
  }
}

function recordPreviewResponse(session, body, statusCode, upstreamPath) {
  const normalizedBody = normalizePreviewText(body);
  const detectedAlert =
    extractPreviewAlertFromText(normalizedBody) ||
    (statusCode >= 500
      ? {
          type: 'error',
          title: 'Preview Error',
          description: `Preview request failed with status ${statusCode}`,
          content: normalizedBody || `Preview request to ${upstreamPath} failed with status ${statusCode}.`,
          source: 'preview',
        }
      : null);

  if (detectedAlert) {
    touchPreviewDiagnostics(session, {
      status: 'error',
      healthy: false,
      alert: detectedAlert,
    });
    schedulePreviewAutoRestore(session, detectedAlert);

    return;
  }

  if (statusCode >= 200 && statusCode < 400 && (upstreamPath === '/' || upstreamPath === '/index.html' || upstreamPath.endsWith('.html'))) {
    touchPreviewDiagnostics(session, {
      status: session.preview ? 'ready' : 'idle',
      healthy: true,
      alert: null,
    });
  }
}

export function normalizeSessionId(sessionId) {
  const rawValue = String(sessionId || '').trim();
  const normalized = rawValue.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 96);

  if (!normalized) {
    throw new Error('Missing runtime session id');
  }

  return normalized;
}

function getSession(sessionId) {
  const normalized = normalizeSessionId(sessionId);
  let session = sessions.get(normalized);

  if (!session) {
    session = {
      id: normalized,
      dir: path.join(PERSIST_ROOT, normalized),
      processes: new Map(),
      previewSubscribers: new Set(),
      preview: undefined,
      previewDiagnostics: createPreviewDiagnostics(),
      previewRecovery: createPreviewRecoveryState(),
      currentFileMap: {},
      restorePointFileMap: null,
      workspaceMutationId: 0,
      autoRestoreTimer: null,
      previewVerificationTimer: null,
      autoRestoreInFlight: false,
      lastAutoRestoreFingerprint: null,
      operationQueue: Promise.resolve(),
    };
    sessions.set(normalized, session);
  }

  return session;
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function exists(targetPath) {
  try {
    await fs.access(targetPath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function writeWorkspaceFileAtomic(targetPath, content, options = {}) {
  const tempSuffix = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tempPath = `${targetPath}.bolt-sync-${tempSuffix}.tmp`;
  const binary = options.binary === true;
  const buffer = binary ? Buffer.from(content) : Buffer.from(String(content), 'utf8');

  await fs.writeFile(tempPath, buffer);
  await fs.rename(tempPath, targetPath);
}

export function runSessionOperation(session, task) {
  const previous = session.operationQueue || Promise.resolve();
  const next = previous.catch(() => undefined).then(task);

  session.operationQueue = next.catch(() => undefined);

  return next;
}

export function commandNeedsProjectManifest(command = '') {
  const normalized = command.trim().toLowerCase();

  if (!normalized) {
    return false;
  }

  if (/^(npm|pnpm)\s+(create|dlx)\b/.test(normalized)) {
    return false;
  }

  if (/^yarn\s+(create|dlx)\b/.test(normalized)) {
    return false;
  }

  if (/^bun\s+(create|x)\b/.test(normalized)) {
    return false;
  }

  return /^(npm|pnpm|yarn|bun)\s+/.test(normalized);
}

export async function workspaceHasOwnProjectManifest(workspaceDir) {
  for (const fileName of PROJECT_MANIFEST_FILES) {
    // eslint-disable-next-line no-await-in-loop
    if (await exists(path.join(workspaceDir, fileName))) {
      return true;
    }
  }

  return false;
}

export async function waitForProjectManifest(workspaceDir, timeoutMs = PROJECT_MANIFEST_WAIT_MS) {
  const deadline = Date.now() + Math.max(0, timeoutMs);

  while (Date.now() <= deadline) {
    // eslint-disable-next-line no-await-in-loop
    if (await workspaceHasOwnProjectManifest(workspaceDir)) {
      return true;
    }

    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return workspaceHasOwnProjectManifest(workspaceDir);
}

async function walkWorkspace(rootDir, relativeDir = '') {
  const absoluteDir = path.join(rootDir, relativeDir);
  let entries = [];

  try {
    entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results = [];

  for (const entry of entries) {
    const relativePath = relativeDir ? path.posix.join(relativeDir, entry.name) : entry.name;

    if (PRESERVED_DIRS.has(entry.name) && !relativeDir) {
      continue;
    }

    if (entry.isDirectory()) {
      results.push({ path: relativePath, type: 'dir' });
      results.push(...(await walkWorkspace(rootDir, relativePath)));
    } else if (entry.isFile()) {
      results.push({ path: relativePath, type: 'file' });
    }
  }

  return results;
}

function toRelativeWorkspacePath(filePath) {
  const normalized = filePath.replace(/\\/g, '/');

  if (normalized === WORK_DIR) {
    return '';
  }

  if (normalized.startsWith(`${WORK_DIR}/`)) {
    return normalized.slice(WORK_DIR.length + 1);
  }

  return normalized.replace(/^\/+/, '');
}

export async function syncWorkspaceSnapshot(session, fileMap, options = {}) {
  const { prune = true } = options;
  await ensureDir(session.dir);

  const desiredFiles = new Map();
  const desiredDirs = new Set();

  for (const [absolutePath, dirent] of Object.entries(fileMap || {})) {
    if (!dirent) {
      continue;
    }

    const relativePath = toRelativeWorkspacePath(absolutePath);

    if (!relativePath) {
      continue;
    }

    if (dirent.type === 'folder') {
      desiredDirs.add(relativePath);
      continue;
    }

    desiredFiles.set(relativePath, dirent);

    const parentDir = path.posix.dirname(relativePath);

    if (parentDir && parentDir !== '.') {
      const parts = parentDir.split('/');
      let prefix = '';

      for (const part of parts) {
        prefix = prefix ? `${prefix}/${part}` : part;
        desiredDirs.add(prefix);
      }
    }
  }

  const existingEntries = await walkWorkspace(session.dir);

  if (prune) {
    for (const entry of existingEntries) {
      if (entry.type === 'file' && !desiredFiles.has(entry.path)) {
        await fs.rm(path.join(session.dir, entry.path), { force: true });
      }

      if (entry.type === 'dir' && !desiredDirs.has(entry.path)) {
        await fs.rm(path.join(session.dir, entry.path), { recursive: true, force: true });
      }
    }
  }

  for (const dirPath of [...desiredDirs].sort((a, b) => a.length - b.length)) {
    await ensureDir(path.join(session.dir, dirPath));
  }

  for (const [relativePath, dirent] of desiredFiles.entries()) {
    const absolutePath = path.join(session.dir, relativePath);
    await ensureDir(path.dirname(absolutePath));

    if (dirent.isBinary) {
      await writeWorkspaceFileAtomic(absolutePath, Buffer.from(dirent.content || '', 'base64'), { binary: true });
      continue;
    }

    await writeWorkspaceFileAtomic(absolutePath, dirent.content || '');
  }
}

function createEventWriter(res) {
  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  });

  return (event) => {
    res.write(`${JSON.stringify(event)}\n`);
  };
}

function getRequestOrigin(req) {
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || `${HOST}:${PORT}`;
  return `${proto}://${host}`;
}

export function updateSessionPreview(session, req, port) {
  if (!Number.isFinite(Number(port)) || Number(port) <= 0) {
    return session.preview || null;
  }

  const resolvedPort = Number(port);
  const previewBaseUrl = `${getRequestOrigin(req)}/runtime/preview/${session.id}/${resolvedPort}`;

  session.preview = {
    ...(session.preview || {}),
    port: resolvedPort,
    baseUrl: previewBaseUrl,
  };

  broadcastPreviewState(session);

  return session.preview;
}

export function normalizeIncomingPreviewAlert(input) {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const type = String(input.type || 'error').trim() || 'error';
  const title = String(input.title || 'Preview Error').trim() || 'Preview Error';
  const description = String(input.description || '').trim();
  const content = String(input.content || '').trim();

  if (!description && !content) {
    return null;
  }

  return {
    type,
    title,
    description: (description || title).slice(0, 220),
    content: content.slice(0, 5000),
    source: 'preview',
  };
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on('error', () => resolve(false));
    server.listen({ host: HOST, port }, () => {
      server.close(() => resolve(true));
    });
  });
}

async function allocatePreviewPort() {
  for (let port = PREVIEW_PORT_RANGE_START; port <= PREVIEW_PORT_RANGE_END; port++) {
    // eslint-disable-next-line no-await-in-loop
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error('No preview port available');
}

async function waitForPreview(port) {
  const deadline = Date.now() + PREVIEW_READY_TIMEOUT_MS;
  const target = `http://${HOST}:${port}/`;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(target, {
        redirect: 'manual',
      });

      if (response.status >= 200 && response.status < 500) {
        return;
      }
    } catch {
      // keep polling
    }

    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Preview did not become ready on port ${port}`);
}

async function terminateSessionProcesses(session) {
  cancelPendingPreviewAutoRestore(session);
  cancelPendingPreviewVerification(session);

  for (const [, handle] of session.processes.entries()) {
    handle.process.kill('SIGTERM');
  }

  session.processes.clear();
  session.preview = undefined;
  clearPreviewDiagnostics(session);
  clearPreviewRecoveryState(session);
}

async function handleRunCommand(req, res, session, body) {
  const { command, kind } = body || {};

  if (typeof command !== 'string' || !command.trim()) {
    sendText(res, 400, 'Missing command');
    return;
  }

  const writeEvent = createEventWriter(res);
  const effectiveCommand = kind === 'start' ? normalizeStartCommand(command, session.preview?.port || (await allocatePreviewPort())) : command.trim();
  const previewPort = kind === 'start' ? Number(effectiveCommand.match(/--port\s+(\d+)/i)?.[1] || session.preview?.port || 0) : undefined;
  const needsManifest = commandNeedsProjectManifest(effectiveCommand);

  if (needsManifest && !(await workspaceHasOwnProjectManifest(session.dir))) {
    writeEvent({
      type: 'status',
      message: 'Waiting for project files to finish syncing before running package-manager command',
    });
  }

  if (needsManifest && !(await waitForProjectManifest(session.dir))) {
    writeEvent({
      type: 'stderr',
      chunk:
        'Hosted runtime refused to run a package-manager command because the session workspace has no project manifest yet. Scaffold or sync the project files first.\n',
    });
    writeEvent({ type: 'exit', exitCode: 1 });
    res.end();
    return;
  }

  markSessionMutationStart(session);
  const env = {
    ...process.env,
    CI: '1',
    FORCE_COLOR: '0',
    NODE_OPTIONS,
    PORT: previewPort ? String(previewPort) : process.env.PORT,
    HOST,
  };

  if (kind === 'start') {
    await terminateSessionProcesses(session);
    clearPreviewDiagnostics(session, 'starting');
  }

  writeEvent({ type: 'status', message: `Running ${kind} command on hosted runtime` });
  const child = spawn('bash', ['-lc', effectiveCommand], {
    cwd: session.dir,
    env,
    detached: kind === 'start',
  });

  const processKey = kind === 'start' ? 'preview' : `command-${Date.now()}`;
  session.processes.set(processKey, { process: child, port: previewPort });

  let output = '';
  let settled = false;
  let previewProbePromise;
  const timeout = setTimeout(() => {
    if (settled) {
      return;
    }

    child.kill('SIGTERM');
  }, COMMAND_TIMEOUT_MS);
  const exitPromise = new Promise((resolve, reject) => {
    child.on('close', (exitCode) => resolve(exitCode ?? 1));
    child.on('error', (error) => reject(error));
  });
  const previewCoordinator = createPreviewProbeCoordinator(waitForPreview);
  previewProbePromise = previewCoordinator.readyPromise;

  const detectPreviewPort = (text) => {
    if (kind !== 'start') {
      return;
    }

    const detectedPort = extractPreviewPortFromOutput(text);

    if (!detectedPort) {
      return;
    }

    updateSessionPreview(session, req, detectedPort);
    previewCoordinator.startProbe(detectedPort);
  };

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    output += text;
    detectPreviewPort(text);
    if (kind === 'start') {
      recordPreviewLog(session, 'stdout', text);
    }
    writeEvent({ type: 'stdout', chunk: text });
  });

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    output += text;
    detectPreviewPort(text);
    if (kind === 'start') {
      recordPreviewLog(session, 'stderr', text);
    }
    writeEvent({ type: 'stderr', chunk: text });
  });

  if (kind === 'start' && previewPort) {
    try {
      await Promise.race([
        previewProbePromise,
        exitPromise.then((exitCode) => {
          throw new Error(`Preview process exited before becoming ready (exit ${exitCode})`);
        }),
      ]);
      const resolvedPort = (await previewProbePromise).port;
      updateSessionPreview(session, req, resolvedPort);
      touchPreviewDiagnostics(session, {
        status: 'ready',
        healthy: true,
        alert: null,
      });
      writeEvent({
        type: 'ready',
        preview: session.preview,
      });
      writeEvent({ type: 'exit', exitCode: 0 });
      clearTimeout(timeout);
      settled = true;
      res.end();
      return;
    } catch (error) {
      touchPreviewDiagnostics(session, {
        status: 'error',
        healthy: false,
        alert:
          extractPreviewAlertFromText(output) || {
            type: 'error',
            title: 'Preview Error',
            description: error instanceof Error ? error.message : String(error),
            content: normalizePreviewText(output) || (error instanceof Error ? error.message : String(error)),
            source: 'preview',
          },
      });
      writeEvent({ type: 'stderr', chunk: `${error instanceof Error ? error.message : String(error)}\n` });
      child.kill('SIGTERM');
      const exitCode = await exitPromise.catch(() => 1);
      writeEvent({ type: 'exit', exitCode });
      clearTimeout(timeout);
      settled = true;
      res.end();
      return;
    }
  }

  try {
    const exitCode = await exitPromise;

    if (settled) {
      return;
    }

    settled = true;
    clearTimeout(timeout);

    if (kind !== 'start') {
      session.processes.delete(processKey);
    }

    writeEvent({ type: 'exit', exitCode });
    res.end();
  } catch (error) {
    if (settled) {
      return;
    }

    settled = true;
    clearTimeout(timeout);
    writeEvent({ type: 'error', error: error.message });
    res.end();
  }
}

function proxyPreviewRequest(req, res, pathname, attempt = 0) {
  const target = parsePreviewProxyRequestTarget(req.url || pathname);

  if (!target) {
    sendText(res, 404, 'Preview not found');
    return;
  }

  const { sessionId, portRaw, upstreamPath, previewBasePath } = target;
  const session = sessions.get(sessionId);

  if (!session) {
    sendText(res, 404, 'Unknown runtime session');
    return;
  }

  const port = Number(portRaw);
  const method = String(req.method || 'GET').toUpperCase();
  const scheduleRetry = () => {
    if (res.writableEnded || res.destroyed) {
      return;
    }

    const delay = PREVIEW_PROXY_RETRY_DELAYS_MS[attempt] || 0;

    setTimeout(() => {
      proxyPreviewRequest(req, res, pathname, attempt + 1);
    }, delay);
  };
  const upstreamReq = http.request(
    {
      host: HOST,
      port,
      method: req.method,
      path: upstreamPath,
      headers: {
        ...req.headers,
        host: `${HOST}:${port}`,
      },
    },
    (upstreamRes) => {
      const statusCode = upstreamRes.statusCode || 502;

      if (shouldRetryPreviewProxyResponse({ method, statusCode, attempt })) {
        upstreamRes.resume();
        upstreamRes.on('end', scheduleRetry);
        return;
      }

      const headers = { ...upstreamRes.headers };
      const contentType = String(headers['content-type'] || '');
      const shouldRewrite = /text\/html|javascript|ecmascript|text\/css/.test(contentType);

      if (!shouldRewrite) {
        if (statusCode >= 500) {
          const alert = {
            type: 'error',
            title: 'Preview Error',
            description: `Preview request failed with status ${statusCode}`,
            content: `Non-text preview response failed for ${upstreamPath}`,
            source: 'preview',
          };
          touchPreviewDiagnostics(session, {
            status: 'error',
            healthy: false,
            alert,
          });
          schedulePreviewAutoRestore(session, alert);
        }

        res.writeHead(statusCode, applyPreviewResponseHeaders(headers));
        upstreamRes.pipe(res);
        return;
      }

      const chunks = [];
      upstreamRes.on('data', (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      upstreamRes.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        const rewritten = rewritePreviewAssetUrls(body, previewBasePath);
        recordPreviewResponse(session, rewritten, statusCode, upstreamPath);

        delete headers['content-length'];
        delete headers['content-encoding'];

        res.writeHead(statusCode, applyPreviewResponseHeaders(headers));
        res.end(rewritten);
      });
    },
  );

  upstreamReq.setTimeout(PREVIEW_PROXY_UPSTREAM_TIMEOUT_MS, () => {
    upstreamReq.destroy(new Error(`Preview upstream timed out after ${PREVIEW_PROXY_UPSTREAM_TIMEOUT_MS}ms`));
  });

  upstreamReq.on('error', (error) => {
    if (shouldRetryPreviewProxyResponse({ method, statusCode: 502, attempt })) {
      scheduleRetry();
      return;
    }

    touchPreviewDiagnostics(session, {
      status: 'error',
      healthy: false,
      alert: {
        type: 'error',
        title: 'Preview Error',
        description: `Preview proxy failed: ${error.message}`,
        content: `Proxy request to ${upstreamPath} failed.`,
        source: 'preview',
      },
    });
    schedulePreviewAutoRestore(session, session.previewDiagnostics.alert);
    sendText(res, 502, `Preview proxy failed: ${error.message}`);
  });

  if (req.method === 'GET' || req.method === 'HEAD') {
    upstreamReq.end();
    return;
  }

  req.pipe(upstreamReq);
}

function proxyPreviewUpgrade(req, socket, head) {
  const target = parsePreviewProxyRequestTarget(req.url || '');

  if (!target) {
    socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  const { sessionId, portRaw, upstreamPath } = target;
  const session = sessions.get(sessionId);

  if (!session) {
    socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  const upstreamSocket = net.connect(Number(portRaw), HOST, () => {
    const headerLines = [`GET ${upstreamPath} HTTP/1.1`];

    for (let index = 0; index < req.rawHeaders.length; index += 2) {
      const name = req.rawHeaders[index];
      const value = req.rawHeaders[index + 1];

      if (!name || value === undefined) {
        continue;
      }

      if (name.toLowerCase() === 'host') {
        headerLines.push(`Host: ${HOST}:${portRaw}`);
        continue;
      }

      headerLines.push(`${name}: ${value}`);
    }

    upstreamSocket.write(`${headerLines.join('\r\n')}\r\n\r\n`);

    if (head?.length) {
      upstreamSocket.write(head);
    }

    socket.pipe(upstreamSocket);
    upstreamSocket.pipe(socket);
  });

  upstreamSocket.on('error', () => {
    if (!socket.destroyed) {
      socket.write('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
      socket.destroy();
    }
  });

  socket.on('error', () => {
    if (!upstreamSocket.destroyed) {
      upstreamSocket.destroy();
    }
  });
}

async function readJsonBody(req) {
  let raw = '';

  for await (const chunk of req) {
    raw += chunk.toString();
  }

  if (!raw) {
    return {};
  }

  return JSON.parse(raw);
}

export function createRuntimeServer() {
  return http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
      });
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PORT}`}`);
    const pathname = url.pathname;

    if (pathname === '/health') {
      sendJson(res, 200, { ok: true, host: HOST, port: PORT, sessions: sessions.size });
      return;
    }

    if (pathname === '/runtime/health') {
      sendJson(res, 200, { ok: true, host: HOST, port: PORT, sessions: sessions.size });
      return;
    }

    if (pathname.startsWith('/runtime/preview/')) {
      proxyPreviewRequest(req, res, pathname);
      return;
    }

    const syncMatch = pathname.match(/^\/runtime\/sessions\/([^/]+)\/sync$/);
    const previewStatusMatch = pathname.match(/^\/runtime\/sessions\/([^/]+)\/preview-status$/);
    const previewEventsMatch = pathname.match(/^\/runtime\/sessions\/([^/]+)\/preview-events$/);
    const snapshotMatch = pathname.match(/^\/runtime\/sessions\/([^/]+)\/snapshot$/);
    const previewAlertMatch = pathname.match(/^\/runtime\/sessions\/([^/]+)\/preview-alert$/);

    if (req.method === 'GET' && previewStatusMatch) {
      try {
        const requestedSessionId = normalizeSessionId(previewStatusMatch[1]);
        const session = getSession(requestedSessionId);
        sendJson(res, 200, {
          sessionId: requestedSessionId,
          preview: session.preview || null,
          status: session.previewDiagnostics.status,
          healthy: session.previewDiagnostics.healthy,
          updatedAt: session.previewDiagnostics.updatedAt,
          recentLogs: session.previewDiagnostics.recentLogs,
          alert: session.previewDiagnostics.alert,
          recovery: session.previewRecovery,
        });
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Failed to inspect preview status');
      }
      return;
    }

    if (req.method === 'GET' && previewEventsMatch) {
      try {
        const requestedSessionId = normalizeSessionId(previewEventsMatch[1]);
        const session = getSession(requestedSessionId);

        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-store',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'X-Accel-Buffering': 'no',
        });

        res.write(': connected\n\n');
        writePreviewStateEvent(res, buildPreviewStateSummary(session));
        session.previewSubscribers.add(res);

        const heartbeat = setInterval(() => {
          try {
            res.write(': keepalive\n\n');
          } catch {
            clearInterval(heartbeat);
            session.previewSubscribers.delete(res);
          }
        }, 15000);

        req.on('close', () => {
          clearInterval(heartbeat);
          session.previewSubscribers.delete(res);
        });
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Failed to subscribe to preview events');
      }
      return;
    }

    if (req.method === 'GET' && snapshotMatch) {
      try {
        const requestedSessionId = normalizeSessionId(snapshotMatch[1]);
        const session = getSession(requestedSessionId);
        sendJson(res, 200, {
          sessionId: requestedSessionId,
          files: session.currentFileMap || {},
          recovery: session.previewRecovery,
        });
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Failed to inspect runtime snapshot');
      }
      return;
    }

    if (req.method === 'POST' && previewAlertMatch) {
      try {
        const requestedSessionId = normalizeSessionId(previewAlertMatch[1]);
        const session = getSession(requestedSessionId);
        const body = await readJsonBody(req);
        const alert = normalizeIncomingPreviewAlert(body.alert);

        if (!alert) {
          sendText(res, 400, 'Missing preview alert payload');
          return;
        }

        appendPreviewDiagnosticEntries(
          session,
          'browser-preview',
          `Browser reported preview failure: ${alert.description}\n${alert.content}`,
        );
        touchPreviewDiagnostics(session, {
          status: 'error',
          healthy: false,
          alert,
        });
        schedulePreviewAutoRestore(session, alert);

        sendJson(res, 200, {
          ok: true,
          sessionId: requestedSessionId,
          recovery: session.previewRecovery,
        });
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Failed to record preview alert');
      }
      return;
    }

    if (req.method === 'POST' && syncMatch) {
      try {
        const requestedSessionId = normalizeSessionId(syncMatch[1]);
        const session = getSession(requestedSessionId);
        const body = await readJsonBody(req);
        const incomingFiles = body.files || {};
        const prune = body.prune === true;
        await runSessionOperation(session, async () => {
          markSessionMutationStart(session);
          await syncWorkspaceSnapshot(session, incomingFiles, { prune });
          session.currentFileMap = mergeWorkspaceFileMap(session.currentFileMap, incomingFiles, { prune });
          schedulePreviewVerificationAfterMutation(session, 'a workspace sync');
        });
        sendJson(res, 200, {
          ok: true,
          sessionId: requestedSessionId,
          preview: session.preview || null,
        });
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Workspace sync failed');
      }
      return;
    }

    const commandMatch = pathname.match(/^\/runtime\/sessions\/([^/]+)\/command$/);

    if (req.method === 'POST' && commandMatch) {
      try {
        const session = getSession(normalizeSessionId(commandMatch[1]));
        const body = await readJsonBody(req);
        await runSessionOperation(session, () => handleRunCommand(req, res, session, body));
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Runtime command failed');
      }
      return;
    }

    if (req.method === 'DELETE' && commandMatch) {
      try {
        const session = getSession(normalizeSessionId(commandMatch[1]));
        await runSessionOperation(session, () => terminateSessionProcesses(session));
        sendJson(res, 200, { ok: true });
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Failed to terminate session');
      }
      return;
    }

    sendText(res, 404, 'bolt.gives runtime server');
  });
}

const server = createRuntimeServer();

server.on('upgrade', (req, socket, head) => {
  if ((req.url || '').startsWith('/runtime/preview/')) {
    proxyPreviewUpgrade(req, socket, head);
    return;
  }

  socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
  socket.destroy();
});

function startServer() {
  server.listen(PORT, HOST, () => {
    console.log(`[runtime] listening on http://${HOST}:${PORT}`);
    console.log(`[runtime] workspace dir: ${PERSIST_ROOT}`);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  startServer();
}
