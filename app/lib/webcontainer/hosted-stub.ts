import type { TextSearchOnProgressCallback, TextSearchOptions, WebContainer } from '@webcontainer/api';
import { WORK_DIR } from '~/utils/constants';

type StubEntry = { type: 'file'; content: Uint8Array } | { type: 'dir' };

function normalizeRelativePath(inputPath: string) {
  const normalized = inputPath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/');

  if (!normalized || normalized === '.') {
    return '';
  }

  return normalized
    .split('/')
    .filter((segment) => segment && segment !== '.')
    .join('/');
}

function toRelativePath(inputPath: string) {
  const normalized = inputPath.replace(/\\/g, '/');

  if (normalized === WORK_DIR) {
    return '';
  }

  if (normalized.startsWith(`${WORK_DIR}/`)) {
    return normalizeRelativePath(normalized.slice(WORK_DIR.length + 1));
  }

  return normalizeRelativePath(normalized);
}

function collectParentDirs(relativePath: string) {
  const parents: string[] = [];
  const parts = relativePath.split('/').filter(Boolean);

  for (let index = 0; index < parts.length - 1; index++) {
    parents.push(parts.slice(0, index + 1).join('/'));
  }

  return parents;
}

function decodeContent(content: Uint8Array, encoding?: BufferEncoding) {
  return new TextDecoder(encoding === 'utf8' ? 'utf-8' : undefined).decode(content);
}

function encodeContent(content: string | Uint8Array, _encoding?: BufferEncoding) {
  if (content instanceof Uint8Array) {
    return content;
  }

  return new TextEncoder().encode(content);
}

function createReadableOutput() {
  return new ReadableStream<string>({
    start(controller) {
      controller.enqueue(
        '\x1b]654;interactive\x07Hosted runtime active. Interactive browser shells are disabled on managed instances.\r\n',
      );
      controller.close();
    },
  });
}

export function createHostedWebContainerStub(): Promise<WebContainer> {
  const entries = new Map<string, StubEntry>();
  entries.set('', { type: 'dir' });

  const ensureDir = (relativeDir: string) => {
    const normalized = normalizeRelativePath(relativeDir);

    if (entries.get(normalized)?.type === 'dir') {
      return;
    }

    for (const parent of collectParentDirs(normalized)) {
      if (!entries.has(parent)) {
        entries.set(parent, { type: 'dir' });
      }
    }

    entries.set(normalized, { type: 'dir' });
  };

  const stub = {
    workdir: WORK_DIR,
    fs: {
      async readFile(filePath: string, encoding?: BufferEncoding) {
        const relativePath = toRelativePath(filePath);
        const entry = entries.get(relativePath);

        if (!entry || entry.type !== 'file') {
          throw new Error(`ENOENT: no such file, open '${relativePath}'`);
        }

        return decodeContent(entry.content, encoding);
      },
      async writeFile(filePath: string, content: string | Uint8Array, encoding?: BufferEncoding) {
        const relativePath = toRelativePath(filePath);

        for (const parent of collectParentDirs(relativePath)) {
          ensureDir(parent);
        }

        entries.set(relativePath, {
          type: 'file',
          content: encodeContent(content, encoding),
        });
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
          return;
        }

        const prefix = relativePath ? `${relativePath}/` : '';
        const children = [...entries.keys()].filter(
          (entryPath) => entryPath.startsWith(prefix) && entryPath !== relativePath,
        );

        if (children.length > 0 && !options?.recursive) {
          throw new Error(`ENOTEMPTY: directory not empty, rm '${relativePath}'`);
        }

        for (const child of children) {
          entries.delete(child);
        }

        entries.delete(relativePath);
      },
      async readdir(dirPath: string, options?: { withFileTypes?: boolean }) {
        const relativePath = toRelativePath(dirPath);
        const basePrefix = relativePath ? `${relativePath}/` : '';
        const childEntries = new Map<string, StubEntry>();

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
      watchPaths() {
        return () => {
          // noop: hosted runtime sync is explicit
        };
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
              preview: {
                text: content,
                matches: matches.map((match) => ({
                  startLineNumber: match.startLineNumber,
                  endLineNumber: match.endLineNumber,
                  startColumn: match.startColumn,
                  endColumn: match.endColumn,
                })),
              },
              ranges: matches,
            },
          ]);
        }
      },
    },
    async setPreviewScript() {
      // noop: preview instrumentation runs on the hosted runtime service
    },
    on() {
      // noop: hosted runtime emits preview readiness through the runtime API
    },
    async spawn() {
      const input = new WritableStream<string>({
        write() {
          // noop: interactive browser shells stay disabled on hosted instances
        },
      });

      return {
        input,
        output: createReadableOutput(),
        resize() {
          // noop: no interactive hosted browser shell
        },
        kill() {
          // noop: no interactive hosted browser shell
        },
      };
    },
  } as unknown as WebContainer;

  return Promise.resolve(stub);
}
