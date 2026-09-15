import { describe, expect, it } from 'vitest';
import { detectRestoredHostedRuntimeHandoffMismatch } from './hosted-handoff-verification';
import type { HostedRuntimePreviewStatus } from './hosted-runtime-snapshot';

describe('restored source verification', () => {
  const status: HostedRuntimePreviewStatus = {
    sessionId: 'fixture',
    preview: null,
    status: 'ready',
    healthy: true,
    updatedAt: null,
    recentLogs: [],
    alert: null,
    recovery: { state: 'restored', token: 1, message: null, updatedAt: null },
  };
  it.each(['old', 'new'])('detects whether a restored snapshot retained the change (%s)', (version) => {
    const mismatch = detectRestoredHostedRuntimeHandoffMismatch({
      status,
      snapshot: { '/home/project/src/App.tsx': { type: 'file', content: `<h1>${version}</h1>\n`, isBinary: false } },
      appliedFiles: [{ path: '/home/project/src/App.tsx', content: '<h1>new</h1>\n' }],
    });

    if (version === 'old') {
      expect(mismatch).toContain('latest generated update to src/App.tsx was not retained');
    } else {
      expect(mismatch).toBeNull();
    }
  });
});
