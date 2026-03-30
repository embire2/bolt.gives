import type { WebContainer } from '@webcontainer/api';
import { isHostedRuntimeEnabled } from '~/lib/runtime/hosted-runtime-client';
import { WORK_DIR_NAME } from '~/utils/constants';
import { cleanStackTrace } from '~/utils/stacktrace';
import { createHostedWebContainerStub } from './hosted-stub';
import { createBoltContainer } from './bolt-container';
import { recoveryManager } from './manager/recovery';

interface WebContainerContext {
  loaded: boolean;
}

export type RuntimeType = 'webcontainer' | 'bolt-container' | 'hosted';

export function getSelectedRuntime(): RuntimeType {
  if (typeof window === 'undefined') {
    return 'webcontainer';
  }

  const storage =
    typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function' ? localStorage : null;
  const stored = storage?.getItem('bolt_runtime');

  if (stored === 'bolt-container') {
    return 'bolt-container';
  }

  if (isHostedRuntimeEnabled()) {
    return 'hosted';
  }

  return 'webcontainer';
}

const hotData = import.meta.hot?.data ?? {};

export const webcontainerContext: WebContainerContext = hotData?.webcontainerContext ?? {
  loaded: false,
};

if (import.meta.hot) {
  const hot = import.meta.hot as any;
  hot.data ??= {};
  hot.data.webcontainerContext = webcontainerContext;
}

export let webcontainer: Promise<WebContainer> = new Promise(() => {
  // noop for ssr
});

if (!import.meta.env.SSR) {
  webcontainer =
    hotData?.webcontainer ??
    Promise.resolve()
      .then(() => {
        const runtime = getSelectedRuntime();

        if (runtime === 'hosted') {
          return createHostedWebContainerStub();
        }

        if (runtime === 'bolt-container') {
          console.log('[BoltContainer] Booting custom BoltContainer runtime...');
          return createBoltContainer();
        }

        // Default: proprietary WebContainer WASM engine
        return import('@webcontainer/api').then(({ WebContainer: webContainerApi }) =>
          webContainerApi.boot({
            coep: 'credentialless',
            workdirName: WORK_DIR_NAME,
            forwardPreviewErrors: true,
          }),
        );
      })
      .then(async (webcontainer) => {
        const runtime = getSelectedRuntime();

        if (runtime === 'hosted') {
          webcontainerContext.loaded = false;
          return webcontainer;
        }

        webcontainerContext.loaded = true;

        const { workbenchStore } = await import('~/lib/stores/workbench');

        // Only load inspector script for WebContainer (BoltContainer handles its own preview)
        if (runtime === 'webcontainer') {
          try {
            const response = await fetch('/inspector-script.js');
            const inspectorScript = await response.text();
            await webcontainer.setPreviewScript(inspectorScript);
          } catch {
            // inspector script is optional
          }
        }

        // Attach auto-recovery manager
        recoveryManager.attach(webcontainer);

        // Listen for preview errors
        webcontainer.on('preview-message', (message) => {
          console.log('Preview message:', message);

          if (message.type === 'PREVIEW_UNCAUGHT_EXCEPTION' || message.type === 'PREVIEW_UNHANDLED_REJECTION') {
            const isPromise = message.type === 'PREVIEW_UNHANDLED_REJECTION';
            const title = isPromise ? 'Unhandled Promise Rejection' : 'Uncaught Exception';
            workbenchStore.actionAlert.set({
              type: 'preview',
              title,
              description: 'message' in message ? message.message : 'Unknown error',
              content: `Error occurred at ${message.pathname}${message.search}${message.hash}\nPort: ${message.port}\n\nStack trace:\n${cleanStackTrace(message.stack || '')}`,
              source: 'preview',
            });
          }
        });

        return webcontainer;
      });

  if (import.meta.hot) {
    const hot = import.meta.hot as any;
    hot.data ??= {};
    hot.data.webcontainer = webcontainer;
  }
}
