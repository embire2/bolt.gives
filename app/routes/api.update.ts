import { json, type ActionFunction, type LoaderFunction } from '@remix-run/cloudflare';

const NODE_MEMORY_BASELINE_MB = 4096;
const DEFAULT_RETRY_COUNT = 1;
const MAIN_BRANCH = 'main';
const UPDATE_RUNTIME_UNSUPPORTED_MESSAGE =
  'Update checks are unavailable in this runtime. Continue updates through your normal Git/Cloudflare deploy flow.';

type UpdateLogEntry = {
  step: string;
  status: 'ok' | 'error' | 'retry' | 'rollback';
  command?: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  message?: string;
};

type CommandError = Error & {
  code?: number | string;
  stdout?: string;
  stderr?: string;
};

type ExecFileFn = (
  file: string,
  args: string[],
  options: {
    cwd: string;
    env: Record<string, string | undefined>;
    maxBuffer: number;
  },
) => Promise<{ stdout: string; stderr: string }>;

let execFileAsync: ExecFileFn | null = null;

async function ensureExecFile() {
  if (execFileAsync) {
    return execFileAsync;
  }

  const [{ execFile }, { promisify }] = await Promise.all([import('node:child_process'), import('node:util')]);

  execFileAsync = promisify(execFile) as unknown as ExecFileFn;

  return execFileAsync!;
}

function compareVersions(v1: string, v2: string): number {
  const p1 = v1
    .replace(/^v/, '')
    .split('.')
    .map((part) => Number(part || 0));
  const p2 = v2
    .replace(/^v/, '')
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
    normalized.includes('not implemented yet')
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

async function fetchLatestVersion(): Promise<string> {
  const response = await fetch('https://raw.githubusercontent.com/embire2/bolt.gives/main/package.json', {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch latest package.json (${response.status})`);
  }

  const remote = (await response.json()) as { version?: string };

  return remote.version || '0.0.0';
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCommand(options: {
  rootDir: string;
  command: string;
  args: string[];
  logs: UpdateLogEntry[];
  retries?: number;
}): Promise<{ stdout: string; stderr: string }> {
  const runExecFile = await ensureExecFile();
  const retryCount = Math.max(0, options.retries ?? DEFAULT_RETRY_COUNT);
  const commandString = `${options.command} ${options.args.join(' ')}`.trim();

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      const result = await runExecFile(options.command, options.args, {
        cwd: options.rootDir,
        env: {
          ...process.env,
          NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --max-old-space-size=${NODE_MEMORY_BASELINE_MB}`.trim(),
        },
        maxBuffer: 10 * 1024 * 1024,
      });

      options.logs.push({
        step: commandString,
        status: 'ok',
        command: commandString,
        stdout: result.stdout.trim(),
        stderr: result.stderr.trim(),
      });

      return result;
    } catch (error) {
      const commandError = error as CommandError;
      const exitCode =
        typeof commandError.code === 'number' ? commandError.code : Number.parseInt(String(commandError.code), 10);
      const stderr = commandError.stderr?.trim() || commandError.message || 'Unknown command error';
      const stdout = commandError.stdout?.trim() || '';

      if (attempt < retryCount) {
        options.logs.push({
          step: commandString,
          status: 'retry',
          command: commandString,
          exitCode: Number.isFinite(exitCode) ? exitCode : undefined,
          stdout,
          stderr,
          message: `Attempt ${attempt + 1} failed; retrying.`,
        });
        await wait(1500 * (attempt + 1));
        continue;
      }

      options.logs.push({
        step: commandString,
        status: 'error',
        command: commandString,
        exitCode: Number.isFinite(exitCode) ? exitCode : undefined,
        stdout,
        stderr,
      });
      throw error;
    }
  }

  throw new Error(`Failed to execute command: ${commandString}`);
}

async function getCommitHash(rootDir: string): Promise<string> {
  const logs: UpdateLogEntry[] = [];
  const result = await runCommand({
    rootDir,
    command: 'git',
    args: ['rev-parse', 'HEAD'],
    logs,
    retries: 0,
  });

  return result.stdout.trim();
}

export const loader: LoaderFunction = async () => {
  if (typeof process === 'undefined' || !process.cwd) {
    return json({ available: false, error: 'Update checks are unavailable in this runtime.' });
  }

  try {
    const rootDir = process.cwd();
    const [currentVersion, latestVersion] = await Promise.all([readCurrentVersion(rootDir), fetchLatestVersion()]);

    return json({
      available: compareVersions(latestVersion, currentVersion) > 0,
      currentVersion,
      latestVersion,
      branch: MAIN_BRANCH,
      checkedAt: new Date().toISOString(),
      nodeMemoryBaselineMb: NODE_MEMORY_BASELINE_MB,
    });
  } catch (error) {
    return json({
      available: false,
      error: toUserSafeUpdateError(error),
    });
  }
};

export const action: ActionFunction = async ({ request }) => {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  if (typeof process === 'undefined' || !process.cwd) {
    return json({ updated: false, error: 'Update execution is unavailable in this runtime.' }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as { retryCount?: number };
  const retryCount = Math.max(0, Math.min(3, Number(body.retryCount ?? DEFAULT_RETRY_COUNT)));
  const rootDir = process.cwd();
  const logs: UpdateLogEntry[] = [];
  let rollbackApplied = false;
  let fromCommit = '';
  let toCommit = '';

  try {
    fromCommit = await getCommitHash(rootDir);

    await runCommand({
      rootDir,
      command: 'git',
      args: ['fetch', 'origin', MAIN_BRANCH],
      logs,
      retries: retryCount,
    });
    await runCommand({
      rootDir,
      command: 'git',
      args: ['pull', '--ff-only', 'origin', MAIN_BRANCH],
      logs,
      retries: retryCount,
    });
    await runCommand({
      rootDir,
      command: 'pnpm',
      args: ['install', '--frozen-lockfile'],
      logs,
      retries: retryCount,
    });
    await runCommand({
      rootDir,
      command: 'pnpm',
      args: ['run', 'build'],
      logs,
      retries: retryCount,
    });

    toCommit = await getCommitHash(rootDir);

    const [currentVersion, latestVersion] = await Promise.all([readCurrentVersion(rootDir), fetchLatestVersion()]);

    return json({
      updated: true,
      fromCommit,
      toCommit,
      currentVersion,
      latestVersion,
      rollbackApplied,
      logs,
      nodeMemoryBaselineMb: NODE_MEMORY_BASELINE_MB,
    });
  } catch (error) {
    try {
      if (fromCommit) {
        await runCommand({
          rootDir,
          command: 'git',
          args: ['reset', '--hard', fromCommit],
          logs,
          retries: 0,
        });
        await runCommand({
          rootDir,
          command: 'pnpm',
          args: ['install', '--frozen-lockfile'],
          logs,
          retries: 0,
        });
        rollbackApplied = true;
        logs.push({
          step: 'rollback',
          status: 'rollback',
          message: `Rollback completed to ${fromCommit}`,
        });
      }
    } catch (rollbackError) {
      logs.push({
        step: 'rollback',
        status: 'error',
        message: rollbackError instanceof Error ? rollbackError.message : 'Rollback failed',
      });
    }

    return json(
      {
        updated: false,
        rollbackApplied,
        error: error instanceof Error ? error.message : 'Update failed',
        logs,
        nodeMemoryBaselineMb: NODE_MEMORY_BASELINE_MB,
      },
      { status: 500 },
    );
  }
};
