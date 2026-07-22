#!/usr/bin/env node

import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import { once } from 'node:events';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const defaultAssetRoot = path.join(repoRoot, 'build', 'client');
const defaultWorkerPath = path.join(repoRoot, 'build', 'pages-worker', 'index.js');

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.mp4', 'video/mp4'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

function writeLog(message) {
  fsSync.writeSync(1, `${message}\n`);
}

function writeError(message) {
  fsSync.writeSync(2, `${message}\n`);
}

function getArgValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] || fallback;
}

export function resolveProductionServerConfig(args = process.argv.slice(2), env = process.env) {
  return {
    host: getArgValue(args, '--ip', env.HOST || '127.0.0.1'),
    port: Number(getArgValue(args, '--port', env.PORT || '8788')),
    assetRoot: path.resolve(env.BOLT_PAGES_ASSET_ROOT || defaultAssetRoot),
    workerPath: path.resolve(env.BOLT_PAGES_WORKER_PATH || defaultWorkerPath),
  };
}

export function resolveAssetPath(assetRoot, pathname) {
  let decodedPath;

  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const relativePath = decodedPath.replace(/^\/+/, '');
  const resolvedPath = path.resolve(assetRoot, relativePath || 'index.html');
  return resolvedPath === assetRoot || resolvedPath.startsWith(`${assetRoot}${path.sep}`) ? resolvedPath : null;
}

export function createCacheStoragePolyfill() {
  const cache = {
    match: async (_request) => undefined,
    put: async (_request, _response) => undefined,
    delete: async (_request) => false,
  };

  return {
    default: cache,
    open: async (_cacheName) => cache,
    match: async (_request) => undefined,
    delete: async (_cacheName) => false,
    has: async () => false,
    keys: async () => [],
  };
}

async function createAssetService(assetRoot) {
  return {
    async fetch(request) {
      const url = new URL(request.url);
      const assetPath = resolveAssetPath(assetRoot, url.pathname);

      if (!assetPath) {
        return new Response('Bad asset path', { status: 400 });
      }

      try {
        const stat = await fs.stat(assetPath);

        if (!stat.isFile()) {
          return new Response('Not found', { status: 404 });
        }

        const headers = new Headers({
          'Content-Length': String(stat.size),
          'Content-Type': MIME_TYPES.get(path.extname(assetPath).toLowerCase()) || 'application/octet-stream',
          'Cache-Control': url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
        });
        const body = request.method === 'HEAD' ? null : await fs.readFile(assetPath);
        return new Response(body, { status: 200, headers });
      } catch (error) {
        if (error?.code === 'ENOENT') {
          return new Response('Not found', { status: 404 });
        }

        throw error;
      }
    },
  };
}

async function readRequestBody(request) {
  if (request.method === 'GET' || request.method === 'HEAD') {
    return undefined;
  }

  const chunks = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

function buildRequestUrl(request) {
  const forwardedProto = String(request.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    ?.trim();
  const protocol = forwardedProto || (request.socket.encrypted ? 'https' : 'http');
  const host = request.headers.host || '127.0.0.1';
  return `${protocol}://${host}${request.url || '/'}`;
}

export async function writeWorkerResponse(response, serverResponse) {
  serverResponse.statusCode = response.status;
  serverResponse.statusMessage = response.statusText;

  for (const [name, value] of response.headers) {
    serverResponse.setHeader(name, value);
  }

  const setCookies = response.headers.getSetCookie?.() || [];

  if (setCookies.length > 0) {
    serverResponse.setHeader('set-cookie', setCookies);
  }

  if (!response.body) {
    serverResponse.end();
    return;
  }

  const reader = response.body.getReader();

  try {
    while (!serverResponse.destroyed) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (!serverResponse.write(Buffer.from(value))) {
        await once(serverResponse, 'drain');
      }
    }
  } finally {
    // The compiled Pages bridge owns the upstream stream. Calling cancel() here
    // can recursively cancel an already-locked stream and terminate Node.
    reader.releaseLock();
  }

  if (!serverResponse.destroyed) {
    serverResponse.end();
  }
}

export async function startProductionServer(options = resolveProductionServerConfig()) {
  if (!globalThis.caches) {
    globalThis.caches = createCacheStoragePolyfill();
  }

  await fs.access(options.workerPath);
  await fs.access(options.assetRoot);

  const worker = (await import(pathToFileURL(options.workerPath).href)).default;

  if (!worker || typeof worker.fetch !== 'function') {
    throw new Error(`Compiled Pages worker does not export fetch(): ${options.workerPath}`);
  }

  const env = {
    ...process.env,
    ASSETS: await createAssetService(options.assetRoot),
  };
  const server = http.createServer((request, response) => {
    void (async () => {
      const abortController = new AbortController();
      const abortWorkerRequest = () => abortController.abort('Client disconnected');
      request.once('aborted', abortWorkerRequest);
      response.once('close', () => {
        if (!response.writableEnded) {
          abortWorkerRequest();
        }
      });
      const body = await readRequestBody(request);
      const workerRequest = new Request(buildRequestUrl(request), {
        method: request.method,
        headers: request.headers,
        body,
        signal: abortController.signal,
      });
      const executionContext = {
        waitUntil(promise) {
          void Promise.resolve(promise).catch((error) => {
            writeError(
              `[pages-production] waitUntil failed: ${error instanceof Error ? error.message : String(error)}`,
            );
          });
        },
        passThroughOnException() {},
      };
      const workerResponse = await worker.fetch(workerRequest, env, executionContext);
      await writeWorkerResponse(workerResponse, response);
    })().catch((error) => {
      writeError(
        `[pages-production] request failed: ${error instanceof Error ? error.stack || error.message : String(error)}`,
      );

      if (!response.headersSent) {
        response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      }

      if (!response.destroyed) {
        response.end('Internal server error');
      }
    });
  });

  server.requestTimeout = 0;
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, resolve);
  });

  writeLog(`[pages-production] listening on http://${options.host}:${options.port}`);

  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startProductionServer().catch((error) => {
    writeError(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
}
