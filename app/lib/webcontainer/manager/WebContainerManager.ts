import type { WebContainer } from '@webcontainer/api';
import type { FileMap } from '~/lib/stores/files';
import { WORK_DIR_NAME } from '~/utils/constants';
import { cleanStackTrace } from '~/utils/stacktrace';
import { createScopedLogger } from '~/utils/logger';
import { createHostedWebContainerStub } from '../hosted-stub';
import { createBoltContainer } from '../bolt-container';
import { getSelectedRuntime, type RuntimeType } from '../runtime';
import { recoveryManager } from './recovery';

const logger = createScopedLogger('WebContainerManager');

const HEARTBEAT_FILE_PATH = '.bolt-runtime/fs-heartbeat';
const HEARTBEAT_INTERVAL_MS = 5_000;
const HEARTBEAT_TIMEOUT_MS = 2_800;
const HEARTBEAT_FAILURE_LIMIT = 2;
const MEMORY_GUARD_INTERVAL_MS = 7_500;
const MEMORY_GUARD_WARN_THRESHOLD = 0.9;
const MEMORY_GUARD_COOLDOWN_MS = 20_000;

type WritePriority = 'logic' | 'asset';

type QueuedWrite<T> = {
  priority: WritePriority;
  task: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

class StrictWriteQueue {
  #logicQueue: Array<QueuedWrite<unknown>> = [];
  #assetQueue: Array<QueuedWrite<unknown>> = [];
  #running = false;

  enqueue<T>(priority: WritePriority, task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const entry: QueuedWrite<T> = {
        priority,
        task,
        resolve,
        reject,
      };

      if (priority === 'logic') {
        this.#logicQueue.push(entry as QueuedWrite<unknown>);
      } else {
        this.#assetQueue.push(entry as QueuedWrite<unknown>);
      }

      this.#drain();
    });
  }

  get length() {
    return this.#logicQueue.length + this.#assetQueue.length;
  }

  async #drain() {
    if (this.#running) {
      return;
    }

    this.#running = true;

    while (this.#logicQueue.length || this.#assetQueue.length) {
      const next = this.#logicQueue.shift() ?? this.#assetQueue.shift();

      if (!next) {
        continue;
      }

      try {
        const result = await next.task();
        next.resolve(result);
      } catch (error) {
        next.reject(error);
      }
    }

    this.#running = false;
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

export interface WebContainerContext {
  loaded: boolean;
  recovering?: boolean;
  heartbeatHealthy?: boolean;
  lastBootedAt?: number | null;
  writeQueueDepth?: number;
}

export class WebContainerManager {
  #bootPromise: Promise<WebContainer> | null = null;
  #instance: WebContainer | null = null;
  #activeRuntime: RuntimeType | null = null;
  #heartbeatHandle: ReturnType<typeof setInterval> | null = null;
  #memoryGuardHandle: ReturnType<typeof setInterval> | null = null;
  #heartbeatFailures = 0;
  #isRecovering = false;
  #memoryWarningCooldownUntil = 0;
  #writeQueue = new StrictWriteQueue();

  constructor(private readonly _context: WebContainerContext) {
    this._context.loaded = false;
    this._context.heartbeatHealthy ??= true;
    this._context.recovering ??= false;
    this._context.lastBootedAt ??= null;
    this._context.writeQueueDepth ??= 0;
  }

  get context() {
    return this._context;
  }

  boot() {
    if (import.meta.env.SSR) {
      return new Promise<WebContainer>(() => {
        // no-op for ssr
      });
    }

    if (this.#bootPromise) {
      return this.#bootPromise;
    }

    this.#bootPromise = this.#createRuntimeInstance()
      .then(async (webcontainer) => {
        await this.#attachRuntime(webcontainer);
        return webcontainer;
      })
      .catch((error) => {
        this.#bootPromise = null;
        throw error;
      });

    return this.#bootPromise;
  }

  queueWrite<T>(priority: WritePriority, task: () => Promise<T>) {
    this._context.writeQueueDepth = this.#writeQueue.length + 1;

    return this.#writeQueue.enqueue(priority, task).finally(() => {
      this._context.writeQueueDepth = this.#writeQueue.length;
    });
  }

  async forceReboot(reason: string) {
    if (this.#isRecovering) {
      return this.#bootPromise ?? this.boot();
    }

    logger.warn('Initiating WebContainer auto-resurrection', { reason, runtime: this.#activeRuntime });

    this.#isRecovering = true;
    this._context.recovering = true;
    this._context.loaded = false;
    this._context.heartbeatHealthy = false;

    const snapshot = await this.#captureWorkspaceSnapshot();

    try {
      this.#stopHealthMonitors();

      const currentContainer = this.#instance as (WebContainer & { teardown?: () => Promise<void> | void }) | null;

      if (currentContainer?.teardown) {
        await currentContainer.teardown();
      }

      this.#instance = null;
      this.#bootPromise = null;

      const rebootedContainer = await this.boot();
      await this.#restoreWorkspaceSnapshot(snapshot);

      return rebootedContainer;
    } finally {
      this.#isRecovering = false;
      this._context.recovering = false;
      this._context.heartbeatHealthy = true;
    }
  }

  async #createRuntimeInstance(): Promise<WebContainer> {
    const runtime = getSelectedRuntime();
    this.#activeRuntime = runtime;

    if (runtime === 'hosted') {
      return createHostedWebContainerStub();
    }

    if (runtime === 'bolt-container') {
      logger.info('[BoltContainer] Booting custom BoltContainer runtime');
      return createBoltContainer();
    }

    const { WebContainer: webContainerApi } = await import('@webcontainer/api');

    return webContainerApi.boot({
      coep: 'credentialless',
      workdirName: WORK_DIR_NAME,
      forwardPreviewErrors: true,
    });
  }

  async #attachRuntime(webcontainer: WebContainer) {
    this.#instance = webcontainer;
    this._context.loaded = this.#activeRuntime !== 'hosted';
    this._context.lastBootedAt = Date.now();

    if (this.#activeRuntime === 'webcontainer') {
      try {
        const response = await fetch('/inspector-script.js');
        const inspectorScript = await response.text();
        await webcontainer.setPreviewScript(inspectorScript);
      } catch {
        // inspector script is optional
      }
    }

    recoveryManager.attach(webcontainer);
    this.#attachPreviewMessageListener(webcontainer);
    this.#startHealthMonitors();
  }

  #attachPreviewMessageListener(webcontainer: WebContainer) {
    webcontainer.on('preview-message', async (message) => {
      if (message.type !== 'PREVIEW_UNCAUGHT_EXCEPTION' && message.type !== 'PREVIEW_UNHANDLED_REJECTION') {
        return;
      }

      const isPromise = message.type === 'PREVIEW_UNHANDLED_REJECTION';
      const title = isPromise ? 'Unhandled Promise Rejection' : 'Uncaught Exception';

      try {
        const { workbenchStore } = await import('~/lib/stores/workbench');
        workbenchStore.actionAlert.set({
          type: 'preview',
          title,
          description: 'message' in message ? message.message : 'Unknown error',
          content: `Error occurred at ${message.pathname}${message.search}${message.hash}\nPort: ${message.port}\n\nStack trace:\n${cleanStackTrace(message.stack || '')}`,
          source: 'preview',
        });
      } catch (error) {
        logger.warn('Unable to push preview alert into store', error);
      }
    });
  }

  #startHealthMonitors() {
    this.#stopHealthMonitors();

    if (this.#activeRuntime === 'hosted') {
      return;
    }

    this.#heartbeatHandle = setInterval(() => {
      void this.#runFsHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);

    this.#memoryGuardHandle = setInterval(() => {
      this.#runMemoryGuard();
    }, MEMORY_GUARD_INTERVAL_MS);
  }

  #stopHealthMonitors() {
    if (this.#heartbeatHandle) {
      clearInterval(this.#heartbeatHandle);
      this.#heartbeatHandle = null;
    }

    if (this.#memoryGuardHandle) {
      clearInterval(this.#memoryGuardHandle);
      this.#memoryGuardHandle = null;
    }
  }

  async #runFsHeartbeat() {
    const container = this.#instance;

    if (!container || this.#isRecovering) {
      return;
    }

    try {
      const marker = `${Date.now()}`;

      await withTimeout(container.fs.mkdir('.bolt-runtime', { recursive: true }), HEARTBEAT_TIMEOUT_MS, 'heartbeat mkdir');
      await withTimeout(container.fs.writeFile(HEARTBEAT_FILE_PATH, marker), HEARTBEAT_TIMEOUT_MS, 'heartbeat write');
      const readValue = await withTimeout(
        container.fs.readFile(HEARTBEAT_FILE_PATH, 'utf-8') as Promise<string>,
        HEARTBEAT_TIMEOUT_MS,
        'heartbeat read',
      );

      if (String(readValue).trim() !== marker) {
        throw new Error('Heartbeat timestamp mismatch');
      }

      this.#heartbeatFailures = 0;
      this._context.heartbeatHealthy = true;
    } catch (error) {
      this.#heartbeatFailures += 1;
      this._context.heartbeatHealthy = false;
      logger.warn('WebContainer fs-heartbeat failed', {
        failureCount: this.#heartbeatFailures,
        error: error instanceof Error ? error.message : String(error),
      });

      if (this.#heartbeatFailures >= HEARTBEAT_FAILURE_LIMIT) {
        this.#heartbeatFailures = 0;
        await this.forceReboot('fs-heartbeat detected stalled filesystem activity');
      }
    }
  }

  #runMemoryGuard() {
    if (typeof performance === 'undefined') {
      return;
    }

    const memory = (performance as any).memory as
      | {
          usedJSHeapSize?: number;
          jsHeapSizeLimit?: number;
        }
      | undefined;

    if (!memory?.usedJSHeapSize || !memory?.jsHeapSizeLimit) {
      return;
    }

    const usedRatio = memory.usedJSHeapSize / memory.jsHeapSizeLimit;

    if (usedRatio < MEMORY_GUARD_WARN_THRESHOLD) {
      return;
    }

    const now = Date.now();

    if (now < this.#memoryWarningCooldownUntil) {
      return;
    }

    this.#memoryWarningCooldownUntil = now + MEMORY_GUARD_COOLDOWN_MS;
    logger.warn('WebContainer memory pressure is high', {
      usedRatio,
      usedJSHeapSize: memory.usedJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit,
    });

    recoveryManager.checkMemoryPressure();
  }

  async #captureWorkspaceSnapshot() {
    try {
      const { workbenchStore } = await import('~/lib/stores/workbench');
      return this.#cloneSnapshot(workbenchStore.files.get());
    } catch (error) {
      logger.warn('Unable to capture workspace snapshot before reboot', error);
      return undefined;
    }
  }

  async #restoreWorkspaceSnapshot(snapshot: FileMap | undefined) {
    if (!snapshot || Object.keys(snapshot).length === 0) {
      return;
    }

    try {
      const { workbenchStore } = await import('~/lib/stores/workbench');
      await workbenchStore.restoreSnapshot(snapshot);
    } catch (error) {
      logger.error('Failed to restore workspace snapshot after reboot', error);
    }
  }

  #cloneSnapshot(snapshot: FileMap): FileMap {
    return Object.fromEntries(
      Object.entries(snapshot).map(([filePath, dirent]) => [filePath, dirent ? { ...dirent } : dirent]),
    ) as FileMap;
  }
}
