import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

/*
 * Preload script.
 *
 * Runs in an isolated world with `contextIsolation: true`. We deliberately
 * expose the absolute minimum surface: a typed `on()` helper for the main
 * process to push events, and an `invoke()` helper for request/response.
 *
 * The previous version also exposed a hard-coded `ipcTest` channel and
 * wired a 60-second `ping` interval from main → renderer. That was dead
 * code and has been removed along with its noisy debug logs.
 */

type Listener = (...args: unknown[]) => void;

const ipc = {
  /**
   * Request/response via IPC. Main process handles on `channel` using
   * `ipcMain.handle(channel, ...)`. Returns whatever the handler returns.
   */
  invoke(channel: string, ...args: unknown[]) {
    return ipcRenderer.invoke(channel, ...args);
  },

  /**
   * Subscribe to an event pushed from main. Returns an unsubscribe function.
   */
  on(channel: string, listener: Listener) {
    const wrapped = (_event: IpcRendererEvent, ...args: unknown[]) => listener(...args);
    ipcRenderer.on(channel, wrapped);

    return () => {
      ipcRenderer.removeListener(channel, wrapped);
    };
  },
};

contextBridge.exposeInMainWorld('ipc', ipc);
