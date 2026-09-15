import { describe, expect, it } from 'vitest';
import {
  recordPreviewResponse,
  settleHealthyQueuedPreviewRepair,
  settleSuccessfulHostedAutostart,
} from './runtime-server.mjs';

function fixture(status = 'repairing') {
  return {
    id: 'browser-failure-race',
    preview: { port: 4100 },
    previewSubscribers: new Set(),
    workspaceMutationId: 7,
    currentFileMap: {},
    previewDiagnostics: {
      status,
      healthy: false,
      recentLogs: [],
      alert: {
        type: 'info',
        title: 'Preview Repair In Progress',
        description: 'Repairing',
        content: "Detected: Cannot read properties of null (reading 'useState')",
        source: 'preview',
      },
    },
    previewRecovery: { state: 'running', token: 3, message: 'Repair queued.' },
  };
}

describe('browser failure versus late HTTP readiness', () => {
  it.each(['error', 'repairing'])(
    'preserves a browser failure in %s after a successful document response',
    (status) => {
      const session = fixture(status);
      const before = structuredClone(session.previewDiagnostics);
      recordPreviewResponse(session, '<html><div id="root"></div></html>', 200, '/', 'text/html');
      expect(session.previewDiagnostics).toEqual(before);
      expect(session.previewRecovery.state).toBe('running');
    },
  );

  it('does not cancel a browser repair when an older HTTP probe finishes successfully', () => {
    const session = fixture();
    expect(settleHealthyQueuedPreviewRepair(session, { healthy: true, alert: null, statusCode: 200 })).toBe(false);
    expect(session.previewDiagnostics.healthy).toBe(false);
    expect(session.previewRecovery).toMatchObject({ state: 'running', token: 3 });
    expect(session.previewDiagnostics.recentLogs).toEqual([]);
  });

  it('does not let a late autostart completion clear a new browser failure in the same mutation', () => {
    const session = fixture();
    expect(settleSuccessfulHostedAutostart(session, 7)).toBe(false);
    expect(session.previewDiagnostics).toMatchObject({ status: 'repairing', healthy: false });
  });

  it('can still clear transient lifecycle noise using a healthy response', () => {
    const session = fixture();
    session.previewDiagnostics.alert.content = 'ELIFECYCLE Command failed with exit code 1.';
    recordPreviewResponse(session, '<html><h1>Working app</h1></html>', 200, '/', 'text/html');
    expect(session.previewDiagnostics).toMatchObject({ status: 'ready', healthy: true, alert: null });
  });
});
