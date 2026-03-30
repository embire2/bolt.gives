import type { WebContainer } from '@webcontainer/api';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('WebContainerRecovery');

export interface RecoveryState {
  isRecovering: boolean;
  crashCount: number;
  lastCrashTimestamp: number | null;
}

class WebContainerRecoveryManager {
  private _state: RecoveryState = {
    isRecovering: false,
    crashCount: 0,
    lastCrashTimestamp: null,
  };

  private _webcontainerInstance: WebContainer | null = null;
  private readonly _maxCrashesBeforeFatal = 5;
  private readonly _crashWindowMs = 60000; // 1 minute window to count rapid crashes

  attach(webcontainer: WebContainer) {
    this._webcontainerInstance = webcontainer;
    this._setupHeuristics();
  }

  private _setupHeuristics() {
    if (!this._webcontainerInstance) {
      return;
    }

    // We can monitor internal preview events or file system events as a proxy for health
    this._webcontainerInstance.on('preview-message', (message) => {
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

    if (this._state.isRecovering) {
      return; // Already handling it
    }

    const now = Date.now();

    if (this._state.lastCrashTimestamp && now - this._state.lastCrashTimestamp < this._crashWindowMs) {
      this._state.crashCount++;
    } else {
      this._state.crashCount = 1;
    }

    this._state.lastCrashTimestamp = now;

    if (this._state.crashCount >= this._maxCrashesBeforeFatal) {
      logger.error('WebContainer has crashed too many times in a short window. Cannot auto-recover.');
      return; // Give up, let the user manually reload the page
    }

    this._state.isRecovering = true;

    try {
      logger.info('Attempting to reboot WebContainer...');

      /*
       * In a real implementation, we would tear down the instance and call webContainerApi.boot() again.
       * Since the boot process is heavily tied to the singleton promise in `app/lib/webcontainer/index.ts`,
       * we emit an event or force a page reload if we can't safely re-bootstrap the singleton.
       * For now, we log the recovery attempt.
       */

      /*
       * Temporary solution for catastrophic WASM failure: reload the workbench to get a fresh browser tab state.
       * This is often the safest true recovery from a WASM Out-of-Memory condition.
       */
      if (typeof window !== 'undefined') {
        console.warn('Initiating browser reload to recover from fatal WebContainer WASM crash.');
        setTimeout(() => {
          window.location.reload();
        }, 3000);
      }
    } catch (e) {
      logger.error('Failed to recover WebContainer', e);
    } finally {
      this._state.isRecovering = false;
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
