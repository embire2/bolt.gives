#!/usr/bin/env node

import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
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
const PREVIEW_PORT_RANGE_START = Number(process.env.RUNTIME_PREVIEW_PORT_START || '4100');
const PREVIEW_PORT_RANGE_END = Number(process.env.RUNTIME_PREVIEW_PORT_END || '4999');
const PRESERVED_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage']);

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

function normalizeSessionId(sessionId) {
  return createHash('sha256').update(sessionId).digest('hex').slice(0, 24);
}

function getSession(sessionId) {
  const normalized = normalizeSessionId(sessionId);
  let session = sessions.get(normalized);

  if (!session) {
    session = {
      id: normalized,
      dir: path.join(PERSIST_ROOT, normalized),
      processes: new Map(),
      preview: undefined,
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
  for (const [, handle] of session.processes.entries()) {
    handle.process.kill('SIGTERM');
  }

  session.processes.clear();
  session.preview = undefined;
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

  if (kind === 'start') {
    if (previewPort) {
      previewCoordinator.startProbe(previewPort);
    }
  }

  const detectPreviewPort = (text) => {
    if (kind !== 'start') {
      return;
    }

    const detectedPort = extractPreviewPortFromOutput(text);

    if (!detectedPort) {
      return;
    }

    previewCoordinator.startProbe(detectedPort);
  };

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    output += text;
    detectPreviewPort(text);
    writeEvent({ type: 'stdout', chunk: text });
  });

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    output += text;
    detectPreviewPort(text);
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
      const previewBaseUrl = `${getRequestOrigin(req)}/runtime/preview/${session.id}/${resolvedPort}`;
      session.preview = { port: resolvedPort, baseUrl: previewBaseUrl };
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

function proxyPreviewRequest(req, res, pathname) {
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
      const headers = { ...upstreamRes.headers };
      const contentType = String(headers['content-type'] || '');
      const shouldRewrite = /text\/html|javascript|ecmascript|text\/css/.test(contentType);

      if (!shouldRewrite) {
        res.writeHead(upstreamRes.statusCode || 502, headers);
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

        delete headers['content-length'];
        delete headers['content-encoding'];

        res.writeHead(upstreamRes.statusCode || 502, headers);
        res.end(rewritten);
      });
    },
  );

  upstreamReq.on('error', (error) => {
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

    if (req.method === 'POST' && syncMatch) {
      try {
        const session = getSession(syncMatch[1]);
        const body = await readJsonBody(req);
        await runSessionOperation(session, () =>
          syncWorkspaceSnapshot(session, body.files || {}, { prune: body.prune === true }),
        );
        sendJson(res, 200, {
          ok: true,
          sessionId: session.id,
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
        const session = getSession(commandMatch[1]);
        const body = await readJsonBody(req);
        await runSessionOperation(session, () => handleRunCommand(req, res, session, body));
      } catch (error) {
        sendText(res, 500, error instanceof Error ? error.message : 'Runtime command failed');
      }
      return;
    }

    if (req.method === 'DELETE' && commandMatch) {
      try {
        const session = getSession(commandMatch[1]);
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
