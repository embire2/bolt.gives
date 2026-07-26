import type { WebContainer } from '@webcontainer/api';
import { WebContainerManager, type WebContainerContext } from './manager/WebContainerManager';

export type { RuntimeType } from './runtime';
export { getSelectedRuntime } from './runtime';

const hotData = import.meta.hot?.data ?? {};

export const webcontainerContext: WebContainerContext = hotData?.webcontainerContext ?? {
  loaded: false,
  recovering: false,
  heartbeatHealthy: true,
  lastBootedAt: null,
  writeQueueDepth: 0,
};

const webcontainerManager: WebContainerManager =
  hotData?.webcontainerManager ?? new WebContainerManager(webcontainerContext);

if (import.meta.hot) {
  const hot = import.meta.hot as any;
  hot.data ??= {};
  hot.data.webcontainerContext = webcontainerContext;
  hot.data.webcontainerManager = webcontainerManager;
}

export let webcontainer: Promise<WebContainer> = new Promise(() => {
  // noop for ssr
});

if (!import.meta.env.SSR) {
  webcontainer = webcontainerManager.boot();
}

export { webcontainerManager };

export async function queueWebcontainerWrite<T>(priority: 'logic' | 'asset', task: () => Promise<T>) {
  return webcontainerManager.queueWrite(priority, task);
}
