import type { WebContainer } from '@webcontainer/api';
import { path as nodePath } from '~/utils/path';
import { atom, map, type MapStore } from 'nanostores';
import type { ActionAlert, BoltAction, DeployAlert, FileHistory, SupabaseAction, SupabaseAlert } from '~/types/actions';
import { createScopedLogger } from '~/utils/logger';
import { unreachable } from '~/utils/unreachable';
import type { ActionCallbackData } from './message-parser';
import type { BoltShell } from '~/utils/shell';
import {
  InteractiveStepRunner,
  type InteractiveStep,
  type InteractiveStepRunnerEvent,
} from '~/lib/runtime/interactive-step-runner';
import { getCollaborationServerUrl } from '~/lib/collaboration/config';
import {
  decodeHtmlCommandDelimiters,
  makeCreateViteNonInteractive,
  makeInstallCommandsLowNoise,
  makeFileChecksPortable,
  makeInstallCommandsProjectAware,
  makeScaffoldCommandsProjectAware,
  normalizeShellCommandSurface,
  unwrapCommandJsonEnvelope,
  rewriteAllPackageManagersToPnpm,
  rewritePythonCommands,
} from './shell-command-utils';
import { normalizeArtifactFilePath, resolvePreferredArtifactFilePath } from './file-paths';
import type { FileMap } from '~/lib/stores/files';
import {
  isHostedRuntimeEnabled,
  runHostedRuntimeCommand,
  syncHostedRuntimeWorkspace,
  type HostedRuntimePreviewInfo,
} from './hosted-runtime-client';

const logger = createScopedLogger('ActionRunner');
const NOISY_PACKAGE_PROGRESS_RE =
  /(?:progress:\s+resolved|packages:\s+\+|lockfile is up to date|already up to date|resolved \d+, reused \d+)/i;
const HEAVY_COMMAND_RE = /\b(?:pnpm|npm|yarn|bun)\s+(?:install|i|run\s+build|build)\b/i;

function normalizeShellChunkForTimeline(chunk: string): string {
  return chunk
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\r/g, '\n');
}

export type ActionStatus = 'pending' | 'running' | 'complete' | 'aborted' | 'failed';

export type BaseActionState = BoltAction & {
  status: Exclude<ActionStatus, 'failed'>;
  abort: () => void;
  executed: boolean;
  abortSignal: AbortSignal;
};

export type FailedActionState = BoltAction &
  Omit<BaseActionState, 'status'> & {
    status: Extract<ActionStatus, 'failed'>;
    error: string;
  };

export type ActionState = BaseActionState | FailedActionState;

type BaseActionUpdate = Partial<Pick<BaseActionState, 'status' | 'abort' | 'executed'>>;

export type ActionStateUpdate =
  | BaseActionUpdate
  | (Omit<BaseActionUpdate, 'status'> & { status: 'failed'; error: string });

type ActionsMap = MapStore<Record<string, ActionState>>;

class ActionCommandError extends Error {
  readonly _output: string;
  readonly _header: string;

  constructor(message: string, output: string) {
    // Create a formatted message that includes both the error message and output
    const formattedMessage = `Failed To Execute Shell Command: ${message}\n\nOutput:\n${output}`;
    super(formattedMessage);

    // Set the output separately so it can be accessed programmatically
    this._header = message;
    this._output = output;

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, ActionCommandError.prototype);

    // Set the name of the error for better debugging
    this.name = 'ActionCommandError';
  }

  // Optional: Add a method to get just the terminal output
  get output() {
    return this._output;
  }
  get header() {
    return this._header;
  }
}

export class ActionRunner {
  static readonly HOSTED_FILE_FLUSH_DEBOUNCE_MS = 350;
  #webcontainer: Promise<WebContainer>;
  #currentExecutionPromise: Promise<void> = Promise.resolve();
  #shellTerminal: () => BoltShell;
  #getFilesSnapshot?: () => FileMap;
  #onPreviewReady?: (preview: HostedRuntimePreviewInfo) => void;
  #hostedRuntimeSessionId?: string;
  #hostedRuntimeFullSyncPending = true;
  #lastHostedRuntimeFileContents = new Map<string, string>();
  #pendingHostedRuntimeFiles = new Map<string, string>();
  #hostedRuntimeFlushTimer: ReturnType<typeof setTimeout> | null = null;
  #hostedRuntimeFlushPromise: Promise<void> = Promise.resolve();
  #lastHostedRuntimePreview?: HostedRuntimePreviewInfo;
  #hostedRuntimePreviewRevision = 0;
  #stepEventSocket?: WebSocket;
  runnerId = atom<string>(`${Date.now()}`);
  actions: ActionsMap = map({});
  onAlert?: (alert: ActionAlert) => void;
  onSupabaseAlert?: (alert: SupabaseAlert) => void;
  onDeployAlert?: (alert: DeployAlert) => void;
  onStepRunnerEvent?: (event: InteractiveStepRunnerEvent) => void;
  buildOutput?: { path: string; exitCode: number; output: string };

  constructor(
    webcontainerPromise: Promise<WebContainer>,
    getShellTerminal: () => BoltShell,
    getFilesSnapshot?: () => FileMap,
    onPreviewReady?: (preview: HostedRuntimePreviewInfo) => void,
    hostedRuntimeSessionId?: string,
    onAlert?: (alert: ActionAlert) => void,
    onSupabaseAlert?: (alert: SupabaseAlert) => void,
    onDeployAlert?: (alert: DeployAlert) => void,
    onStepRunnerEvent?: (event: InteractiveStepRunnerEvent) => void,
  ) {
    this.#webcontainer = webcontainerPromise;
    this.#shellTerminal = getShellTerminal;
    this.#getFilesSnapshot = getFilesSnapshot;
    this.#onPreviewReady = onPreviewReady;
    this.#hostedRuntimeSessionId = hostedRuntimeSessionId;
    this.onAlert = onAlert;
    this.onSupabaseAlert = onSupabaseAlert;
    this.onDeployAlert = onDeployAlert;
    this.onStepRunnerEvent = onStepRunnerEvent;
  }

  #getHostedRuntimeSessionId() {
    return this.#hostedRuntimeSessionId || this.runnerId.get();
  }

  async #syncHostedRuntimeSnapshot() {
    if (!isHostedRuntimeEnabled() || !this.#getFilesSnapshot) {
      return;
    }

    if (!this.#hostedRuntimeFullSyncPending) {
      return;
    }

    const files = this.#getFilesSnapshot();

    await syncHostedRuntimeWorkspace({
      sessionId: this.#getHostedRuntimeSessionId(),
      files,
      prune: false,
    });

    this.#hostedRuntimeFullSyncPending = false;
    this.#lastHostedRuntimeFileContents.clear();

    for (const [filePath, dirent] of Object.entries(files)) {
      if (dirent?.type === 'file' && !dirent.isBinary) {
        this.#lastHostedRuntimeFileContents.set(filePath, dirent.content);
      }
    }

    for (const [filePath, content] of [...this.#pendingHostedRuntimeFiles.entries()]) {
      if (this.#lastHostedRuntimeFileContents.get(filePath) === content) {
        this.#pendingHostedRuntimeFiles.delete(filePath);
      }
    }

    this.#emitHostedPreviewRefresh();
  }

  async #flushHostedRuntimePendingFiles() {
    if (!isHostedRuntimeEnabled() || this.#pendingHostedRuntimeFiles.size === 0) {
      return;
    }

    if (this.#hostedRuntimeFlushTimer) {
      clearTimeout(this.#hostedRuntimeFlushTimer);
      this.#hostedRuntimeFlushTimer = null;
    }

    const files = Object.fromEntries(
      [...this.#pendingHostedRuntimeFiles.entries()].map(([filePath, content]) => [
        filePath,
        {
          type: 'file',
          content,
          isBinary: false,
        } as FileMap[string],
      ]),
    ) satisfies FileMap;

    this.#pendingHostedRuntimeFiles.clear();

    await syncHostedRuntimeWorkspace({
      sessionId: this.#getHostedRuntimeSessionId(),
      prune: false,
      files,
    });

    this.#hostedRuntimeFullSyncPending = false;

    for (const [filePath, dirent] of Object.entries(files)) {
      if (dirent?.type === 'file' && !dirent.isBinary) {
        this.#lastHostedRuntimeFileContents.set(filePath, dirent.content);
      }
    }

    this.#emitHostedPreviewRefresh();
  }

  #setHostedPreview(preview: HostedRuntimePreviewInfo) {
    this.#hostedRuntimePreviewRevision = 0;

    this.#lastHostedRuntimePreview = {
      ...preview,
      revision: this.#hostedRuntimePreviewRevision,
    };

    this.#onPreviewReady?.(this.#lastHostedRuntimePreview);
  }

  #emitHostedPreviewRefresh() {
    if (!this.#lastHostedRuntimePreview) {
      return;
    }

    this.#hostedRuntimePreviewRevision += 1;
    this.#lastHostedRuntimePreview = {
      ...this.#lastHostedRuntimePreview,
      revision: this.#hostedRuntimePreviewRevision,
    };
    this.#onPreviewReady?.(this.#lastHostedRuntimePreview);
  }

  #scheduleHostedRuntimeFileFlush() {
    if (!isHostedRuntimeEnabled()) {
      return;
    }

    if (this.#hostedRuntimeFlushTimer) {
      clearTimeout(this.#hostedRuntimeFlushTimer);
    }

    this.#hostedRuntimeFlushTimer = setTimeout(() => {
      this.#hostedRuntimeFlushTimer = null;
      this.#hostedRuntimeFlushPromise = this.#hostedRuntimeFlushPromise
        .then(() => this.#flushHostedRuntimePendingFiles())
        .catch((error) => {
          logger.error('Failed to flush hosted runtime file batch', error);
        });
    }, ActionRunner.HOSTED_FILE_FLUSH_DEBOUNCE_MS);
  }

  async #syncHostedRuntimeFile(filePath: string, content: string) {
    if (!isHostedRuntimeEnabled()) {
      return;
    }

    const webcontainer = await this.#webcontainer;
    const normalizedFilePath = normalizeArtifactFilePath(filePath, webcontainer.workdir);

    if (
      this.#lastHostedRuntimeFileContents.get(normalizedFilePath) === content &&
      this.#pendingHostedRuntimeFiles.get(normalizedFilePath) !== content
    ) {
      this.#hostedRuntimeFullSyncPending = false;
      return;
    }

    if (this.#pendingHostedRuntimeFiles.get(normalizedFilePath) === content) {
      return;
    }

    this.#pendingHostedRuntimeFiles.set(normalizedFilePath, content);
    this.#scheduleHostedRuntimeFileFlush();
  }

  async #runHostedShellLikeCommand(options: { action: ActionState; description: string; kind: 'shell' | 'start' }) {
    const { action, description, kind } = options;
    await this.#syncHostedRuntimeSnapshot();
    await this.#hostedRuntimeFlushPromise;
    await this.#flushHostedRuntimePendingFiles();

    let finalOutput = '';
    let finalExitCode = 0;
    let stepError: string | undefined;
    const stepSocket = this.#getStepEventSocket();
    const stepRunner = new InteractiveStepRunner(
      {
        executeStep: async (_step: InteractiveStep, context) => {
          const resp = await runHostedRuntimeCommand({
            sessionId: this.#getHostedRuntimeSessionId(),
            command: action.content,
            kind,
            onEvent: (event) => {
              if (event.type === 'stdout') {
                const normalized = normalizeShellChunkForTimeline(event.chunk);

                if (normalized.trim()) {
                  context.onStdout(normalized);
                }
              } else if (event.type === 'stderr') {
                const normalized = normalizeShellChunkForTimeline(event.chunk);

                if (normalized.trim()) {
                  context.onStderr(normalized);
                }
              } else if (event.type === 'status') {
                context.onStdout(`${event.message}\n`);
              } else if (event.type === 'ready') {
                this.#setHostedPreview(event.preview);
              }
            },
          });

          finalOutput = resp.output;
          finalExitCode = resp.exitCode;

          return {
            exitCode: resp.exitCode,
            stdout: resp.output,
            stderr: resp.exitCode === 0 ? '' : resp.output,
          };
        },
      },
      stepSocket,
    );

    stepRunner.addEventListener('event', (event) => {
      const detail = (event as CustomEvent<InteractiveStepRunnerEvent>).detail;
      this.onStepRunnerEvent?.(detail);

      if (detail.type === 'error') {
        stepError = detail.error || 'Step execution failed';
      }
    });

    await stepRunner.run([
      {
        description,
        command: [action.content],
      },
    ]);

    if (stepError || finalExitCode !== 0) {
      const enhancedError = this.#createEnhancedShellError(action.content, finalExitCode, finalOutput);
      throw new ActionCommandError(enhancedError.title, stepError || enhancedError.details);
    }
  }

  addAction(data: ActionCallbackData) {
    const { actionId } = data;

    const actions = this.actions.get();
    const action = actions[actionId];

    if (action) {
      // action already added
      return;
    }

    const abortController = new AbortController();

    this.actions.setKey(actionId, {
      ...data.action,
      status: 'pending',
      executed: false,
      abort: () => {
        abortController.abort();
        this.#updateAction(actionId, { status: 'aborted' });
      },
      abortSignal: abortController.signal,
    });

    this.#currentExecutionPromise.then(() => {
      this.#updateAction(actionId, { status: 'running' });
    });
  }

  async runAction(data: ActionCallbackData, isStreaming: boolean = false) {
    const { actionId } = data;
    const action = this.actions.get()[actionId];

    if (!action) {
      unreachable(`Action ${actionId} not found`);
    }

    if (action.executed) {
      return; // No return value here
    }

    if (isStreaming && action.type !== 'file') {
      return; // No return value here
    }

    this.#updateAction(actionId, { ...action, ...data.action, executed: !isStreaming });

    this.#currentExecutionPromise = this.#currentExecutionPromise
      .then(() => {
        return this.#executeAction(actionId, isStreaming);
      })
      .catch((error) => {
        logger.error('Action execution promise failed:', error);
      });

    await this.#currentExecutionPromise;

    return;
  }

  async #executeAction(actionId: string, isStreaming: boolean = false) {
    const action = this.actions.get()[actionId];

    this.#updateAction(actionId, { status: 'running' });

    try {
      switch (action.type) {
        case 'shell': {
          await this.#runShellAction(actionId, action);
          break;
        }
        case 'file': {
          await this.#runFileAction(action, isStreaming);
          break;
        }
        case 'supabase': {
          try {
            await this.handleSupabaseAction(action as SupabaseAction);
          } catch (error: any) {
            // Update action status
            this.#updateAction(actionId, {
              status: 'failed',
              error: error instanceof Error ? error.message : 'Supabase action failed',
            });

            // Return early without re-throwing
            return;
          }
          break;
        }
        case 'build': {
          const buildOutput = await this.#runBuildAction(action);

          // Store build output for deployment
          this.buildOutput = buildOutput;
          break;
        }
        case 'start': {
          if (isHostedRuntimeEnabled()) {
            await this.#runStartAction(actionId, action);
            break;
          }

          // making the local start app non blocking
          this.#runStartAction(actionId, action)
            .then(() => this.#updateAction(actionId, { status: 'complete' }))
            .catch((err: Error) => {
              if (action.abortSignal.aborted) {
                return;
              }

              this.#updateAction(actionId, { status: 'failed', error: 'Action failed' });
              logger.error(`[${action.type}]:Action failed\n\n`, err);

              if (!(err instanceof ActionCommandError)) {
                return;
              }

              this.onAlert?.({
                type: 'error',
                title: 'Dev Server Failed',
                description: err.header,
                content: err.output,
                source: 'terminal',
              });
            });

          /*
           * adding a delay to avoid any race condition between 2 start actions
           * i am up for a better approach
           */
          await new Promise((resolve) => setTimeout(resolve, 2000));

          return;
        }
      }

      this.#updateAction(actionId, {
        status: isStreaming ? 'running' : action.abortSignal.aborted ? 'aborted' : 'complete',
      });
    } catch (error) {
      if (action.abortSignal.aborted) {
        return;
      }

      this.#updateAction(actionId, { status: 'failed', error: 'Action failed' });
      logger.error(`[${action.type}]:Action failed\n\n`, error);

      if (!(error instanceof ActionCommandError)) {
        return;
      }

      this.onAlert?.({
        type: 'error',
        title: 'Dev Server Failed',
        description: error.header,
        content: error.output,
        source: 'terminal',
      });

      // re-throw the error to be caught in the promise chain
      throw error;
    }
  }

  async #runShellAction(actionId: string, action: ActionState) {
    if (action.type !== 'shell') {
      unreachable('Expected shell action');
    }

    if (isHostedRuntimeEnabled()) {
      const validationResult = await this.#validateShellCommand(action.content);

      if (validationResult.shouldModify && validationResult.modifiedCommand) {
        action.content = validationResult.modifiedCommand;
        this.#updateAction(actionId, { ...action } as any);
      }

      await this.#runHostedShellLikeCommand({
        action,
        description: `Run shell command: ${action.content}`,
        kind: 'shell',
      });

      return;
    }

    const shell = this.#shellTerminal();
    await shell.ready();

    if (!shell || !shell.terminal || !shell.process) {
      unreachable('Shell terminal not found');
    }

    // Pre-validate command for common issues
    const validationResult = await this.#validateShellCommand(action.content);

    if (validationResult.shouldModify && validationResult.modifiedCommand) {
      logger.debug(`Modified command: ${action.content} -> ${validationResult.modifiedCommand}`);
      action.content = validationResult.modifiedCommand;

      // Persist the modified command so the UI and logs reflect what actually executed.
      this.#updateAction(actionId, { ...action } as any);
    }

    let finalOutput = '';
    let finalExitCode = 0;
    let stepError: string | undefined;
    const heavyCommand = HEAVY_COMMAND_RE.test(action.content);
    const streamState = { lastProgressEmitAt: 0 };

    const stepSocket = this.#getStepEventSocket();
    const stepRunner = new InteractiveStepRunner(
      {
        executeStep: async (_step: InteractiveStep, context) => {
          const resp = await shell.executeCommand(
            this.runnerId.get(),
            action.content,
            () => {
              logger.debug(`[${action.type}]:Aborting Action\n\n`, action);
              action.abort();
            },
            (chunk) => {
              const normalized = normalizeShellChunkForTimeline(chunk);

              if (!normalized.trim()) {
                return;
              }

              if (heavyCommand && NOISY_PACKAGE_PROGRESS_RE.test(normalized)) {
                const now = Date.now();

                if (now - streamState.lastProgressEmitAt < 2500) {
                  return;
                }

                streamState.lastProgressEmitAt = now;
                context.onStdout('[install progress]');

                return;
              }

              context.onStdout(normalized);
            },
          );
          const output = resp?.output || '';
          const exitCode = resp?.exitCode ?? 1;

          finalOutput = output;
          finalExitCode = exitCode;

          return {
            exitCode,
            stdout: output,
            stderr: exitCode === 0 ? '' : output,
          };
        },
      },
      stepSocket,
    );

    stepRunner.addEventListener('event', (event) => {
      const detail = (event as CustomEvent<InteractiveStepRunnerEvent>).detail;
      this.onStepRunnerEvent?.(detail);

      if (detail.type === 'error') {
        stepError = detail.error || 'Step execution failed';
      }
    });

    await stepRunner.run([
      {
        description: `Run shell command: ${action.content}`,
        command: [action.content],
      },
    ]);

    logger.debug(`${action.type} Shell Response: [exit code:${finalExitCode}]`);

    if (stepError || finalExitCode !== 0) {
      const enhancedError = this.#createEnhancedShellError(action.content, finalExitCode, finalOutput);
      throw new ActionCommandError(enhancedError.title, stepError || enhancedError.details);
    }
  }

  async #runStartAction(actionId: string, action: ActionState) {
    if (action.type !== 'start') {
      unreachable('Expected shell action');
    }

    if (isHostedRuntimeEnabled()) {
      const validationResult = await this.#validateShellCommand(action.content);

      if (validationResult.shouldModify && validationResult.modifiedCommand) {
        logger.debug(`Modified start command: ${action.content} -> ${validationResult.modifiedCommand}`);
        action.content = validationResult.modifiedCommand;
        this.#updateAction(actionId, { ...action } as any);
      }

      await this.#runHostedShellLikeCommand({
        action,
        description: `Start application: ${action.content}`,
        kind: 'start',
      });

      return;
    }

    if (!this.#shellTerminal) {
      unreachable('Shell terminal not found');
    }

    const shell = this.#shellTerminal();
    await shell.ready();

    if (!shell || !shell.terminal || !shell.process) {
      unreachable('Shell terminal not found');
    }

    const validationResult = await this.#validateShellCommand(action.content);

    if (validationResult.shouldModify && validationResult.modifiedCommand) {
      logger.debug(`Modified start command: ${action.content} -> ${validationResult.modifiedCommand}`);
      action.content = validationResult.modifiedCommand;
      this.#updateAction(actionId, { ...action } as any);
    }

    let finalOutput = '';
    let finalExitCode = 0;
    let stepError: string | undefined;
    const stepSocket = this.#getStepEventSocket();
    const stepRunner = new InteractiveStepRunner(
      {
        executeStep: async (_step: InteractiveStep, context) => {
          const resp = await shell.executeCommand(
            this.runnerId.get(),
            action.content,
            () => {
              logger.debug(`[${action.type}]:Aborting Action\n\n`, action);
              action.abort();
            },
            (chunk) => {
              const normalized = normalizeShellChunkForTimeline(chunk);

              if (!normalized.trim()) {
                return;
              }

              context.onStdout(normalized);
            },
          );
          const output = resp?.output || '';
          const exitCode = resp?.exitCode ?? 1;

          finalOutput = output;
          finalExitCode = exitCode;

          return {
            exitCode,
            stdout: output,
            stderr: exitCode === 0 ? '' : output,
          };
        },
      },
      stepSocket,
    );

    stepRunner.addEventListener('event', (event) => {
      const detail = (event as CustomEvent<InteractiveStepRunnerEvent>).detail;
      this.onStepRunnerEvent?.(detail);

      if (detail.type === 'error') {
        stepError = detail.error || 'Step execution failed';
      }
    });

    await stepRunner.run([
      {
        description: `Start application: ${action.content}`,
        command: [action.content],
      },
    ]);

    logger.debug(`${action.type} Shell Response: [exit code:${finalExitCode}]`);

    if (stepError || finalExitCode !== 0) {
      const enhancedError = this.#createEnhancedShellError(action.content, finalExitCode, finalOutput);
      throw new ActionCommandError(enhancedError.title, stepError || enhancedError.details);
    }
  }

  #getStepEventSocket() {
    if (typeof window === 'undefined') {
      return undefined;
    }

    if (
      this.#stepEventSocket &&
      (this.#stepEventSocket.readyState === WebSocket.OPEN || this.#stepEventSocket.readyState === WebSocket.CONNECTING)
    ) {
      return this.#stepEventSocket;
    }

    try {
      const base = getCollaborationServerUrl();
      const socket = new WebSocket(`${base.replace(/\/$/, '')}/events`);
      this.#stepEventSocket = socket;

      return socket;
    } catch (error) {
      logger.warn('Unable to create step event socket', error);
      return undefined;
    }
  }

  async #runFileAction(action: ActionState, isStreaming: boolean = false) {
    if (action.type !== 'file') {
      unreachable('Expected file action');
    }

    const webcontainer = await this.#webcontainer;
    const normalizedFilePath = resolvePreferredArtifactFilePath(
      action.filePath,
      this.#getFilesSnapshot?.(),
      webcontainer.workdir,
    );
    const relativePath = nodePath.relative(webcontainer.workdir, normalizedFilePath);
    const existingFile = this.#getFilesSnapshot?.()[normalizedFilePath];
    const hostedRuntimeEnabled = isHostedRuntimeEnabled();

    if (
      existingFile?.type === 'file' &&
      !existingFile.isBinary &&
      existingFile.content === action.content &&
      (!hostedRuntimeEnabled || this.#lastHostedRuntimeFileContents.get(normalizedFilePath) === action.content)
    ) {
      this.#lastHostedRuntimeFileContents.set(normalizedFilePath, action.content);
      return;
    }

    let folder = nodePath.dirname(relativePath);

    // remove trailing slashes
    folder = folder.replace(/\/+$/g, '');

    if (folder !== '.') {
      try {
        await webcontainer.fs.mkdir(folder, { recursive: true });
        logger.debug('Created folder', folder);
      } catch (error) {
        logger.error('Failed to create folder\n\n', error);
      }
    }

    try {
      await webcontainer.fs.writeFile(relativePath, action.content);
      logger.debug(`File written ${relativePath}`);

      await this.#syncHostedRuntimeFile(normalizedFilePath, action.content);

      if (!isStreaming) {
        await this.#hostedRuntimeFlushPromise;
      }
    } catch (error) {
      logger.error('Failed to write file\n\n', error);
    }
  }

  #updateAction(id: string, newState: ActionStateUpdate) {
    const actions = this.actions.get();

    this.actions.setKey(id, { ...actions[id], ...newState });
  }

  async getFileHistory(filePath: string): Promise<FileHistory | null> {
    try {
      const webcontainer = await this.#webcontainer;
      const historyPath = this.#getHistoryPath(filePath);
      const content = await webcontainer.fs.readFile(historyPath, 'utf-8');

      return JSON.parse(content);
    } catch (error) {
      logger.error('Failed to get file history:', error);
      return null;
    }
  }

  async saveFileHistory(filePath: string, history: FileHistory) {
    // const webcontainer = await this.#webcontainer;
    const historyPath = this.#getHistoryPath(filePath);

    await this.#runFileAction({
      type: 'file',
      filePath: historyPath,
      content: JSON.stringify(history),
      changeSource: 'auto-save',
    } as any);
  }

  #getHistoryPath(filePath: string) {
    return nodePath.join('.history', filePath);
  }

  async #runBuildAction(action: ActionState) {
    if (action.type !== 'build') {
      unreachable('Expected build action');
    }

    // Trigger build started alert
    this.onDeployAlert?.({
      type: 'info',
      title: 'Building Application',
      description: 'Building your application...',
      stage: 'building',
      buildStatus: 'running',
      deployStatus: 'pending',
      source: 'netlify',
    });

    const webcontainer = await this.#webcontainer;

    // Create a new terminal specifically for the build
    const buildProcess = await webcontainer.spawn('pnpm', ['run', 'build']);

    let output = '';
    const outputPromise = buildProcess.output.pipeTo(
      new WritableStream({
        write(data) {
          output += data;
        },
      }),
    );

    const exitCode = await buildProcess.exit;
    await outputPromise.catch(() => {
      // Ignore output piping errors; we still have whatever was captured
    });

    let buildDir = '';

    if (exitCode !== 0) {
      const buildResult = {
        path: buildDir,
        exitCode,
        output,
      };

      this.buildOutput = buildResult;

      // Trigger build failed alert
      this.onDeployAlert?.({
        type: 'error',
        title: 'Build Failed',
        description: 'Your application build failed',
        content: output || 'No build output available',
        stage: 'building',
        buildStatus: 'failed',
        deployStatus: 'pending',
        source: 'netlify',
      });

      throw new ActionCommandError('Build Failed', output || 'No Output Available');
    }

    // Trigger build success alert
    this.onDeployAlert?.({
      type: 'success',
      title: 'Build Completed',
      description: 'Your application was built successfully',
      stage: 'deploying',
      buildStatus: 'complete',
      deployStatus: 'running',
      source: 'netlify',
    });

    // Check for common build directories
    const commonBuildDirs = ['dist', 'build', 'out', 'output', '.next', 'public'];

    // Try to find the first existing build directory
    for (const dir of commonBuildDirs) {
      const dirPath = nodePath.join(webcontainer.workdir, dir);

      try {
        await webcontainer.fs.readdir(dirPath);
        buildDir = dirPath;
        break;
      } catch {
        continue;
      }
    }

    // If no build directory was found, use the default (dist)
    if (!buildDir) {
      buildDir = nodePath.join(webcontainer.workdir, 'dist');
    }

    const buildResult = {
      path: buildDir,
      exitCode,
      output,
    };

    this.buildOutput = buildResult;

    return buildResult;
  }
  async handleSupabaseAction(action: SupabaseAction) {
    const { operation, content, filePath } = action;
    logger.debug('[Supabase Action]:', { operation, filePath, content });

    switch (operation) {
      case 'migration':
        if (!filePath) {
          throw new Error('Migration requires a filePath');
        }

        // Show alert for migration action
        this.onSupabaseAlert?.({
          type: 'info',
          title: 'Supabase Migration',
          description: `Create migration file: ${filePath}`,
          content,
          source: 'supabase',
        });

        // Only create the migration file
        await this.#runFileAction({
          type: 'file',
          filePath,
          content,
          changeSource: 'supabase',
        } as any);
        return { success: true };

      case 'query': {
        // Always show the alert and let the SupabaseAlert component handle connection state
        this.onSupabaseAlert?.({
          type: 'info',
          title: 'Supabase Query',
          description: 'Execute database query',
          content,
          source: 'supabase',
        });

        // The actual execution will be triggered from SupabaseChatAlert
        return { pending: true };
      }

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  // Add this method declaration to the class
  handleDeployAction(
    stage: 'building' | 'deploying' | 'complete',
    status: ActionStatus,
    details?: {
      url?: string;
      error?: string;
      source?: 'netlify' | 'vercel' | 'github' | 'gitlab';
    },
  ): void {
    if (!this.onDeployAlert) {
      logger.debug('No deploy alert handler registered');
      return;
    }

    const alertType = status === 'failed' ? 'error' : status === 'complete' ? 'success' : 'info';

    const title =
      stage === 'building'
        ? 'Building Application'
        : stage === 'deploying'
          ? 'Deploying Application'
          : 'Deployment Complete';

    const description =
      status === 'failed'
        ? `${stage === 'building' ? 'Build' : 'Deployment'} failed`
        : status === 'running'
          ? `${stage === 'building' ? 'Building' : 'Deploying'} your application...`
          : status === 'complete'
            ? `${stage === 'building' ? 'Build' : 'Deployment'} completed successfully`
            : `Preparing to ${stage === 'building' ? 'build' : 'deploy'} your application`;

    const buildStatus =
      stage === 'building' ? status : stage === 'deploying' || stage === 'complete' ? 'complete' : 'pending';

    const deployStatus = stage === 'building' ? 'pending' : status;

    this.onDeployAlert({
      type: alertType,
      title,
      description,
      content: details?.error || '',
      url: details?.url,
      stage,
      buildStatus: buildStatus as any,
      deployStatus: deployStatus as any,
      source: details?.source || 'netlify',
    });
  }

  async #validateShellCommand(command: string): Promise<{
    shouldModify: boolean;
    modifiedCommand?: string;
    warning?: string;
  }> {
    let trimmedCommand = command.trim();
    let hasCommandRewrite = false;
    const rewriteWarnings: string[] = [];

    const applyRewrite = (result: { shouldModify: boolean; modifiedCommand?: string; warning?: string }) => {
      if (!result.shouldModify || !result.modifiedCommand || result.modifiedCommand === trimmedCommand) {
        return;
      }

      trimmedCommand = result.modifiedCommand;
      hasCommandRewrite = true;

      if (result.warning) {
        rewriteWarnings.push(result.warning);
      }
    };

    applyRewrite(unwrapCommandJsonEnvelope(trimmedCommand));
    applyRewrite(normalizeShellCommandSurface(trimmedCommand));
    applyRewrite(decodeHtmlCommandDelimiters(trimmedCommand));
    applyRewrite(makeCreateViteNonInteractive(trimmedCommand));
    applyRewrite(makeInstallCommandsProjectAware(trimmedCommand));
    applyRewrite(
      makeScaffoldCommandsProjectAware(trimmedCommand, {
        projectInitialized: await this.#isProjectInitialized(),
      }),
    );
    applyRewrite(makeInstallCommandsLowNoise(trimmedCommand));
    applyRewrite(makeFileChecksPortable(trimmedCommand));
    applyRewrite(rewriteAllPackageManagersToPnpm(trimmedCommand));
    applyRewrite(rewritePythonCommands(trimmedCommand));

    if (hasCommandRewrite) {
      return {
        shouldModify: true,
        modifiedCommand: trimmedCommand,
        warning: rewriteWarnings.length ? rewriteWarnings.join(' ') : undefined,
      };
    }

    // Handle rm commands that might fail due to missing files
    if (trimmedCommand.startsWith('rm ') && !trimmedCommand.includes(' -f')) {
      const rmMatch = trimmedCommand.match(/^rm\s+(.+)$/);

      if (rmMatch) {
        const filePaths = rmMatch[1].split(/\s+/);

        // Check if any of the files exist using WebContainer
        try {
          const webcontainer = await this.#webcontainer;
          const existingFiles = [];

          for (const filePath of filePaths) {
            if (filePath.startsWith('-')) {
              continue;
            } // Skip flags

            try {
              await webcontainer.fs.readFile(filePath);
              existingFiles.push(filePath);
            } catch {
              // File doesn't exist, skip it
            }
          }

          if (existingFiles.length === 0) {
            // No files exist, modify command to use -f flag to avoid error
            return {
              shouldModify: true,
              modifiedCommand: `rm -f ${filePaths.join(' ')}`,
              warning: 'Added -f flag to rm command as target files do not exist',
            };
          } else if (existingFiles.length < filePaths.length) {
            // Some files don't exist, modify to only remove existing ones with -f for safety
            return {
              shouldModify: true,
              modifiedCommand: `rm -f ${filePaths.join(' ')}`,
              warning: 'Added -f flag to rm command as some target files do not exist',
            };
          }
        } catch (error) {
          logger.debug('Could not validate rm command files:', error);
        }
      }
    }

    // Handle cd commands to non-existent directories
    if (trimmedCommand.startsWith('cd ')) {
      const cdMatch = trimmedCommand.match(/^cd\s+(.+)$/);

      if (cdMatch) {
        const targetDir = cdMatch[1].trim();

        try {
          const webcontainer = await this.#webcontainer;
          await webcontainer.fs.readdir(targetDir);
        } catch {
          return {
            shouldModify: true,
            modifiedCommand: `mkdir -p ${targetDir} && cd ${targetDir}`,
            warning: 'Directory does not exist, created it first',
          };
        }
      }
    }

    // Handle cp/mv commands with missing source files
    if (trimmedCommand.match(/^(cp|mv)\s+/)) {
      const parts = trimmedCommand.split(/\s+/);

      if (parts.length >= 3) {
        const sourceFile = parts[1];

        try {
          const webcontainer = await this.#webcontainer;
          await webcontainer.fs.readFile(sourceFile);
        } catch {
          return {
            shouldModify: false,
            warning: `Source file '${sourceFile}' does not exist`,
          };
        }
      }
    }

    return { shouldModify: false };
  }

  async #isProjectInitialized(): Promise<boolean> {
    try {
      const webcontainer = await this.#webcontainer;
      await webcontainer.fs.readFile('package.json', 'utf-8');

      return true;
    } catch {
      return false;
    }
  }

  #createEnhancedShellError(
    command: string,
    exitCode: number | undefined,
    output: string | undefined,
  ): {
    title: string;
    details: string;
  } {
    const trimmedCommand = command.trim();
    const firstWord = trimmedCommand.split(/\s+/)[0];

    // Common error patterns and their explanations
    const errorPatterns = [
      {
        pattern: /ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND/,
        title: 'Missing package.json',
        getMessage: () =>
          `No package.json was found in the current directory.\n\nSuggestion: Scaffold a project first. For a React app:\n- pnpm dlx create-vite@latest . --template react --no-interactive\n- pnpm install`,
      },
      {
        pattern: /Could not read package\.json|ENOENT: no such file or directory, open '.*package\.json'/,
        title: 'Missing package.json',
        getMessage: () =>
          `The command expected a package.json but it does not exist.\n\nSuggestion: Ensure scaffolding completed successfully. If you used create-vite, re-run with --no-interactive to avoid cancellations.`,
      },
      {
        pattern: /Operation cancelled|Operation canceled|cancelled/i,
        title: 'Operation Cancelled',
        getMessage: () =>
          `The command was cancelled (often due to an interactive prompt).\n\nSuggestion: Re-run in non-interactive mode (e.g., add --no-interactive) or set CI=1.`,
      },
      {
        pattern: /cannot remove.*No such file or directory/,
        title: 'File Not Found',
        getMessage: () => {
          const fileMatch = output?.match(/'([^']+)'/);
          const fileName = fileMatch ? fileMatch[1] : 'file';

          return `The file '${fileName}' does not exist and cannot be removed.\n\nSuggestion: Use 'ls' to check what files exist, or use 'rm -f' to ignore missing files.`;
        },
      },
      {
        pattern: /No such file or directory/,
        title: 'File or Directory Not Found',
        getMessage: () => {
          if (trimmedCommand.startsWith('cd ')) {
            const dirMatch = trimmedCommand.match(/cd\s+(.+)/);
            const dirName = dirMatch ? dirMatch[1] : 'directory';

            return `The directory '${dirName}' does not exist.\n\nSuggestion: Use 'mkdir -p ${dirName}' to create it first, or check available directories with 'ls'.`;
          }

          return `The specified file or directory does not exist.\n\nSuggestion: Check the path and use 'ls' to see available files.`;
        },
      },
      {
        pattern: /ERR_PNPM_NO_SCRIPT|Command\s+["'][^"']+["']\s+not found/i,
        title: 'Missing npm script',
        getMessage: () =>
          `The requested npm/pnpm script is not defined in package.json.\n\nSuggestion: Check package.json scripts and run the correct command (for Vite usually "pnpm run dev").`,
      },
      {
        pattern: /Permission denied/,
        title: 'Permission Denied',
        getMessage: () =>
          `Permission denied for '${firstWord}'.\n\nSuggestion: The file may not be executable. Try 'chmod +x filename' first.`,
      },
      {
        pattern: /(?:^|\n)(?:jsh|bash|sh|zsh):[^\n]*command not found\b/i,
        title: 'Command Not Found',
        getMessage: () =>
          `The command '${firstWord}' is not available in WebContainer.\n\nSuggestion: Check available commands or use a package manager to install it.`,
      },
      {
        pattern: /Is a directory/,
        title: 'Target is a Directory',
        getMessage: () =>
          `Cannot perform this operation - target is a directory.\n\nSuggestion: Use 'ls' to list directory contents or add appropriate flags.`,
      },
      {
        pattern: /File exists/,
        title: 'File Already Exists',
        getMessage: () => `File already exists.\n\nSuggestion: Use a different name or add '-f' flag to overwrite.`,
      },
    ];

    // Try to match known error patterns
    for (const errorPattern of errorPatterns) {
      if (output && errorPattern.pattern.test(output)) {
        return {
          title: errorPattern.title,
          details: errorPattern.getMessage(),
        };
      }
    }

    // Generic error with suggestions based on command type
    let suggestion = '';

    if (trimmedCommand.startsWith('npm ')) {
      suggestion = '\n\nSuggestion: Try running "npm install" first or check package.json.';
    } else if (trimmedCommand.startsWith('git ')) {
      suggestion = "\n\nSuggestion: Check if you're in a git repository or if remote is configured.";
    } else if (trimmedCommand.match(/^(ls|cat|rm|cp|mv)/)) {
      suggestion = '\n\nSuggestion: Check file paths and use "ls" to see available files.';
    }

    return {
      title: `Command Failed (exit code: ${exitCode})`,
      details: `Command: ${trimmedCommand}\n\nOutput: ${output || 'No output available'}${suggestion}`,
    };
  }
}
