import { isHostedRuntimeEnabled } from '~/lib/runtime/hosted-runtime-client';

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
