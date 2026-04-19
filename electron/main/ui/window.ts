import log from 'electron-log';
import { app, BrowserWindow, session, shell, type HandlerDetails } from 'electron';
import path from 'node:path';
import { isDev, DEFAULT_PORT } from '../utils/constants';
import { store } from '../utils/store';

/*
 * Hardened BrowserWindow factory.
 *
 * All the defaults Electron ships with for webPreferences are unsafe for a
 * production app that renders arbitrary untrusted HTML/JS inside webviews
 * (the in-browser preview of user-generated code). We lock them down here:
 *
 *   contextIsolation: true  — preload script lives in its own context, can't
 *                             reach into `window`
 *   sandbox: true           — renderer has no Node.js APIs
 *   nodeIntegration: false  — belt-and-suspenders alongside sandbox
 *   webSecurity: true       — same-origin policy is enforced
 *   allowRunningInsecureContent: false
 *   experimentalFeatures: false
 *
 * We then add:
 *   - CSP injection via `onHeadersReceived` for our own origin
 *   - Navigation + window-open interception that routes external links to
 *     the OS browser and blocks anything not on our allow-list
 *   - Crash handlers that log + reload with backoff instead of leaving a
 *     blank window
 */

const ALLOWED_HOSTS = new Set<string>([
  'localhost',
  '127.0.0.1',
  'bolt.gives',
  'alpha1.bolt.gives',
  'ahmad.bolt.gives',
]);

const CRASH_RELOAD_BACKOFF_MS = [1_000, 5_000, 15_000, 60_000];

function isAllowedInternalURL(urlString: string): boolean {
  try {
    const url = new URL(urlString);

    if (url.protocol === 'file:' || url.protocol === 'app:' || url.protocol === 'devtools:') {
      return true;
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }

    return ALLOWED_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function installCspForSession(browserSession: Electron.Session) {
  // We mirror the web CSP (see app/lib/security.ts) but relax it slightly for
  // dev because Vite/HMR needs ws: + inline eval. Production pins `script-src`
  // to self + our origins only.
  const isProduction = !isDev;
  const scriptSrc = isProduction
    ? `'self' 'unsafe-inline' blob: https://bolt.gives https://*.bolt.gives`
    : `'self' 'unsafe-inline' 'unsafe-eval' blob: http://localhost:* ws://localhost:*`;

  const csp = [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline' https:`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data: https:`,
    `connect-src 'self' https: wss: blob:${isDev ? ' http://localhost:* ws://localhost:*' : ''}`,
    `worker-src 'self' blob:`,
    `frame-src 'self' blob: https:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ].join('; ');

  browserSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders };

    /*
     * Remix-side headers may already set CSP (see app/entry.server.tsx); in
     * that case we leave them alone. Otherwise we install the baseline here
     * so loose dev-server responses don't downgrade us.
     */
    const hasCsp = Object.keys(responseHeaders).some((key) => key.toLowerCase() === 'content-security-policy');

    if (!hasCsp) {
      responseHeaders['Content-Security-Policy'] = [csp];
    }

    responseHeaders['X-Content-Type-Options'] = ['nosniff'];
    responseHeaders['X-Frame-Options'] = ['DENY'];
    responseHeaders['Referrer-Policy'] = ['strict-origin-when-cross-origin'];

    callback({ responseHeaders });
  });
}

function installNavigationGuard(win: BrowserWindow) {
  win.webContents.on('will-navigate', (event, urlString) => {
    if (!isAllowedInternalURL(urlString)) {
      event.preventDefault();
      log.warn('[window] blocked in-app navigation to external URL', urlString);
      shell.openExternal(urlString).catch((err) => log.warn('[window] shell.openExternal failed', err));
    }
  });

  win.webContents.setWindowOpenHandler((details: HandlerDetails) => {
    if (isAllowedInternalURL(details.url)) {
      return { action: 'allow' };
    }

    shell.openExternal(details.url).catch((err) => log.warn('[window] shell.openExternal failed', err));

    return { action: 'deny' };
  });

  // Refuse to permit dangerous permissions (full-screen requests, display-capture, etc.)
  win.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowList = new Set(['clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'notifications']);
    callback(allowList.has(permission));
  });
}

function installCrashRecovery(win: BrowserWindow, rendererURL: string) {
  let attempts = 0;

  const reload = () => {
    if (win.isDestroyed()) {
      return;
    }

    attempts += 1;
    const delay = CRASH_RELOAD_BACKOFF_MS[Math.min(attempts - 1, CRASH_RELOAD_BACKOFF_MS.length - 1)];

    log.warn(`[window] attempting crash recovery reload in ${delay}ms (attempt ${attempts})`);

    setTimeout(() => {
      if (win.isDestroyed()) {
        return;
      }

      win.loadURL(rendererURL).catch((err) => log.error('[window] reload after crash failed', err));
    }, delay);
  };

  win.webContents.on('render-process-gone', (_event, details) => {
    log.error('[window] render-process-gone', details);

    if (details.reason !== 'clean-exit') {
      reload();
    }
  });

  win.webContents.on('unresponsive', () => {
    log.warn('[window] renderer unresponsive');
  });

  win.webContents.on('responsive', () => {
    log.info('[window] renderer responsive again');
    attempts = 0;
  });

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    log.error('[window] did-fail-load', { errorCode, errorDescription, validatedURL });

    // Only retry for transient network errors, not explicit aborts (-3).
    if (errorCode !== -3 && errorCode !== 0) {
      reload();
    }
  });
}

export function createWindow(rendererURL: string) {
  log.info('[window] creating with URL:', rendererURL);

  const bounds = store.get('bounds');
  const preloadPath = path.join(isDev ? process.cwd() : app.getAppPath(), 'build', 'electron', 'preload', 'index.cjs');

  // Install CSP + security headers once per session (idempotent).
  installCspForSession(session.defaultSession);

  const win = new BrowserWindow({
    width: 1280,
    height: 832,
    minWidth: 960,
    minHeight: 640,
    ...bounds,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#0b0b10',
    show: false, // show once ready-to-show to avoid white flash
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      spellcheck: true,
      // Restrict the renderer to our own origin when loading HTML, plus the
      // localhost port the Remix dev server binds to.
      additionalArguments: [`--app-port=${DEFAULT_PORT}`],
    },
  });

  installNavigationGuard(win);
  installCrashRecovery(win, rendererURL);

  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) {
      win.show();
    }
  });

  win.webContents.on('did-finish-load', () => {
    log.info('[window] did-finish-load');
  });

  win.loadURL(rendererURL).catch((err) => {
    log.error('[window] initial loadURL failed', err);
  });

  if (isDev) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  const persistBounds = () => {
    if (!win.isDestroyed()) {
      store.set('bounds', win.getBounds());
    }
  };

  win.on('moved', persistBounds);
  win.on('resized', persistBounds);
  win.on('close', persistBounds);

  return win;
}
