import { json, type ActionFunction, type LoaderFunction, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { parseUpdatePolicyFromReleaseBody, type UpdatePolicy, type ParsedUpdatePolicy } from '~/lib/api/update-policy';

const NODE_MEMORY_BASELINE_MB = 4096;
const DEFAULT_RETRY_COUNT = 1;
const MAIN_BRANCH = 'main';
const UPDATE_REPO = 'embire2/bolt.gives';
const MAX_OPERATION_LOGS = 240;
const UPDATE_RUNTIME_UNSUPPORTED_MESSAGE =
  'Update checks are unavailable in this runtime. Continue updates through your normal Git/Cloudflare deploy flow.';

type UpdateLogStatus = 'pending' | 'running' | 'ok' | 'error' | 'retry' | 'rollback' | 'skipped';

type UpdateLogEntry = {
  step: string;
  status: UpdateLogStatus;
  command?: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  message?: string;
  progress?: number;
  timestamp?: string;
};

type UpdateStatusPayload = {
  supported: boolean;
  available: boolean;
  policy: UpdatePolicy;
  mandatory: boolean;
  currentVersion?: string;
  latestVersion?: string;
  releaseUrl?: string;
  releaseName?: string;
  releaseNotes?: string;
  features: string[];
  branch: string;
  checkedAt: string;
  nodeMemoryBaselineMb: number;
  updateInProgress: boolean;
  operation?: UpdateOperationSnapshot;
  error?: string;
};

type UpdateOperationSnapshot = {
  id: string;
  status: 'running' | 'completed' | 'failed';
  progress: number;
  currentStep: string;
  targetVersion?: string;
  startedAt: string;
  finishedAt?: string;
  fromCommit?: string;
  toCommit?: string;
  rollbackApplied?: boolean;
  error?: string;
  logs: UpdateLogEntry[];
};

type UpdateOperation = UpdateOperationSnapshot & {
  subscribers: Set<ReadableStreamDefaultController<Uint8Array>>;
};

type CommandError = Error & {
  code?: number | string;
  stdout?: string;
  stderr?: string;
};

type SpawnedUpdateChild = {
  stdout?: { on(event: 'data', listener: (chunk: Buffer) => void): void };
  stderr?: { on(event: 'data', listener: (chunk: Buffer) => void): void };
  on(event: 'error', listener: (error: Error) => void): void;
  on(event: 'close', listener: (code: number | null) => void): void;
};

let activeUpdateOperation: UpdateOperation | null = null;
let lastUpdateOperation: UpdateOperation | null = null;

function isWorkerLikeRuntime(): boolean {
  const globalScope = globalThis as unknown as {
    WebSocketPair?: unknown;
    caches?: unknown;
  };

  return typeof globalScope.WebSocketPair !== 'undefined' && typeof globalScope.caches !== 'undefined';
}

async function canRunNodeFileSystem(): Promise<boolean> {
  try {
    const { readFile } = await import('node:fs/promises');
    await readFile('/__bolt_update_runtime_probe__.json', 'utf8');

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';

    if (
      message.includes('[unenv]') ||
      message.includes('not implemented') ||
      message.includes('fs.readfile is not implemented')
    ) {
      return false;
    }

    // ENOENT means fs is working in this runtime; probe path is intentionally missing.
    return true;
  }
}

async function canRunUpdateManager(): Promise<boolean> {
  if (typeof process === 'undefined' || typeof process.cwd !== 'function' || isWorkerLikeRuntime()) {
    return false;
  }

  if (process.env.BOLT_UPDATE_DISABLED === '1' || process.env.BOLT_UPDATE_DISABLED === 'true') {
    return false;
  }

  return canRunNodeFileSystem();
}

function compareVersions(v1: string, v2: string): number {
  const p1 = v1
    .replace(/^v/i, '')
    .split('.')
    .map((part) => Number(part || 0));
  const p2 = v2
    .replace(/^v/i, '')
    .split('.')
    .map((part) => Number(part || 0));
  const maxLength = Math.max(p1.length, p2.length);

  for (let index = 0; index < maxLength; index++) {
    const left = p1[index] || 0;
    const right = p2[index] || 0;

    if (left !== right) {
      return left - right;
    }
  }

  return 0;
}

export function toUserSafeUpdateError(error: unknown): string {
  const fallback = 'Failed to check for updates';

  if (!(error instanceof Error)) {
    return fallback;
  }

  const message = error.message || fallback;
  const normalized = message.toLowerCase();

  if (
    normalized.includes('[unenv]') ||
    normalized.includes('fs.readfile is not implemented') ||
    normalized.includes('not implemented yet') ||
    normalized.includes('update manager:')
  ) {
    return UPDATE_RUNTIME_UNSUPPORTED_MESSAGE;
  }

  if (normalized.includes('node:fs') || normalized.includes('process is not defined')) {
    return UPDATE_RUNTIME_UNSUPPORTED_MESSAGE;
  }

  return message;
}

async function readCurrentVersion(rootDir: string): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const packageJsonRaw = await readFile(join(rootDir, 'package.json'), 'utf8');
  const packageJson = JSON.parse(packageJsonRaw) as { version?: string };

  return packageJson.version || '0.0.0';
}

async function fetchLatestPackageVersion(): Promise<string> {
  const response = await fetch(`https://raw.githubusercontent.com/${UPDATE_REPO}/main/package.json`, {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch latest package.json (${response.status})`);
  }

  const remote = (await response.json()) as { version?: string };

  return remote.version || '0.0.0';
}

async function fetchLatestRelease(): Promise<{
  version: string;
  name?: string;
  url?: string;
  body?: string;
}> {
  const response = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'bolt-gives-update-manager',
    },
  });

  if (!response.ok) {
    const version = await fetchLatestPackageVersion();

    return { version };
  }

  const release = (await response.json()) as {
    tag_name?: string;
    name?: string;
    html_url?: string;
    body?: string;
  };
  const versionFromTag = String(release.tag_name || '').replace(/^v/i, '');

  return {
    version: versionFromTag || (await fetchLatestPackageVersion()),
    name: release.name,
    url: release.html_url,
    body: release.body,
  };
}

function resolveReleasePolicy(releaseBody: string | undefined, latestVersion: string): ParsedUpdatePolicy {
  const envPolicy = process.env.BOLT_UPDATE_POLICY || process.env.BOLT_UPDATE_RELEASE_POLICY || null;
  const parsed = parseUpdatePolicyFromReleaseBody(releaseBody, envPolicy);
  const mandatoryVersions = String(process.env.BOLT_MANDATORY_UPDATE_VERSION || '')
    .split(',')
    .map((version) => version.trim().replace(/^v/i, ''))
    .filter(Boolean);

  if (mandatoryVersions.includes(latestVersion.replace(/^v/i, ''))) {
    return {
      ...parsed,
      policy: 'mandatory',
    };
  }

  return parsed;
}

function operationSnapshot(operation: UpdateOperation | null): UpdateOperationSnapshot | undefined {
  if (!operation) {
    return undefined;
  }

  const { subscribers: _subscribers, ...snapshot } = operation;

  return {
    ...snapshot,
    logs: snapshot.logs.slice(-120),
  };
}

async function resolveUpdateStatus(): Promise<UpdateStatusPayload> {
  if (!(await canRunUpdateManager())) {
    return {
      supported: false,
      available: false,
      policy: 'optional',
      mandatory: false,
      branch: MAIN_BRANCH,
      checkedAt: new Date().toISOString(),
      nodeMemoryBaselineMb: NODE_MEMORY_BASELINE_MB,
      updateInProgress: activeUpdateOperation?.status === 'running',
      features: [],
      error: 'Update checks are unavailable in this runtime.',
    };
  }

  const rootDir = process.cwd();
  const [currentVersion, latestRelease] = await Promise.all([readCurrentVersion(rootDir), fetchLatestRelease()]);
  const latestVersion = latestRelease.version;
  const policy = resolveReleasePolicy(latestRelease.body, latestVersion);
  const available = compareVersions(latestVersion, currentVersion) > 0;

  return {
    supported: true,
    available,
    policy: policy.policy,
    mandatory: available && policy.policy === 'mandatory',
    currentVersion,
    latestVersion,
    releaseUrl: latestRelease.url,
    releaseName: latestRelease.name,
    releaseNotes: latestRelease.body,
    features: policy.features,
    branch: MAIN_BRANCH,
    checkedAt: new Date().toISOString(),
    nodeMemoryBaselineMb: NODE_MEMORY_BASELINE_MB,
    updateInProgress: activeUpdateOperation?.status === 'running',
    operation: operationSnapshot(activeUpdateOperation || lastUpdateOperation),
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowIso(): string {
  return new Date().toISOString();
}

function appendLog(operation: UpdateOperation, entry: UpdateLogEntry) {
  operation.logs.push({
    ...entry,
    timestamp: entry.timestamp || nowIso(),
  });

  if (operation.logs.length > MAX_OPERATION_LOGS) {
    operation.logs.splice(0, operation.logs.length - MAX_OPERATION_LOGS);
  }

  if (typeof entry.progress === 'number') {
    operation.progress = Math.max(operation.progress, Math.min(100, entry.progress));
  }

  operation.currentStep = entry.step;
  emitOperationEvent(operation, 'update', operationSnapshot(operation));
}

function emitOperationEvent(operation: UpdateOperation, event: string, payload: unknown) {
  const encoder = new TextEncoder();
  const chunk = encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);

  for (const subscriber of Array.from(operation.subscribers)) {
    try {
      subscriber.enqueue(chunk);
    } catch {
      operation.subscribers.delete(subscriber);
    }
  }
}

function finishOperation(operation: UpdateOperation, status: 'completed' | 'failed', extra: Partial<UpdateOperation>) {
  operation.status = status;
  operation.finishedAt = nowIso();
  Object.assign(operation, extra);
  operation.progress = status === 'completed' ? 100 : operation.progress;
  emitOperationEvent(operation, status === 'completed' ? 'done' : 'error', operationSnapshot(operation));

  for (const subscriber of Array.from(operation.subscribers)) {
    try {
      subscriber.close();
    } catch {}
  }

  operation.subscribers.clear();
  activeUpdateOperation = null;
  lastUpdateOperation = operation;
}

async function getCommitHash(rootDir: string, operation?: UpdateOperation): Promise<string> {
  const result = await runCommand({
    operation,
    rootDir,
    step: 'Read current commit',
    command: 'git',
    args: ['rev-parse', 'HEAD'],
    progress: operation ? operation.progress : 0,
    retries: 0,
  });

  return result.stdout.trim();
}

function buildCommandEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --max-old-space-size=${NODE_MEMORY_BASELINE_MB}`.trim(),
  };
}

async function runCommand(options: {
  operation?: UpdateOperation;
  rootDir: string;
  step: string;
  command: string;
  args: string[];
  progress: number;
  retries?: number;
}): Promise<{ stdout: string; stderr: string }> {
  const retryCount = Math.max(0, options.retries ?? DEFAULT_RETRY_COUNT);

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      return await runCommandOnce(options);
    } catch (error) {
      const commandError = error as CommandError;
      const exitCode =
        typeof commandError.code === 'number' ? commandError.code : Number.parseInt(String(commandError.code), 10);

      if (attempt < retryCount) {
        if (options.operation) {
          appendLog(options.operation, {
            step: options.step,
            status: 'retry',
            command: `${options.command} ${options.args.join(' ')}`.trim(),
            exitCode: Number.isFinite(exitCode) ? exitCode : undefined,
            stderr: commandError.stderr?.trim() || commandError.message,
            message: `Attempt ${attempt + 1} failed; retrying.`,
            progress: options.progress,
          });
        }

        await wait(1500 * (attempt + 1));
        continue;
      }

      throw error;
    }
  }

  throw new Error(`Failed to execute command: ${options.command} ${options.args.join(' ')}`);
}

async function runCommandOnce(options: {
  operation?: UpdateOperation;
  rootDir: string;
  step: string;
  command: string;
  args: string[];
  progress: number;
}): Promise<{ stdout: string; stderr: string }> {
  const { spawn } = await import('node:child_process');
  const commandString = `${options.command} ${options.args.join(' ')}`.trim();

  if (options.operation) {
    appendLog(options.operation, {
      step: options.step,
      status: 'running',
      command: commandString,
      progress: options.progress,
    });
  }

  return await new Promise((resolve, reject) => {
    const child = spawn(options.command, options.args, {
      cwd: options.rootDir,
      env: buildCommandEnv(),
      shell: false,
    }) as unknown as SpawnedUpdateChild;
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;

      if (options.operation) {
        appendLog(options.operation, {
          step: options.step,
          status: 'running',
          command: commandString,
          stdout: text.trim().slice(-2000),
          progress: options.progress,
        });
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;

      if (options.operation) {
        appendLog(options.operation, {
          step: options.step,
          status: 'running',
          command: commandString,
          stderr: text.trim().slice(-2000),
          progress: options.progress,
        });
      }
    });

    child.on('error', (error: Error) => {
      const commandError = error as CommandError;
      commandError.stdout = stdout;
      commandError.stderr = stderr;
      reject(commandError);
    });

    child.on('close', (code: number | null) => {
      if (code === 0) {
        if (options.operation) {
          appendLog(options.operation, {
            step: options.step,
            status: 'ok',
            command: commandString,
            stdout: stdout.trim().slice(-4000),
            stderr: stderr.trim().slice(-4000),
            progress: options.progress,
          });
        }

        resolve({ stdout, stderr });

        return;
      }

      const error = new Error(`${commandString} exited with code ${code}`) as CommandError;
      error.code = code ?? undefined;
      error.stdout = stdout;
      error.stderr = stderr;

      if (options.operation) {
        appendLog(options.operation, {
          step: options.step,
          status: 'error',
          command: commandString,
          exitCode: code ?? undefined,
          stdout: stdout.trim().slice(-4000),
          stderr: stderr.trim().slice(-4000),
          progress: options.progress,
        });
      }

      reject(error);
    });
  });
}

async function runSelfUpdate(operation: UpdateOperation, status: UpdateStatusPayload, retryCount: number) {
  const rootDir = process.cwd();
  const backupBranch = `bolt/update-backup-${new Date()
    .toISOString()
    .replace(/[^0-9]/g, '')
    .slice(0, 14)}`;
  let rollbackApplied = false;
  let fromCommit = '';

  try {
    fromCommit = await getCommitHash(rootDir, operation);
    operation.fromCommit = fromCommit;

    await runCommand({
      operation,
      rootDir,
      step: 'Create rollback checkpoint',
      command: 'git',
      args: ['branch', '--force', backupBranch, 'HEAD'],
      progress: 8,
      retries: 0,
    });

    const dirtyStatus = await runCommand({
      operation,
      rootDir,
      step: 'Check local changes',
      command: 'git',
      args: ['status', '--porcelain'],
      progress: 12,
      retries: 0,
    });

    if (dirtyStatus.stdout.trim()) {
      await runCommand({
        operation,
        rootDir,
        step: 'Preserve local changes',
        command: 'git',
        args: ['stash', 'push', '--include-untracked', '-m', `bolt-update-${operation.id}`],
        progress: 18,
        retries: 0,
      });
    } else {
      appendLog(operation, {
        step: 'Preserve local changes',
        status: 'skipped',
        message: 'Working tree is clean; no stash was needed.',
        progress: 18,
      });
    }

    await runCommand({
      operation,
      rootDir,
      step: 'Fetch release source',
      command: 'git',
      args: ['fetch', '--tags', 'origin', MAIN_BRANCH],
      progress: 28,
      retries: retryCount,
    });

    try {
      await runCommand({
        operation,
        rootDir,
        step: 'Switch to release branch',
        command: 'git',
        args: ['switch', MAIN_BRANCH],
        progress: 34,
        retries: 0,
      });
    } catch {
      await runCommand({
        operation,
        rootDir,
        step: 'Create release branch',
        command: 'git',
        args: ['checkout', '-B', MAIN_BRANCH, `origin/${MAIN_BRANCH}`],
        progress: 36,
        retries: 0,
      });
    }

    await runCommand({
      operation,
      rootDir,
      step: `Update files to ${status.latestVersion || 'latest'}`,
      command: 'git',
      args: ['reset', '--hard', `origin/${MAIN_BRANCH}`],
      progress: 44,
      retries: 0,
    });

    await runCommand({
      operation,
      rootDir,
      step: 'Install dependencies',
      command: 'pnpm',
      args: ['install', '--frozen-lockfile'],
      progress: 62,
      retries: retryCount,
    });

    await runCommand({
      operation,
      rootDir,
      step: 'Build updated application',
      command: 'pnpm',
      args: ['run', 'build'],
      progress: 82,
      retries: retryCount,
    });

    const [toCommit, currentVersion] = await Promise.all([
      getCommitHash(rootDir, operation),
      readCurrentVersion(rootDir),
    ]);
    operation.toCommit = toCommit;

    if (status.latestVersion && compareVersions(currentVersion, status.latestVersion) < 0) {
      throw new Error(`Updated version ${currentVersion} is older than expected ${status.latestVersion}.`);
    }

    await scheduleServiceRestart(operation);

    finishOperation(operation, 'completed', {
      toCommit,
      rollbackApplied,
      currentStep: 'Update complete',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Update failed';

    try {
      if (fromCommit) {
        await runCommand({
          operation,
          rootDir,
          step: 'Rollback files',
          command: 'git',
          args: ['reset', '--hard', fromCommit],
          progress: 88,
          retries: 0,
        });
        await runCommand({
          operation,
          rootDir,
          step: 'Restore dependencies after rollback',
          command: 'pnpm',
          args: ['install', '--frozen-lockfile'],
          progress: 92,
          retries: 0,
        });
        await runCommand({
          operation,
          rootDir,
          step: 'Rebuild rollback checkpoint',
          command: 'pnpm',
          args: ['run', 'build'],
          progress: 96,
          retries: 0,
        });
        rollbackApplied = true;
        appendLog(operation, {
          step: 'Rollback',
          status: 'rollback',
          message: `Rollback completed to ${fromCommit}. Backup branch: ${backupBranch}.`,
          progress: 98,
        });
      }
    } catch (rollbackError) {
      appendLog(operation, {
        step: 'Rollback',
        status: 'error',
        message: rollbackError instanceof Error ? rollbackError.message : 'Rollback failed',
        progress: 98,
      });
    }

    finishOperation(operation, 'failed', {
      error: message,
      rollbackApplied,
      currentStep: 'Update failed',
    });
  }
}

async function scheduleServiceRestart(operation: UpdateOperation) {
  const services = String(
    process.env.BOLT_UPDATE_RESTART_SERVICES ||
      (process.env.NODE_ENV === 'production' ? 'bolt-gives-app bolt-gives-runtime bolt-gives-collab' : ''),
  ).trim();

  if (!services || services.toLowerCase() === 'none' || process.env.BOLT_UPDATE_AUTO_RESTART === 'false') {
    appendLog(operation, {
      step: 'Restart services',
      status: 'skipped',
      message: 'Automatic restart is disabled for this runtime.',
      progress: 96,
    });
    return;
  }

  const safeServices = services
    .split(/\s+/)
    .map((service) => service.replace(/[^a-zA-Z0-9_.@-]/g, ''))
    .filter(Boolean)
    .join(' ');

  if (!safeServices) {
    appendLog(operation, {
      step: 'Restart services',
      status: 'skipped',
      message: 'No valid service names were configured.',
      progress: 96,
    });
    return;
  }

  try {
    const { spawn } = await import('node:child_process');
    const child = spawn('sh', ['-lc', `sleep 2; systemctl restart ${safeServices}`], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    appendLog(operation, {
      step: 'Restart services',
      status: 'ok',
      message: `Service restart scheduled for: ${safeServices}. The browser may disconnect while services restart.`,
      progress: 96,
    });
  } catch (error) {
    appendLog(operation, {
      step: 'Restart services',
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to schedule service restart.',
      progress: 96,
    });
  }
}

function startUpdateOperation(status: UpdateStatusPayload, retryCount: number): UpdateOperation {
  if (activeUpdateOperation?.status === 'running') {
    return activeUpdateOperation;
  }

  const operation: UpdateOperation = {
    id: crypto.randomUUID(),
    status: 'running',
    progress: 1,
    currentStep: 'Preparing update',
    targetVersion: status.latestVersion,
    startedAt: nowIso(),
    logs: [],
    subscribers: new Set(),
  };

  activeUpdateOperation = operation;
  lastUpdateOperation = operation;
  appendLog(operation, {
    step: 'Preparing update',
    status: 'running',
    message: `The system will now automatically update to version ${status.latestVersion || 'latest'}. The instance may disconnect during the update.`,
    progress: 1,
  });

  void runSelfUpdate(operation, status, retryCount);

  return operation;
}

function streamUpdateOperation(operationId: string | null): Response {
  const operation =
    (operationId && activeUpdateOperation?.id === operationId ? activeUpdateOperation : null) ||
    (operationId && lastUpdateOperation?.id === operationId ? lastUpdateOperation : null) ||
    activeUpdateOperation ||
    lastUpdateOperation;

  if (!operation) {
    return new Response('No update operation is available.', { status: 404 });
  }

  let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
      operation.subscribers.add(controller);
      emitOperationEvent(operation, 'snapshot', operationSnapshot(operation));

      if (operation.status !== 'running') {
        emitOperationEvent(
          operation,
          operation.status === 'completed' ? 'done' : 'error',
          operationSnapshot(operation),
        );
        controller.close();
        operation.subscribers.delete(controller);
      }
    },
    cancel() {
      if (streamController) {
        operation.subscribers.delete(streamController);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
    },
  });
}

export const loader: LoaderFunction = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get('stream') === '1') {
    if (!(await canRunUpdateManager())) {
      return new Response('Update streams are unavailable in this runtime.', { status: 503 });
    }

    return streamUpdateOperation(url.searchParams.get('operationId'));
  }

  try {
    return json(await resolveUpdateStatus());
  } catch (error) {
    return json({
      supported: true,
      available: false,
      policy: 'optional',
      mandatory: false,
      branch: MAIN_BRANCH,
      checkedAt: new Date().toISOString(),
      nodeMemoryBaselineMb: NODE_MEMORY_BASELINE_MB,
      updateInProgress: activeUpdateOperation?.status === 'running',
      features: [],
      error: toUserSafeUpdateError(error),
    } satisfies UpdateStatusPayload);
  }
};

export const action: ActionFunction = async ({ request }) => {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  if (!(await canRunUpdateManager())) {
    return json(
      { started: false, updated: false, error: 'Update execution is unavailable in this runtime.' },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { retryCount?: number };
  const retryCount = Math.max(0, Math.min(3, Number(body.retryCount ?? DEFAULT_RETRY_COUNT)));

  try {
    const status = await resolveUpdateStatus();

    if (!status.available) {
      return json({
        started: false,
        updated: false,
        reason: 'already-current',
        currentVersion: status.currentVersion,
        latestVersion: status.latestVersion,
        logs: [],
        nodeMemoryBaselineMb: NODE_MEMORY_BASELINE_MB,
      });
    }

    const operation = startUpdateOperation(status, retryCount);

    return json({
      started: true,
      updated: false,
      operationId: operation.id,
      operation: operationSnapshot(operation),
      currentVersion: status.currentVersion,
      latestVersion: status.latestVersion,
      mandatory: status.mandatory,
      policy: status.policy,
      logs: operation.logs,
      nodeMemoryBaselineMb: NODE_MEMORY_BASELINE_MB,
    });
  } catch (error) {
    return json(
      {
        started: false,
        updated: false,
        error: error instanceof Error ? error.message : 'Update failed',
        logs: [],
        nodeMemoryBaselineMb: NODE_MEMORY_BASELINE_MB,
      },
      { status: 500 },
    );
  }
};
