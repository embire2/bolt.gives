import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('E2BRunner');

const E2B_API_URL = 'https://api.e2b.dev/v1';

export function isE2BSandboxEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return localStorage.getItem('bolt_e2b_enabled') === 'true' && !!localStorage.getItem('bolt_e2b_api_key');
}

function getApiKey(): string {
  const key = localStorage.getItem('bolt_e2b_api_key');

  if (!key) {
    throw new Error('E2B API key not found. Please add it in Settings → Cloud Environments.');
  }

  return key;
}

export interface E2BSandboxSession {
  sandboxId: string;
  clientId: string;
}

let activeSandbox: E2BSandboxSession | null = null;

/**
 * Creates a new E2B Sandbox session.
 * Uses the E2B REST API to create a Debian-based sandbox.
 */
export async function createE2BSandbox(): Promise<E2BSandboxSession> {
  const apiKey = getApiKey();

  logger.info('Creating new E2B Sandbox...');

  const response = await fetch(`${E2B_API_URL}/sandboxes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-E2B-API-Key': apiKey,
    },
    body: JSON.stringify({
      templateID: 'base', // Default Debian template
      timeout: 300, // 5 minute timeout
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`E2B API error creating sandbox (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as { sandboxID: string; clientID: string };

  activeSandbox = {
    sandboxId: data.sandboxID,
    clientId: data.clientID,
  };

  logger.info(`E2B Sandbox created: ${activeSandbox.sandboxId}`);

  return activeSandbox;
}

/**
 * Executes a shell command inside the E2B Sandbox.
 */
export async function runE2BSandboxCommand(options: {
  command: string;
  onEvent?: (event: { type: 'stdout' | 'stderr' | 'status'; chunk?: string; message?: string }) => void;
}): Promise<{ output: string; exitCode: number }> {
  const apiKey = getApiKey();

  // Ensure we have a sandbox to run in
  if (!activeSandbox) {
    options.onEvent?.({ type: 'status', message: 'Starting E2B Sandbox...' });
    await createE2BSandbox();
  }

  if (!activeSandbox) {
    throw new Error('Failed to create E2B Sandbox.');
  }

  logger.info(`[E2B] Executing: ${options.command}`);
  options.onEvent?.({ type: 'status', message: `Running in E2B: ${options.command}` });

  try {
    const response = await fetch(`${E2B_API_URL}/sandboxes/${activeSandbox.sandboxId}/commands`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-E2B-API-Key': apiKey,
      },
      body: JSON.stringify({
        cmd: options.command,
        timeout: 120, // 2 minute command timeout
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`E2B command error (${response.status}): ${errorText}`);
    }

    const result = (await response.json()) as {
      stdout: string;
      stderr: string;
      exitCode: number;
    };

    const output = result.stdout + (result.stderr ? `\nSTDERR:\n${result.stderr}` : '');

    if (result.stdout) {
      options.onEvent?.({ type: 'stdout', chunk: result.stdout });
    }

    if (result.stderr) {
      options.onEvent?.({ type: 'stderr', chunk: result.stderr });
    }

    return {
      output,
      exitCode: result.exitCode,
    };
  } catch (error) {
    logger.error('E2B Sandbox execution failed', error);

    const errMsg = error instanceof Error ? error.message : String(error);
    options.onEvent?.({ type: 'stderr', chunk: errMsg });

    return {
      output: errMsg,
      exitCode: 1,
    };
  }
}

/**
 * Write a file to the E2B Sandbox filesystem.
 */
export async function writeFileToE2B(filePath: string, content: string): Promise<void> {
  const apiKey = getApiKey();

  if (!activeSandbox) {
    await createE2BSandbox();
  }

  if (!activeSandbox) {
    throw new Error('No active E2B Sandbox.');
  }

  await fetch(`${E2B_API_URL}/sandboxes/${activeSandbox.sandboxId}/filesystem`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-E2B-API-Key': apiKey,
    },
    body: JSON.stringify({
      path: filePath,
      content,
    }),
  });
}

/**
 * Destroy the active E2B Sandbox session.
 */
export async function destroyE2BSandbox(): Promise<void> {
  if (!activeSandbox) {
    return;
  }

  const apiKey = getApiKey();

  try {
    await fetch(`${E2B_API_URL}/sandboxes/${activeSandbox.sandboxId}`, {
      method: 'DELETE',
      headers: {
        'X-E2B-API-Key': apiKey,
      },
    });
    logger.info(`E2B Sandbox destroyed: ${activeSandbox.sandboxId}`);
  } catch (error) {
    logger.warn('Failed to destroy E2B Sandbox:', error);
  }

  activeSandbox = null;
}
