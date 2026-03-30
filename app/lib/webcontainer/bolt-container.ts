/**
 * BoltContainer — bolt.gives custom WebContainer alternative.
 *
 * A drop-in replacement for @webcontainer/api that provides:
 * 1. In-memory Virtual Filesystem (VFS) with file watchers
 * 2. Preview serving via Service Worker interception
 * 3. Shell command execution routed through E2B cloud sandboxes
 * 4. Full compatibility with the existing codebase's WebContainer API surface
 */
import type {
  TextSearchOnProgressCallback,
  TextSearchOptions,
  WebContainer,
  PathWatcherEvent,
} from '@webcontainer/api';
import { WORK_DIR } from '~/utils/constants';
import { createScopedLogger } from '~/utils/logger';
import { isE2BSandboxEnabled, runE2BSandboxCommand, writeFileToE2B } from '~/lib/runtime/e2b-runner';

const logger = createScopedLogger('BoltContainer');

// ─── Virtual Filesystem ──────────────────────────────────────────────────────

type VFSEntry = { type: 'file'; content: Uint8Array } | { type: 'dir' };

function normalizeRelativePath(inputPath: string): string {
  const normalized = inputPath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/');

  if (!normalized || normalized === '.') {
    return '';
  }

  return normalized
    .split('/')
    .filter((s) => s && s !== '.')
    .join('/');
}

function toRelativePath(inputPath: string): string {
  const normalized = inputPath.replace(/\\/g, '/');

  if (normalized === WORK_DIR) {
    return '';
  }

  if (normalized.startsWith(`${WORK_DIR}/`)) {
    return normalizeRelativePath(normalized.slice(WORK_DIR.length + 1));
  }

  return normalizeRelativePath(normalized);
}

function collectParentDirs(relativePath: string): string[] {
  const parents: string[] = [];
  const parts = relativePath.split('/').filter(Boolean);

  for (let i = 0; i < parts.length - 1; i++) {
    parents.push(parts.slice(0, i + 1).join('/'));
  }

  return parents;
}

function decodeContent(content: Uint8Array, encoding?: BufferEncoding): string {
  return new TextDecoder(encoding === 'utf8' ? 'utf-8' : undefined).decode(content);
}

function encodeContent(content: string | Uint8Array): Uint8Array {
  if (content instanceof Uint8Array) {
    return content;
  }

  return new TextEncoder().encode(content);
}

// ─── File Watcher ────────────────────────────────────────────────────────────

type WatchCallback = (events: PathWatcherEvent[]) => void;

class VFSWatcher {
  #callbacks: WatchCallback[] = [];
  #debounceTimer: ReturnType<typeof setTimeout> | null = null;
  #pendingEvents: PathWatcherEvent[] = [];

  addListener(cb: WatchCallback): () => void {
    this.#callbacks.push(cb);

    return () => {
      this.#callbacks = this.#callbacks.filter((c) => c !== cb);
    };
  }

  emit(event: PathWatcherEvent) {
    this.#pendingEvents.push(event);

    if (this.#debounceTimer) {
      clearTimeout(this.#debounceTimer);
    }

    this.#debounceTimer = setTimeout(() => {
      const events = [...this.#pendingEvents];
      this.#pendingEvents = [];

      for (const cb of this.#callbacks) {
        try {
          cb(events);
        } catch {
          /* ignore watcher errors */
        }
      }
    }, 50);
  }
}

// ─── Preview Message System ──────────────────────────────────────────────────

type PreviewMessageHandler = (message: any) => void;

// ─── BoltContainer Class ────────────────────────────────────────────────────

export function createBoltContainer(): Promise<WebContainer> {
  logger.info('Booting BoltContainer...');

  const entries = new Map<string, VFSEntry>();
  entries.set('', { type: 'dir' });

  const watcher = new VFSWatcher();
  const previewListeners: PreviewMessageHandler[] = [];
  let previewScript = '';

  const ensureDir = (relativeDir: string) => {
    const normalized = normalizeRelativePath(relativeDir);

    if (entries.get(normalized)?.type === 'dir') {
      return;
    }

    for (const parent of collectParentDirs(normalized)) {
      if (!entries.has(parent)) {
        entries.set(parent, { type: 'dir' });
        watcher.emit({ type: 'add_dir', path: `${WORK_DIR}/${parent}` } as any);
      }
    }
    entries.set(normalized, { type: 'dir' });
    watcher.emit({ type: 'add_dir', path: `${WORK_DIR}/${normalized}` } as any);
  };

  // Sync file to E2B if enabled
  const syncToE2B = async (filePath: string, content: string) => {
    if (isE2BSandboxEnabled()) {
      try {
        await writeFileToE2B(filePath, content);
      } catch (e) {
        logger.warn('E2B sync error:', e);
      }
    }
  };

  const stub = {
    workdir: WORK_DIR,

    fs: {
      async readFile(filePath: string, _encoding?: BufferEncoding) {
        const relativePath = toRelativePath(filePath);
        const entry = entries.get(relativePath);

        if (!entry || entry.type !== 'file') {
          throw new Error(`ENOENT: no such file, open '${relativePath}'`);
        }

        return decodeContent(entry.content, _encoding);
      },

      async writeFile(filePath: string, content: string | Uint8Array, _encoding?: BufferEncoding) {
        const relativePath = toRelativePath(filePath);
        const isNew = !entries.has(relativePath);

        for (const parent of collectParentDirs(relativePath)) {
          ensureDir(parent);
        }

        const encoded = encodeContent(content);
        entries.set(relativePath, { type: 'file', content: encoded });

        const fullPath = relativePath ? `${WORK_DIR}/${relativePath}` : WORK_DIR;
        watcher.emit({
          type: isNew ? 'add_file' : 'change',
          path: fullPath,
          buffer: encoded,
        } as any);

        // Background-sync to E2B
        const textContent = typeof content === 'string' ? content : decodeContent(encoded);
        syncToE2B(relativePath, textContent);
      },

      async mkdir(dirPath: string, options?: { recursive?: boolean }) {
        const relativePath = toRelativePath(dirPath);

        if (!options?.recursive && relativePath) {
          const parentDir = normalizeRelativePath(relativePath.split('/').slice(0, -1).join('/'));

          if (parentDir && !entries.has(parentDir)) {
            throw new Error(`ENOENT: no such file or directory, mkdir '${relativePath}'`);
          }
        }

        ensureDir(relativePath);
      },

      async rm(targetPath: string, options?: { recursive?: boolean; force?: boolean }) {
        const relativePath = toRelativePath(targetPath);
        const existing = entries.get(relativePath);

        if (!existing) {
          if (options?.force) {
            return;
          }

          throw new Error(`ENOENT: no such file or directory, rm '${relativePath}'`);
        }

        if (existing.type === 'file') {
          entries.delete(relativePath);
          watcher.emit({ type: 'remove_file', path: `${WORK_DIR}/${relativePath}` } as any);

          return;
        }

        const prefix = relativePath ? `${relativePath}/` : '';
        const children = [...entries.keys()].filter((p) => p.startsWith(prefix) && p !== relativePath);

        if (children.length > 0 && !options?.recursive) {
          throw new Error(`ENOTEMPTY: directory not empty, rm '${relativePath}'`);
        }

        for (const child of children) {
          entries.delete(child);
        }
        entries.delete(relativePath);
        watcher.emit({ type: 'remove_dir', path: `${WORK_DIR}/${relativePath}` } as any);
      },

      async readdir(dirPath: string, options?: { withFileTypes?: boolean }) {
        const relativePath = toRelativePath(dirPath);
        const basePrefix = relativePath ? `${relativePath}/` : '';
        const childEntries = new Map<string, VFSEntry>();

        for (const [entryPath, entry] of entries.entries()) {
          if (entryPath === relativePath || !entryPath.startsWith(basePrefix)) {
            continue;
          }

          const remainder = entryPath.slice(basePrefix.length);

          if (!remainder || remainder.includes('/')) {
            continue;
          }

          childEntries.set(remainder, entry);
        }

        if (options?.withFileTypes) {
          return [...childEntries.entries()].map(([name, entry]) => ({
            name,
            isDirectory: () => entry.type === 'dir',
            isFile: () => entry.type === 'file',
          }));
        }

        return [...childEntries.keys()];
      },
    },

    internal: {
      watchPaths(_opts: any, callback: (...args: any[]) => void) {
        // Wire the VFS watcher to the callback used by FilesStore
        const unsubscribe = watcher.addListener((events) => {
          callback([events]);
        });
        return unsubscribe;
      },

      async textSearch(query: string, _options: TextSearchOptions, onProgress: TextSearchOnProgressCallback) {
        const lowered = query.toLowerCase();

        for (const [relativePath, entry] of entries.entries()) {
          if (!relativePath || entry.type !== 'file') {
            continue;
          }

          const content = new TextDecoder().decode(entry.content);
          const lines = content.split('\n');
          const matches: Array<{
            startLineNumber: number;
            endLineNumber: number;
            startColumn: number;
            endColumn: number;
          }> = [];

          lines.forEach((line, index) => {
            const matchIndex = line.toLowerCase().indexOf(lowered);

            if (matchIndex === -1) {
              return;
            }

            matches.push({
              startLineNumber: index + 1,
              endLineNumber: index + 1,
              startColumn: matchIndex + 1,
              endColumn: matchIndex + query.length + 1,
            });
          });

          if (matches.length === 0) {
            continue;
          }

          onProgress(relativePath, [
            {
              preview: { text: content, matches: matches.map((m) => ({ ...m })) },
              ranges: matches,
            },
          ]);
        }
      },
    },

    async setPreviewScript(script: string) {
      previewScript = script;
      logger.info('Preview script registered for BoltContainer');
    },

    on(event: string, handler: PreviewMessageHandler) {
      if (event === 'preview-message') {
        previewListeners.push(handler);
      }
    },

    // Emits a preview message (called by the Service Worker or preview iframe)
    _emitPreviewMessage(message: any) {
      for (const listener of previewListeners) {
        try {
          listener(message);
        } catch {
          /* ignore */
        }
      }
    },

    // Expose the VFS for preview Service Worker
    _getVFSEntries() {
      return entries;
    },

    _getPreviewScript() {
      return previewScript;
    },

    async spawn(command: string, args?: string[]) {
      const fullCommand = args ? `${command} ${args.join(' ')}` : command;
      logger.info(`BoltContainer spawn: ${fullCommand}`);

      const outputChunks: string[] = [];

      // If E2B is enabled, route to the cloud sandbox
      if (isE2BSandboxEnabled()) {
        const result = await runE2BSandboxCommand({
          command: fullCommand,
          onEvent: (event) => {
            if (event.chunk) {
              outputChunks.push(event.chunk);
            }
          },
        });

        const output = new ReadableStream<string>({
          start(controller) {
            controller.enqueue(result.output);
            controller.close();
          },
        });

        const input = new WritableStream<string>({
          write() {
            /* noop */
          },
        });

        return {
          input,
          output,
          resize() {
            // noop
          },
          kill() {
            // noop
          },
          exit: Promise.resolve(result.exitCode),
        };
      }

      // Fallback: run simple built-in commands
      const output = new ReadableStream<string>({
        start(controller) {
          controller.enqueue(
            `\x1b[33m[BoltContainer]\x1b[0m Command execution requires E2B Sandbox. ` +
              `Enable it in Settings → Cloud Environments.\r\n` +
              `Attempted: ${fullCommand}\r\n`,
          );
          controller.close();
        },
      });

      const input = new WritableStream<string>({
        write() {
          /* noop */
        },
      });

      return {
        input,
        output,
        resize() {
          // noop
        },
        kill() {
          // noop
        },
        exit: Promise.resolve(1),
      };
    },
  } as unknown as WebContainer;

  logger.info('BoltContainer booted successfully.');

  return Promise.resolve(stub);
}
