import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

function randomPort() {
  return 14000 + Math.floor(Math.random() * 1000);
}

async function waitFor<T>(fn: () => Promise<T | undefined> | T | undefined, timeoutMs = 8000, intervalMs = 50): Promise<T> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const value = await fn();

    if (value !== undefined) {
      return value;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error('Timed out waiting for condition');
}

function createDocConnection(port: number, roomName: string) {
  // Avoid a static import so TypeScript doesn't pull ws types into the main program (keeps `pnpm run typecheck` lean).
  // Vitest executes this in Node, so runtime require is safe here.
  const wsModule = require('ws');
  const WebSocket = wsModule?.default ?? wsModule?.WebSocket ?? wsModule;

  const doc = new Y.Doc();
  const provider = new WebsocketProvider(`ws://127.0.0.1:${port}`, roomName, doc, {
    // Node.js doesn't guarantee a global WebSocket across supported versions; use ws directly.
    WebSocketPolyfill: WebSocket as any,
  });
  const yText = doc.getText('content');

  return { doc, provider, yText };
}

async function waitForSync(provider: WebsocketProvider, timeoutMs = 8000) {
  if ((provider as any).synced === true) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for sync')), timeoutMs);

    const onSync = (isSynced: boolean) => {
      if (!isSynced) {
        return;
      }

      clearTimeout(timer);
      provider.off('sync', onSync);
      resolve();
    };

    provider.on('sync', onSync);
  });
}

async function fetchHealth(port: number) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`);

    if (!response.ok) {
      return undefined;
    }

    return (await response.json()) as { ok: boolean; docs: number };
  } catch {
    return undefined;
  }
}

async function waitForHealth(port: number) {
  return waitFor(() => fetchHealth(port), 10000);
}

async function startServer(options: {
  port: number;
  persistDir: string;
  persistDebounceMs?: number;
  inactivityTimeoutMs?: number;
  cleanupSweepMs?: number;
}) {
  const env = {
    ...process.env,
    COLLAB_HOST: '127.0.0.1',
    COLLAB_PORT: String(options.port),
    COLLAB_PERSIST_DIR: options.persistDir,
    COLLAB_PERSIST_DEBOUNCE_MS: String(options.persistDebounceMs ?? 100),
    COLLAB_INACTIVITY_TIMEOUT_MS: String(options.inactivityTimeoutMs ?? 5000),
    COLLAB_CLEANUP_SWEEP_MS: String(options.cleanupSweepMs ?? 250),
  };

  const processHandle = spawn('node', ['scripts/collaboration-server.mjs'], {
    cwd: ROOT_DIR,
    env,
    stdio: 'pipe',
  });
  let output = '';

  processHandle.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  processHandle.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });

  await waitForHealth(options.port);

  return {
    process: processHandle,
    getOutput: () => output,
  };
}

async function stopServer(processHandle: ChildProcessWithoutNullStreams) {
  if (processHandle.exitCode !== null) {
    return;
  }

  processHandle.kill('SIGTERM');
  await Promise.race([once(processHandle, 'exit'), new Promise((resolve) => setTimeout(resolve, 5000))]);
}

describe('collaboration-server', () => {
  const activeServers: ChildProcessWithoutNullStreams[] = [];
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (activeServers.length > 0) {
      const next = activeServers.pop();

      if (next) {
        await stopServer(next);
      }
    }

    while (tempDirs.length > 0) {
      const next = tempDirs.pop();

      if (next) {
        await rm(next, { recursive: true, force: true });
      }
    }
  });

  it('syncs edits across clients and restores persisted content after restart', async () => {
    const port = randomPort();
    const persistDir = await mkdtemp(path.join(os.tmpdir(), 'bolt-collab-'));
    tempDirs.push(persistDir);

    const serverA = await startServer({ port, persistDir, persistDebounceMs: 80 });
    activeServers.push(serverA.process);

    const room = 'project/src/App.tsx';
    const clientA = createDocConnection(port, room);
    const clientB = createDocConnection(port, room);

    await waitForSync(clientA.provider);
    await waitForSync(clientB.provider);

    clientA.yText.insert(0, 'hello collaboration');

    await waitFor(() => {
      const value = clientB.yText.toString();
      return value === 'hello collaboration' ? value : undefined;
    });

    clientA.provider.destroy();
    clientB.provider.destroy();
    clientA.doc.destroy();
    clientB.doc.destroy();

    await waitFor(async () => {
      const files = await readdir(persistDir).catch(() => []);

      if (files.length === 0) {
        return undefined;
      }

      const stats = await Promise.all(files.map((file) => stat(path.join(persistDir, file))));
      return stats.some((entry) => entry.size > 0) ? true : undefined;
    }, 5000);

    await stopServer(serverA.process);
    activeServers.pop();

    const serverB = await startServer({ port, persistDir, persistDebounceMs: 80 });
    activeServers.push(serverB.process);

    const clientC = createDocConnection(port, room);
    await waitForSync(clientC.provider);
    await waitFor(() => {
      const value = clientC.yText.toString();
      return value === 'hello collaboration' ? value : undefined;
    }, 5000);

    clientC.provider.destroy();
    clientC.doc.destroy();
  });

  it('cleans up inactive documents after timeout when no clients remain', async () => {
    const port = randomPort();
    const persistDir = await mkdtemp(path.join(os.tmpdir(), 'bolt-collab-'));
    tempDirs.push(persistDir);

    const server = await startServer({
      port,
      persistDir,
      inactivityTimeoutMs: 500,
      cleanupSweepMs: 150,
      persistDebounceMs: 50,
    });
    activeServers.push(server.process);

    const client = createDocConnection(port, 'project/src/inactive.ts');
    await waitForSync(client.provider);
    client.yText.insert(0, 'stale');

    await waitFor(async () => {
      const health = await fetchHealth(port);
      if (!health) {
        return undefined;
      }
      return health.docs > 0 ? health : undefined;
    });

    client.provider.destroy();
    client.doc.destroy();

    await waitFor(async () => {
      const health = await fetchHealth(port);
      if (!health) {
        return undefined;
      }
      return health.docs === 0 ? health : undefined;
    }, 8000);
  });
});
