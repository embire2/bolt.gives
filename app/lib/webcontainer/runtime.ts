import { isHostedRuntimeEnabled } from '~/lib/runtime/hosted-runtime-client';

export type RuntimeType = 'webcontainer' | 'bolt-container' | 'hosted';

export function getSelectedRuntime(): RuntimeType {
  if (typeof window === 'undefined') {
    return 'webcontainer';
  }

  const storage =
    typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function' ? localStorage : null;
  const stored = storage?.getItem('bolt_runtime');

  // Explicit user preference always wins — honor persisted selection before
  // consulting any runtime-feature flags so 'webcontainer' isn't overridden by
  // a hosted-runtime default.
  if (stored === 'webcontainer' || stored === 'bolt-container' || stored === 'hosted') {
    return stored;
  }

  if (isHostedRuntimeEnabled()) {
    return 'hosted';
  }

  return 'webcontainer';
}
