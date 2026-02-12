#!/usr/bin/env node

import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import WebSocket, { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import { docs, setContentInitializor, setupWSConnection } from '@y/websocket-server/utils';

const HOST = process.env.COLLAB_HOST || process.env.HOST || 'localhost';
// Never default to process.env.PORT here. Many setups use PORT for the web app (e.g. 5173),
// which would cause the collab server to steal that port. Keep collab on 1234 unless
// explicitly overridden via COLLAB_PORT.
const PORT = Number(process.env.COLLAB_PORT || 1234);
const PERSIST_DEBOUNCE_MS = Number(process.env.COLLAB_PERSIST_DEBOUNCE_MS || 750);
const INACTIVITY_TIMEOUT_MS = Number(process.env.COLLAB_INACTIVITY_TIMEOUT_MS || 5 * 60 * 1000);
const CLEANUP_SWEEP_MS = Number(process.env.COLLAB_CLEANUP_SWEEP_MS || 30 * 1000);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const persistenceDir = process.env.COLLAB_PERSIST_DIR
  ? path.resolve(process.env.COLLAB_PERSIST_DIR)
  : path.join(rootDir, '.collab-docs');

/** @type {Map<string, number>} */
const activityByDoc = new Map();
/** @type {Map<string, NodeJS.Timeout>} */
const persistTimers = new Map();

function now() {
  return Date.now();
}

function markActivity(docName) {
  activityByDoc.set(docName, now());
}

function normalizeDocName(url) {
  const raw = (url || '/').slice(1).split('?')[0] || 'untitled';

  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function fileForDoc(docName) {
  const safe = Buffer.from(docName).toString('base64url');
  return path.join(persistenceDir, `${safe}.yjs`);
}

async function persistDoc(docName, ydoc) {
  const filePath = fileForDoc(docName);
  const update = Y.encodeStateAsUpdate(ydoc);

  await fs.mkdir(persistenceDir, { recursive: true });
  await fs.writeFile(filePath, Buffer.from(update));
}

function schedulePersist(docName, ydoc) {
  const existing = persistTimers.get(docName);

  if (existing) {
    clearTimeout(existing);
  }

  const timer = setTimeout(() => {
    persistTimers.delete(docName);
    persistDoc(docName, ydoc).catch((error) => {
      console.error(`[collab] failed to persist ${docName}:`, error);
    });
  }, PERSIST_DEBOUNCE_MS);

  persistTimers.set(docName, timer);
}

setContentInitializor(async (ydoc) => {
  const docName = ydoc.name;
  const filePath = fileForDoc(docName);
  markActivity(docName);

  try {
    const bytes = await fs.readFile(filePath);

    if (bytes.length > 0) {
      Y.applyUpdate(ydoc, new Uint8Array(bytes));
    }
  } catch (error) {
    const e = /** @type {NodeJS.ErrnoException} */ (error);

    if (e.code !== 'ENOENT') {
      console.error(`[collab] failed to restore ${docName}:`, e);
    }
  }

  ydoc.on('update', () => {
    markActivity(docName);
    schedulePersist(docName, ydoc);
  });
});

function sweepInactiveDocs() {
  const currentTime = now();

  docs.forEach((doc, docName) => {
    const lastActivity = activityByDoc.get(docName) || currentTime;
    const isInactive = currentTime - lastActivity > INACTIVITY_TIMEOUT_MS;
    const hasConnections = doc.conns.size > 0;

    if (!hasConnections && isInactive) {
      persistDoc(docName, doc)
        .then(() => {
          doc.destroy();
          docs.delete(docName);
          activityByDoc.delete(docName);

          const timer = persistTimers.get(docName);

          if (timer) {
            clearTimeout(timer);
            persistTimers.delete(docName);
          }

          console.log(`[collab] cleaned inactive doc: ${docName}`);
        })
        .catch((error) => {
          console.error(`[collab] failed to clean ${docName}:`, error);
        });
    }
  });
}

const server = http.createServer((req, res) => {
  if ((req.url || '/').startsWith('/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: true,
        host: HOST,
        port: PORT,
        docs: docs.size,
      }),
    );
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('bolt.gives collaboration server');
});

const collabWss = new WebSocketServer({ noServer: true });
const eventsWss = new WebSocketServer({ noServer: true });

collabWss.on('connection', (ws, request) => {
  const docName = normalizeDocName(request.url);
  markActivity(docName);

  setupWSConnection(ws, request, { docName, gc: true });

  ws.on('message', () => markActivity(docName));
  ws.on('pong', () => markActivity(docName));
  ws.on('close', () => markActivity(docName));
});

eventsWss.on('connection', (ws) => {
  ws.send(
    JSON.stringify({
      type: 'connected',
      channel: 'step-events',
      timestamp: new Date().toISOString(),
    }),
  );

  ws.on('message', (raw) => {
    const message = typeof raw === 'string' ? raw : raw.toString();

    eventsWss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  });
});

server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url || '/', `http://${HOST}:${PORT}`).pathname;

  if (pathname === '/events') {
    eventsWss.handleUpgrade(request, socket, head, (ws) => {
      eventsWss.emit('connection', ws, request);
    });
    return;
  }

  collabWss.handleUpgrade(request, socket, head, (ws) => {
    collabWss.emit('connection', ws, request);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[collab] listening on ws://${HOST}:${PORT}`);
  console.log(`[collab] persistence dir: ${persistenceDir}`);
  console.log(`[collab] inactivity timeout: ${INACTIVITY_TIMEOUT_MS}ms`);
});

const cleanupInterval = setInterval(sweepInactiveDocs, CLEANUP_SWEEP_MS);

function shutdown(signal) {
  clearInterval(cleanupInterval);

  const pending = Array.from(docs.entries()).map(([docName, doc]) => persistDoc(docName, doc));

  Promise.allSettled(pending)
    .finally(() => {
      console.log(`[collab] received ${signal}, shutting down`);
      collabWss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.close();
        }
      });
      eventsWss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.close();
        }
      });
      server.close(() => process.exit(0));
    })
    .catch(() => {
      process.exit(1);
    });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
