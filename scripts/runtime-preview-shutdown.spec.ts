import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { recordPreviewResponse, syncWorkspaceSnapshot, terminateSessionProcesses } from './runtime-server.mjs';

const directories: string[] = [];

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await Promise.all(directories.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function fixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bolt-shutdown-regression-'));
  directories.push(dir);

  const file = (content: string) => ({ type: 'file' as const, content, isBinary: false });
  const files = {
    '/home/project/src/App.tsx': file('export default function App() { return <h1>Saved follow-up</h1>; }'),
    '/home/project/src/main.tsx': file("import App from './App';"),
    '/home/project/index.html': file('<script type="module" src="/src/main.tsx"></script>'),
  };
  const session = {
    id: 'owned-shutdown-fixture',
    dir,
    processes: new Map(),
    previewSubscribers: new Set(),
    preview: { port: 6289, baseUrl: 'http://fixture.localhost/preview' },
    workspaceMutationId: 7,
    autoRestoreInFlight: false,
    autoRestoreTimer: null,
    currentFileMap: files,
    restorePointFileMap: {
      ...files,
      '/home/project/src/App.tsx': file('export default function App() { return <h1>Old source</h1>; }'),
    },
    previewDiagnostics: { status: 'ready', healthy: true, recentLogs: [], alert: null },
    previewRecovery: { state: 'idle', token: 0, message: null, updatedAt: null },
  };
  await syncWorkspaceSnapshot(session, files);

  return session;
}

describe('intentional Preview shutdown', () => {
  it('does not schedule a source rollback for late proxy failures after shutdown', async () => {
    vi.useFakeTimers();

    const session = await fixture();
    await terminateSessionProcesses(session);
    recordPreviewResponse(session, 'Preview unavailable', 503, '/', 'text/html');
    expect(session.autoRestoreTimer).toBeNull();
    await vi.advanceTimersByTimeAsync(4000);
    expect(await fs.readFile(path.join(session.dir, 'src/App.tsx'), 'utf8')).toContain('Saved follow-up');
  });

  it('invalidates a repair probe that was already awaiting a network result', async () => {
    vi.useFakeTimers();

    const session = await fixture();
    let resolveProbe!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => {
      resolveProbe = resolve;
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockReturnValue(response);
    recordPreviewResponse(session, 'Preview unavailable', 503, '/', 'text/html');
    await vi.advanceTimersByTimeAsync(3500);
    await vi.waitUntil(() => fetchSpy.mock.calls.length > 0);
    await terminateSessionProcesses(session);
    expect(session.workspaceMutationId).toBe(8);
    resolveProbe(new Response('Compile error', { status: 500, headers: { 'content-type': 'text/html' } }));
    await vi.advanceTimersByTimeAsync(4000);
    expect(session.previewRecovery.state).toBe('idle');
    expect(await fs.readFile(path.join(session.dir, 'src/App.tsx'), 'utf8')).toContain('Saved follow-up');
  });
});
