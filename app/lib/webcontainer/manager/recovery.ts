import type { WebContainer } from '@webcontainer/api';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('WebContainerRecovery');

export interface RecoveryState {
  isRecovering: boolean;
  crashCount: number;
  lastCrashTimestamp: number | null;
}

class WebContainerRecoveryManager {
  private state: RecoveryState = {
    isRecovering: false,
    crashCount: 0,
    lastCrashTimestamp: null,
  };

  private webcontainerInstance: WebContainer | null = null;
  private readonly MAX_CRASHES_BEFORE_FATAL = 5;
  private readonly CRASH_WINDOW_MS = 60000; // 1 minute window to count rapid crashes

  constructor() {}

  attach(webcontainer: WebContainer) {
    this.webcontainerInstance = webcontainer;
    this.setupHeuristics();
  }

  private setupHeuristics() {
    if (!this.webcontainerInstance) return;

    // We can monitor internal preview events or file system events as a proxy for health
    this.webcontainerInstance.on('preview-message', (message) => {
      // If we get an internal out-of-memory or fatal WASM error, we intervene
      if (message.type === 'PREVIEW_UNCAUGHT_EXCEPTION') {
        const msg = String(message.message || '').toLowerCase();
        if (msg.includes('out of memory') || msg.includes('wasm') || msg.includes('fatal error')) {
          this.handleFatalCrash('OOM or WASM crash detected via preview messages.');
        }
      }
    });
  }

  async handleFatalCrash(reason: string) {
    logger.warn(`WebContainer Crash Detected: ${reason}`);

    if (this.state.isRecovering) {
      return; // Already handling it
    }

    const now = Date.now();
    if (this.state.lastCrashTimestamp && now - this.state.lastCrashTimestamp < this.CRASH_WINDOW_MS) {
      this.state.crashCount++;
    } else {
      this.state.crashCount = 1;
    }
    this.state.lastCrashTimestamp = now;

    if (this.state.crashCount >= this.MAX_CRASHES_BEFORE_FATAL) {
      logger.error('WebContainer has crashed too many times in a short window. Cannot auto-recover.');
      return; // Give up, let the user manually reload the page
    }

    this.state.isRecovering = true;
    try {
      logger.info('Attempting to reboot WebContainer...');
      // In a real implementation, we would tear down the instance and call webContainerApi.boot() again.
      // Since the boot process is heavily tied to the singleton promise in `app/lib/webcontainer/index.ts`,
      // we emit an event or force a page reload if we can't safely re-bootstrap the singleton.
      // For now, we log the recovery attempt.
      
      // Temporary solution for catastrophic WASM failure: reload the workbench to get a fresh browser tab state.
      // This is often the safest true recovery from a WASM Out-of-Memory condition.
      if (typeof window !== 'undefined') {
        console.warn('Initiating browser reload to recover from fatal WebContainer WASM crash.');
        setTimeout(() => {
          window.location.reload();
        }, 3000);
      }
    } catch (e) {
      logger.error('Failed to recover WebContainer', e);
    } finally {
      this.state.isRecovering = false;
    }
  }

  // Called periodically to check if we need to suggest a reload due to memory pressure
  checkMemoryPressure() {
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      const memory = (performance as any).memory;
      const usedPercent = memory.usedJSHeapSize / memory.jsHeapSizeLimit;
      if (usedPercent > 0.9) {
        logger.warn('Browser JS Heap approaching limit. WebContainer OOM risk is high.');
        // We could trigger a UI warning here advising the user to restart the dev server
      }
    }
  }
}

export const recoveryManager = new WebContainerRecoveryManager();
