/// <reference types="vite/client" />
import { createRequestHandler } from '@remix-run/node';
import electron, { app, BrowserWindow, protocol, session } from 'electron';
import log from 'electron-log';
import path from 'node:path';
import * as pkg from '../../package.json';
import { setupAutoUpdater } from './utils/auto-update';
import { isDev, DEFAULT_PORT } from './utils/constants';
import { initViteServer, viteServer } from './utils/vite-server';
import { setupMenu } from './ui/menu';
import { createWindow } from './ui/window';
import { initCookies, storeCookies } from './utils/cookie';
import { loadServerBuild, serveAsset } from './utils/serve';
import { reloadOnChange } from './utils/reload';

/*
 * Electron main entry.
 *
 * Hardening vs. the original (in order of importance):
 *
 *   1. Single-instance lock — a second launch focuses the existing window
 *      instead of spawning a duplicate process that fights over the same
 *      IPC/store/user-data directories.
 *   2. Structured logging via electron-log only; no stray `console.log`.
 *   3. Renderer crash handlers (`render-process-gone`, `child-process-gone`)
 *      that log the reason and survive instead of silently exiting.
 *   4. Navigation + window-open guards live in the BrowserWindow factory
 *      (see ui/window.ts).
 *   5. Removed the 60s "hello from main" IPC ping — dead code that kept the
 *      renderer awake for no reason.
 */

// Configure logger early so every subsequent log lands in the right file.
log.transports.file.level = 'info';
log.transports.console.level = isDev ? 'debug' : 'warn';
Object.assign(console, log.functions);

log.info('[main] NODE_ENV:', process.env.NODE_ENV, 'isPackaged:', app.isPackaged, 'isDev:', isDev);

// Enforce single-instance. If we can't get the lock, another instance is
// already running — exit quietly after asking it to focus.
const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  log.info('[main] another instance holds the single-instance lock; exiting');
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  const wins = BrowserWindow.getAllWindows();

  if (wins.length) {
    const [first] = wins;

    if (first.isMinimized()) {
      first.restore();
    }

    first.focus();
  }
});

// Hard failure handlers: log, don't swallow.
process.on('uncaughtException', (error) => {
  log.error('[main] uncaughtException', error);
});

process.on('unhandledRejection', (reason) => {
  log.error('[main] unhandledRejection', reason);
});

app.on('child-process-gone', (_event, details) => {
  log.error('[main] child-process-gone', details);
});

app.on('render-process-gone', (_event, _webContents, details) => {
  log.error('[main] render-process-gone', details);
});

// Disable web security for dev iframes? No — WebContainer already uses
// credentialless COEP; no need to weaken Electron-level security.

(() => {
  const root = process.env.APP_PATH_ROOT ?? import.meta.env.VITE_APP_PATH_ROOT;

  if (root === undefined) {
    log.info('[main] no APP_PATH_ROOT / VITE_APP_PATH_ROOT; using default user-data path');
    return;
  }

  if (!path.isAbsolute(root)) {
    log.error('[main] APP_PATH_ROOT must be absolute path; refusing to start');
    process.exit(1);
  }

  log.info('[main] APP_PATH_ROOT:', root);

  const subdirName = pkg.name;

  for (const [key, val] of [
    ['appData', ''],
    ['userData', subdirName],
    ['sessionData', subdirName],
  ] as const) {
    app.setPath(key, path.join(root, val));
  }

  app.setAppLogsPath(path.join(root, subdirName, 'Logs'));
})();

log.info('[main] appPath:', app.getAppPath());

const pathKeys: Parameters<typeof app.getPath>[number][] = [
  'home',
  'appData',
  'userData',
  'sessionData',
  'logs',
  'temp',
];
pathKeys.forEach((key) => log.info(`[main] path.${key}:`, app.getPath(key)));

declare global {
  // eslint-disable-next-line no-var, @typescript-eslint/naming-convention
  var __electron__: typeof electron;
}

(async () => {
  await app.whenReady();
  log.info('[main] app ready');

  await initCookies();

  const serverBuild = await loadServerBuild();

  protocol.handle('http', async (req) => {
    log.debug('[main] http handler:', req.url);

    if (isDev) {
      return await fetch(req);
    }

    req.headers.append('Referer', req.referrer);

    try {
      const url = new URL(req.url);

      if (url.port !== `${DEFAULT_PORT}`) {
        log.debug('[main] forwarding to local server:', req.url);
        return await fetch(req);
      }

      const assetPath = path.join(app.getAppPath(), 'build', 'client');
      const res = await serveAsset(req, assetPath);

      if (res) {
        return res;
      }

      const cookies = await session.defaultSession.cookies.get({});

      if (cookies.length > 0) {
        req.headers.set('Cookie', cookies.map((c) => `${c.name}=${c.value}`).join('; '));
        await storeCookies(cookies);
      }

      const handler = createRequestHandler(serverBuild, 'production');
      const result = await handler(req, {
        // @ts-ignore — Remix Cloudflare adapter expects this shape
        cloudflare: {},
      });

      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      log.error('[main] http handler failed', { url: req.url, message: error.message, stack: error.stack });

      return new Response(`Error handling request to ${req.url}: ${error.message}`, {
        status: 500,
        headers: { 'content-type': 'text/plain' },
      });
    }
  });

  const rendererURL = await (isDev
    ? (async () => {
        await initViteServer();

        if (!viteServer) {
          throw new Error('Vite server is not initialized');
        }

        const listen = await viteServer.listen();
        global.__electron__ = electron;
        viteServer.printUrls();

        return `http://localhost:${listen.config.server.port}`;
      })()
    : `http://localhost:${DEFAULT_PORT}`);

  log.info('[main] renderer URL:', rendererURL);

  const win = await createWindow(rendererURL);

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow(rendererURL);
    }
  });

  log.info('[main] initial window ready');

  return win;
})()
  .then((win) => setupMenu(win))
  .catch((err) => {
    log.error('[main] bootstrap failed', err);
    app.quit();
    process.exit(1);
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

reloadOnChange();
setupAutoUpdater();
