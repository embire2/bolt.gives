#!/usr/bin/env node

import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import WebSocket, { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

const HOST = process.env.COLLAB_HOST || process.env.HOST || 'localhost';
// Never default to process.env.PORT here. Many setups use PORT for the web app (e.g. 5173),
// which would cause the collab server to steal that port. Keep collab on 1234 unless
// explicitly overridden via COLLAB_PORT.
const PORT = Number(process.env.COLLAB_PORT || 1234);
const PERSIST_DEBOUNCE_MS = Number(process.env.COLLAB_PERSIST_DEBOUNCE_MS || 750);
const INACTIVITY_TIMEOUT_MS = Number(process.env.COLLAB_INACTIVITY_TIMEOUT_MS || 5 * 60 * 1000);
const CLEANUP_SWEEP_MS = Number(process.env.COLLAB_CLEANUP_SWEEP_MS || 30 * 1000);
const PING_TIMEOUT_MS = 30_000;
const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const persistenceDir = process.env.COLLAB_PERSIST_DIR
  ? path.resolve(process.env.COLLAB_PERSIST_DIR)
  : path.join(rootDir, '.collab-docs');

/** @type {Map<string, WSSharedDoc>} */
const docs = new Map();
/** @type {Map<string, number>} */
const activityByDoc = new Map();
/** @type {Map<string, NodeJS.Timeout>} */
const persistTimers = new Map();
/** @type {(ydoc: Y.Doc) => Promise<void>} */
let contentInitializor = async () => {};

class WSSharedDoc extends Y.Doc {
  constructor(name) {
    super({ gc: true });
    this.name = name;
    this.conns = new Map();
    this.awareness = new awarenessProtocol.Awareness(this);
    this.awareness.setLocalState(null);
    this.awareness.on('update', ({ added, updated, removed }, conn) => {
      const changedClients = added.concat(updated, removed);

      if (conn !== null) {
        const controlledIds = this.conns.get(conn);

        if (controlledIds) {
          added.forEach((clientId) => controlledIds.add(clientId));
          removed.forEach((clientId) => controlledIds.delete(clientId));
        }
      }

      if (changedClients.length === 0) {
        return;
      }

      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients));
      const payload = encoding.toUint8Array(encoder);

      this.conns.forEach((_, connection) => {
        send(this, connection, payload);
      });
    });
    this.on('update', (update, origin, doc, transaction) => updateHandler(update, origin, doc, transaction));
    this.whenInitialized = contentInitializor(this);
  }
}

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

function setContentInitializor(initializer) {
  contentInitializor = initializer;
}

function getYDoc(docName, gc = true) {
  const existing = docs.get(docName);

  if (existing) {
    return existing;
  }

  const doc = new WSSharedDoc(docName);
  doc.gc = gc;
  docs.set(docName, doc);
  return doc;
}

function closeConn(doc, conn) {
  if (doc.conns.has(conn)) {
    const controlledIds = doc.conns.get(conn) || new Set();
    doc.conns.delete(conn);

    if (controlledIds.size > 0) {
      awarenessProtocol.removeAwarenessStates(doc.awareness, Array.from(controlledIds), null);
    }

    markActivity(doc.name);
    schedulePersist(doc.name, doc);
  }

  try {
    conn.close();
  } catch {
    // Ignore close races.
  }
}

function send(doc, conn, message) {
  if (conn.readyState !== WebSocket.CONNECTING && conn.readyState !== WebSocket.OPEN) {
    closeConn(doc, conn);
    return;
  }

  try {
    conn.send(message, {}, (error) => {
      if (error != null) {
        closeConn(doc, conn);
      }
    });
  } catch {
    closeConn(doc, conn);
  }
}

function updateHandler(update, _origin, doc, _transaction) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.writeUpdate(encoder, update);
  const payload = encoding.toUint8Array(encoder);

  doc.conns.forEach((_, connection) => {
    send(doc, connection, payload);
  });
}

function messageListener(conn, doc, message) {
  try {
    const encoder = encoding.createEncoder();
    const decoder = decoding.createDecoder(message);
    const messageType = decoding.readVarUint(decoder);

    switch (messageType) {
      case MESSAGE_SYNC:
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.readSyncMessage(decoder, encoder, doc, conn);

        if (encoding.length(encoder) > 1) {
          send(doc, conn, encoding.toUint8Array(encoder));
        }
        break;
      case MESSAGE_AWARENESS:
        awarenessProtocol.applyAwarenessUpdate(doc.awareness, decoding.readVarUint8Array(decoder), conn);
        break;
      default:
        break;
    }
  } catch (error) {
    console.error('Caught error while handling a Yjs update', error);
  }
}

async function setupWSConnection(conn, request, { docName = normalizeDocName(request.url), gc = true } = {}) {
  conn.binaryType = 'arraybuffer';
  const doc = getYDoc(docName, gc);
  const queuedMessages = [];
  let initialized = false;

  const handlePayload = (message) => {
    const payload =
      message instanceof ArrayBuffer
        ? new Uint8Array(message)
        : ArrayBuffer.isView(message)
          ? new Uint8Array(message.buffer, message.byteOffset, message.byteLength)
          : new Uint8Array(message);

    if (!initialized) {
      queuedMessages.push(payload);
      return;
    }

    markActivity(docName);
    messageListener(conn, doc, payload);
  };

  conn.on('message', handlePayload);

  let pongReceived = true;
  const pingInterval = setInterval(() => {
    if (!pongReceived) {
      if (doc.conns.has(conn)) {
        closeConn(doc, conn);
      }
      clearInterval(pingInterval);
      return;
    }

    if (doc.conns.has(conn)) {
      pongReceived = false;

      try {
        conn.ping();
      } catch {
        closeConn(doc, conn);
        clearInterval(pingInterval);
      }
    }
  }, PING_TIMEOUT_MS);

  conn.on('close', () => {
    closeConn(doc, conn);
    clearInterval(pingInterval);
  });
  conn.on('pong', () => {
    pongReceived = true;
    markActivity(docName);
  });

  await doc.whenInitialized;
  initialized = true;
  doc.conns.set(conn, new Set());
  markActivity(docName);

  for (const payload of queuedMessages) {
    messageListener(conn, doc, payload);
  }
  queuedMessages.length = 0;

  const syncEncoder = encoding.createEncoder();
  encoding.writeVarUint(syncEncoder, MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(syncEncoder, doc);
  send(doc, conn, encoding.toUint8Array(syncEncoder));

  const awarenessStates = doc.awareness.getStates();

  if (awarenessStates.size > 0) {
    const awarenessEncoder = encoding.createEncoder();
    encoding.writeVarUint(awarenessEncoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      awarenessEncoder,
      awarenessProtocol.encodeAwarenessUpdate(doc.awareness, Array.from(awarenessStates.keys())),
    );
    send(doc, conn, encoding.toUint8Array(awarenessEncoder));
  }
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

function probeExistingServer() {
  return new Promise((resolve) => {
    const req = http.get(
      {
        host: HOST,
        port: PORT,
        path: '/health',
        timeout: 1500,
      },
      (res) => {
        let raw = '';

        res.on('data', (chunk) => {
          raw += chunk.toString();
        });

        res.on('end', () => {
          try {
            const payload = JSON.parse(raw);
            resolve(Boolean(payload?.ok));
          } catch {
            resolve(false);
          }
        });
      },
    );

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
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

  setupWSConnection(ws, request, { docName, gc: true }).catch((error) => {
    console.error(`[collab] failed to initialize ${docName}:`, error);
    ws.close();
  });
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

async function startServer() {
  try {
    await new Promise((resolve, reject) => {
      const handleError = (error) => {
        server.off('listening', handleListening);
        reject(error);
      };
      const handleListening = () => {
        server.off('error', handleError);
        resolve(undefined);
      };

      server.once('error', handleError);
      server.once('listening', handleListening);
      server.listen(PORT, HOST);
    });

    console.log(`[collab] listening on ws://${HOST}:${PORT}`);
    console.log(`[collab] persistence dir: ${persistenceDir}`);
    console.log(`[collab] inactivity timeout: ${INACTIVITY_TIMEOUT_MS}ms`);
  } catch (error) {
    if (error?.code === 'EADDRINUSE' && (await probeExistingServer())) {
      console.log(`[collab] reusing existing server on ws://${HOST}:${PORT}`);
      return;
    }

    throw error;
  }
}

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

startServer().catch((error) => {
  console.error('[collab] failed to start server:', error);
  process.exit(1);
});
