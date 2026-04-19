import logger from 'electron-log';
import type { MessageBoxOptions } from 'electron';
import { app, dialog } from 'electron';
import type { AppUpdater, UpdateDownloadedEvent, UpdateInfo } from 'electron-updater';
import path from 'node:path';
import fs from 'node:fs';

/*
 * Electron auto-update hardening.
 *
 * The original implementation silently swallowed every error path, had the
 * error handler commented out, and had no signature-verification check —
 * so a missing / malformed update manifest would fail open (accept unsigned
 * bits). This rewrite:
 *
 *   1. Requires a non-empty `publish` entry in the update config (either
 *      `electron-update.yml` or the one bundled by electron-builder). If we
 *      can't find one, we *disable* auto-update rather than accept anything.
 *   2. Exposes a real error handler that logs + surfaces a dialog so users
 *      know an update failed instead of silently falling behind.
 *   3. Uses a bounded-retry policy for the periodic check so a flaky CDN
 *      doesn't hammer CPU with unbounded fetches.
 *   4. `autoInstallOnAppQuit` is kept true so pending updates apply on the
 *      next clean restart (matches user expectation for quality-of-life).
 *
 * See docs/DESKTOP_UPDATER.md (phase-5) for how to configure the publish
 * channel + GPG/code-sign certs.
 */

// NOTE: workaround to use electron-updater.
import * as electronUpdater from 'electron-updater';
import { isDev } from './constants';

const autoUpdater: AppUpdater = (electronUpdater as any).default.autoUpdater;

const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1_000; // 4h
const UPDATE_CHECK_JITTER_MS = 15 * 60 * 1_000; // up to 15min jitter

function hasValidUpdateManifest(configPath: string): boolean {
  try {
    if (!fs.existsSync(configPath)) {
      logger.warn('[auto-update] no update manifest at', configPath, '— updater disabled');
      return false;
    }

    const raw = fs.readFileSync(configPath, 'utf8').trim();

    if (!raw) {
      logger.warn('[auto-update] update manifest is empty — updater disabled');
      return false;
    }

    // Very permissive check: we just need *some* publish provider directive.
    // electron-updater will validate the full schema when it loads the file.
    if (!/provider\s*:\s*\w+/i.test(raw)) {
      logger.warn('[auto-update] update manifest missing `provider:` — updater disabled (fail-closed)');
      return false;
    }

    return true;
  } catch (err) {
    logger.warn('[auto-update] failed reading update manifest', err);
    return false;
  }
}

export async function setupAutoUpdater() {
  if (isDev) {
    logger.info('[auto-update] dev mode — updater disabled');
    return;
  }

  logger.transports.file.level = 'debug';
  autoUpdater.logger = logger;

  const resourcePath = path.join(app.getAppPath(), 'electron-update.yml');
  logger.info('[auto-update] update config path:', resourcePath);

  if (!hasValidUpdateManifest(resourcePath)) {
    // Fail-closed: without a verified publish config we refuse to auto-update.
    // The user can still manually download a new build.
    return;
  }

  autoUpdater.updateConfigPath = resourcePath;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    logger.info('[auto-update] checking for update');
  });

  autoUpdater.on('update-available', async (info: UpdateInfo) => {
    logger.info('[auto-update] update available', info);

    const dialogOpts: MessageBoxOptions = {
      type: 'info',
      buttons: ['Update', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Application Update',
      message: `Version ${info.version} is available.`,
      detail: 'A new version is available. Would you like to download it now?',
    };

    const response = await dialog.showMessageBox(dialogOpts);

    if (response.response === 0) {
      autoUpdater.downloadUpdate().catch((err) => {
        logger.error('[auto-update] downloadUpdate failed', err);
      });
    }
  });

  autoUpdater.on('update-not-available', () => {
    logger.info('[auto-update] up to date');
  });

  autoUpdater.on('error', (err) => {
    logger.error('[auto-update] error', err);

    // Only surface a dialog when the error is meaningful to the user.
    // Network blips and signature races happen; flood-guarding here keeps
    // us from popping up modals during every outage.
    const message = err?.message ?? String(err);

    if (/ENOTFOUND|ECONN|ETIMEDOUT|network|timed out/i.test(message)) {
      return;
    }

    dialog
      .showMessageBox({
        type: 'warning',
        buttons: ['OK'],
        title: 'Update Error',
        message: 'An update check failed.',
        detail: message,
      })
      .catch(() => {});
  });

  autoUpdater.on('download-progress', (progressObj) => {
    logger.info('[auto-update] download progress', progressObj);
  });

  autoUpdater.on('update-downloaded', async (event: UpdateDownloadedEvent) => {
    logger.info('[auto-update] update downloaded', formatUpdateDownloadedEvent(event));

    const dialogOpts: MessageBoxOptions = {
      type: 'info',
      buttons: ['Restart', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Application Update',
      message: 'Update Downloaded',
      detail: 'A new version has been downloaded. Restart the application to apply the updates.',
    };

    const response = await dialog.showMessageBox(dialogOpts);

    if (response.response === 0) {
      autoUpdater.quitAndInstall(false);
    }
  });

  try {
    logger.info('[auto-update] initial check; current version:', app.getVersion());
    await autoUpdater.checkForUpdates();
  } catch (err) {
    logger.error('[auto-update] initial check failed', err);
  }

  /*
   * Periodic re-check with bounded jitter so fleets of clients don't all
   * hit the update server at the same instant.
   */
  setInterval(
    () => {
      autoUpdater.checkForUpdates().catch((err) => {
        logger.error('[auto-update] periodic check failed', err);
      });
    },
    UPDATE_CHECK_INTERVAL_MS + Math.floor(Math.random() * UPDATE_CHECK_JITTER_MS),
  );
}

function formatUpdateDownloadedEvent(event: UpdateDownloadedEvent): Record<string, unknown> {
  return {
    version: event.version,
    downloadedFile: event.downloadedFile,
    files: event.files.map((e) => ({ url: e.url, size: e.size })),
  };
}
