import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { isWorkspaceSourcePath } from '@bolt/core/lib/workspace-source.mjs';

export class WorkspaceSnapshotError extends Error {
  constructor(message, status = 413) {
    super(message);
    this.name = 'WorkspaceSnapshotError';
    this.status = status;
  }
}

export function snapshotLimits(env = process.env) {
  const limit = (name, fallback) => {
    const value = Number(env[name]);
    return Number.isSafeInteger(value) && value > 0 ? value : fallback;
  };
  return {
    maxEntries: limit('RUNTIME_SNAPSHOT_MAX_ENTRIES', 5000),
    maxFileBytes: limit('RUNTIME_SNAPSHOT_MAX_FILE_BYTES', 4 * 1024 * 1024),
    maxTotalBytes: limit('RUNTIME_SNAPSHOT_MAX_TOTAL_BYTES', 16 * 1024 * 1024),
    timeoutMs: limit('RUNTIME_SNAPSHOT_TIMEOUT_MS', 10000),
  };
}

function checkBudget(state, options) {
  options.signal?.throwIfAborted();

  if (Date.now() > state.deadline) {
    throw new WorkspaceSnapshotError('Workspace snapshot timed out. Retry after the current command finishes.', 409);
  }

  if (state.entries > options.maxEntries) {
    throw new WorkspaceSnapshotError(
      'Workspace has too many source entries for a snapshot. Remove generated files or adjust the operator snapshot limit.',
    );
  }
}

async function* walk(root, relative, state, options) {
  checkBudget(state, options);

  const directory = await fs.opendir(path.join(root, relative));

  for await (const entry of directory) {
    checkBudget(state, options);

    const name = path.posix.join(relative, entry.name);

    if (!isWorkspaceSourcePath(name) || entry.isSymbolicLink()) {
      continue;
    }

    if (!entry.isDirectory() && !entry.isFile()) {
      continue;
    }

    state.entries++;
    checkBudget(state, options);

    const canonical = await fs.realpath(path.join(root, name));

    if (!canonical.startsWith(`${root}${path.sep}`)) {
      throw new WorkspaceSnapshotError('Workspace source escaped its project directory.', 400);
    }

    yield { path: name, type: entry.isDirectory() ? 'dir' : 'file' };

    if (entry.isDirectory()) {
      yield* walk(root, name, state, options);
    }
  }
}

export async function* walkWorkspaceSource(rootDir, options = {}) {
  const limits = { ...snapshotLimits(), ...options };
  const root = await fs.realpath(rootDir);
  yield* walk(root, '', { entries: 0, deadline: Date.now() + limits.timeoutMs }, limits);
}

export async function readWorkspaceSnapshot(rootDir, workDir = '/home/project', options = {}) {
  const root = await fs.realpath(rootDir);

  try {
    return await readSourceSnapshot(root, workDir, options);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') {
      throw new WorkspaceSnapshotError(
        'Workspace changed during snapshot. Retry after the current command finishes.',
        409,
      );
    }

    throw error;
  }
}

async function readSourceSnapshot(root, workDir, options) {
  const limits = { ...snapshotLimits(), ...options };
  const state = { entries: 0, deadline: Date.now() + limits.timeoutMs };

  /** @type {Record<string, {type: 'folder'} | {type: 'file', content: string, isBinary: boolean}>} */
  const files = {};
  let totalBytes = 0;

  for await (const entry of walk(root, '', state, limits)) {
    const key = path.posix.join(workDir, entry.path);
    totalBytes += Buffer.byteLength(JSON.stringify(key)) + 64;

    if (totalBytes > limits.maxTotalBytes) {
      throw new WorkspaceSnapshotError('Workspace source exceeds the total snapshot limit.');
    }

    if (entry.type === 'dir') {
      files[key] = { type: 'folder' };
      continue;
    }

    const handle = await fs.open(path.join(root, entry.path), constants.O_RDONLY | (constants.O_NOFOLLOW || 0));

    try {
      const before = await handle.stat();

      if (!before.isFile()) {
        throw new WorkspaceSnapshotError('Workspace source is not a regular file.', 400);
      }

      if (before.size > limits.maxFileBytes) {
        throw new WorkspaceSnapshotError(`Source file exceeds the snapshot limit: ${entry.path}`);
      }

      // Bound worst-case JSON escaping as well as binary encoding before allocation.
      const bytes = before.size * 6;

      if (totalBytes + bytes > limits.maxTotalBytes) {
        throw new WorkspaceSnapshotError(
          'Workspace source exceeds the total snapshot limit. Remove generated files or adjust the operator limit.',
        );
      }

      totalBytes += bytes;

      const buffer = Buffer.alloc(before.size + 1);
      let offset = 0;

      while (offset < buffer.length) {
        checkBudget(state, limits);

        const { bytesRead } = await handle.read(buffer, offset, Math.min(65536, buffer.length - offset), offset);

        if (!bytesRead) {
          break;
        }

        offset += bytesRead;
      }

      const after = await handle.stat();

      if (offset !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
        throw new WorkspaceSnapshotError(
          'Workspace changed during snapshot. Retry after the current command finishes.',
          409,
        );
      }

      const data = buffer.subarray(0, offset);
      const isBinary = data.subarray(0, 4096).includes(0);
      files[key] = { type: 'file', content: data.toString(isBinary ? 'base64' : 'utf8'), isBinary };
    } finally {
      await handle.close();
    }
  }
  checkBudget(state, limits);

  return files;
}

const snapshotReads = new WeakMap();

async function waitForSnapshotRead(previous, signal) {
  signal.throwIfAborted();

  let abort;

  try {
    await Promise.race([
      previous.catch(() => undefined),
      new Promise((_resolve, reject) => {
        abort = () => reject(signal.reason);
        signal.addEventListener('abort', abort, { once: true });
      }),
    ]);
  } finally {
    signal.removeEventListener('abort', abort);
  }
}

async function reconcileSnapshotOnce(session, options) {
  const before = session.currentFileMap;
  const revision = session.workspaceMutationId;
  const files = await readWorkspaceSnapshot(session.dir, options.workDir, options);

  if (before !== session.currentFileMap || revision !== session.workspaceMutationId) {
    throw new WorkspaceSnapshotError(
      'Workspace changed during snapshot. Retry after the current command finishes.',
      409,
    );
  }

  session.currentFileMap = files;

  return files;
}

export async function reconcileWorkspaceSnapshot(session, options = {}) {
  const limits = { ...snapshotLimits(), ...options };
  const deadline = Date.now() + limits.timeoutMs;
  const previous = snapshotReads.get(session) || Promise.resolve();
  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  const timer = setTimeout(
    () => controller.abort(new WorkspaceSnapshotError('Workspace snapshot timed out.', 409)),
    limits.timeoutMs,
  );
  const operation = (async () => {
    // A read updates the reconciled cache; concurrent reads must not invalidate each other.
    await waitForSnapshotRead(previous, signal);

    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted();

      try {
        return await reconcileSnapshotOnce(session, {
          ...limits,
          signal,
          timeoutMs: Math.max(1, deadline - Date.now()),
        });
      } catch (error) {
        if (!(error instanceof WorkspaceSnapshotError) || error.status !== 409 || attempt >= 2) {
          throw error;
        }

        await delay(50 * (attempt + 1), undefined, { signal });
      }
    }
  })();

  // An aborted waiter must not release readers still ahead of it in the queue.
  const settledOperation = operation.catch(() => undefined);
  const queued = previous.catch(() => undefined).then(() => settledOperation);
  snapshotReads.set(session, queued);
  void queued.then(() => {
    if (snapshotReads.get(session) === queued) {
      snapshotReads.delete(session);
    }
  });

  try {
    return await operation;
  } finally {
    clearTimeout(timer);
  }
}
