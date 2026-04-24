import type { FileMap } from './constants';

export type ProjectMemoryEntry = {
  projectKey: string;
  summary: string;
  architecture: string;
  latestGoal: string;
  runCount: number;
  updatedAt: string;
};

type MemoryStore = Map<string, ProjectMemoryEntry>;
type ProjectMemoryKeyInput =
  | FileMap
  | {
      files?: FileMap;
      projectContextId?: string | null;
      hostedRuntimeSessionId?: string | null;
    };

const GLOBAL_MEMORY_KEY = '__bolt_project_memory_v1';

function getStore(): MemoryStore {
  const g = globalThis as typeof globalThis & {
    [GLOBAL_MEMORY_KEY]?: MemoryStore;
  };

  if (!g[GLOBAL_MEMORY_KEY]) {
    g[GLOBAL_MEMORY_KEY] = new Map<string, ProjectMemoryEntry>();
  }

  return g[GLOBAL_MEMORY_KEY] as MemoryStore;
}

function hash(input: string): string {
  let h = 2166136261;

  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  return `pm_${(h >>> 0).toString(16)}`;
}

function createEphemeralSeed() {
  const randomId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

  return `ephemeral:${randomId}`;
}

function normalizeGoal(message: string): string {
  const trimmed = message.trim();

  if (!trimmed) {
    return 'No explicit goal captured yet.';
  }

  return trimmed.length > 400 ? `${trimmed.slice(0, 397)}...` : trimmed;
}

function pickTopFiles(files?: FileMap): string[] {
  if (!files) {
    return [];
  }

  return Object.keys(files)
    .filter((filePath) => files[filePath]?.type === 'file')
    .sort()
    .slice(0, 24);
}

function inferArchitecture(files?: FileMap): string {
  const fileList = pickTopFiles(files);

  if (!fileList.length) {
    return 'Architecture unknown (no file context available yet).';
  }

  const markers: string[] = [];
  const has = (value: string) => fileList.some((path) => path.toLowerCase().includes(value));

  if (has('remix') || has('app/routes')) {
    markers.push('Remix app/router structure');
  }

  if (has('vite.config') || has('vite.')) {
    markers.push('Vite-based build');
  }

  if (has('tailwind') || has('unocss')) {
    markers.push('Utility-first styling stack');
  }

  if (has('app/components/chat')) {
    markers.push('Chat-centric UI workflow');
  }

  if (has('app/lib/.server') || has('app/routes/api.')) {
    markers.push('Server-side API routes and orchestration');
  }

  const summary = markers.length ? markers.join('; ') : 'General TypeScript web application';

  return `${summary}. Key files sampled: ${fileList.slice(0, 8).join(', ')}`;
}

function isProjectMemoryIdentityInput(
  value: ProjectMemoryKeyInput | undefined,
): value is Exclude<ProjectMemoryKeyInput, FileMap> {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    ('files' in value || 'projectContextId' in value || 'hostedRuntimeSessionId' in value),
  );
}

function resolveProjectMemorySeed(input?: ProjectMemoryKeyInput): string {
  let files: FileMap | undefined;

  if (isProjectMemoryIdentityInput(input)) {
    const explicitProjectContextId = input.projectContextId?.trim();

    if (explicitProjectContextId) {
      return `project-context:${explicitProjectContextId}`;
    }

    const hostedRuntimeSessionId = input.hostedRuntimeSessionId?.trim();

    if (hostedRuntimeSessionId) {
      return `hosted-runtime:${hostedRuntimeSessionId}`;
    }

    files = input.files;
  } else {
    files = input;
  }

  const fileList = pickTopFiles(files);

  if (fileList.length > 0) {
    return `files:${fileList.join('|')}`;
  }

  return createEphemeralSeed();
}

export function deriveProjectMemoryKey(input?: ProjectMemoryKeyInput): string {
  const seed = resolveProjectMemorySeed(input);

  return hash(seed);
}

export function getProjectMemory(projectKey: string): ProjectMemoryEntry | null {
  return getStore().get(projectKey) || null;
}

export function upsertProjectMemory(input: {
  projectKey: string;
  files?: FileMap;
  latestGoal: string;
  summary?: string;
}): ProjectMemoryEntry {
  const store = getStore();
  const existing = store.get(input.projectKey);
  const runCount = (existing?.runCount || 0) + 1;
  const latestGoal = normalizeGoal(input.latestGoal);
  const summary = input.summary?.trim() || existing?.summary || latestGoal;
  const architecture =
    pickTopFiles(input.files).length > 0
      ? inferArchitecture(input.files)
      : existing?.architecture || inferArchitecture(input.files);
  const updatedAt = new Date().toISOString();

  const entry: ProjectMemoryEntry = {
    projectKey: input.projectKey,
    summary: summary.length > 1200 ? `${summary.slice(0, 1197)}...` : summary,
    architecture: architecture.length > 1200 ? `${architecture.slice(0, 1197)}...` : architecture,
    latestGoal,
    runCount,
    updatedAt,
  };

  store.set(input.projectKey, entry);

  return entry;
}

export function resetProjectMemoryForTests() {
  const g = globalThis as typeof globalThis & {
    [GLOBAL_MEMORY_KEY]?: MemoryStore;
  };

  g[GLOBAL_MEMORY_KEY] = new Map<string, ProjectMemoryEntry>();
}
