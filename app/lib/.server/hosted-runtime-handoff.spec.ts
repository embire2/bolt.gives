import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyHostedRuntimeAssistantActions } from './hosted-runtime-handoff';

const assistantContent = `<boltArtifact id="taskspark" title="TaskSpark Notes">
<boltAction type="file" filePath="src/App.tsx">
export default function App() {
  return <h1>FOLLOWUP_MARKER</h1>;
}
</boltAction>
</boltArtifact>`;

describe('applyHostedRuntimeAssistantActions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('syncs file actions and replays setup/start commands on the hosted runtime', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sessionId: 'session123',
            files: {},
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response('{"type":"stdout","chunk":"install ok\\n"}\n{"type":"exit","exitCode":0}\n', {
          status: 200,
          headers: { 'Content-Type': 'application/x-ndjson' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          '{"type":"ready","preview":{"baseUrl":"https://alpha1.bolt.gives/runtime/preview/session123/4101"}}\n{"type":"exit","exitCode":0}\n',
          {
            status: 200,
            headers: { 'Content-Type': 'application/x-ndjson' },
          },
        ),
      );

    vi.stubGlobal('fetch', fetchMock);

    const result = await applyHostedRuntimeAssistantActions({
      requestUrl: 'https://alpha1.bolt.gives/api/chat',
      sessionId: 'session123',
      assistantContent,
      synthesizedRunHandoff: {
        reason: 'inferred-project-commands',
        followupMessage: 'runtime handoff',
        setupCommand: 'pnpm install',
        startCommand: 'pnpm dev -- --host 0.0.0.0 --port 4101',
        assistantContent: '<boltArtifact id="runtime-handoff"></boltArtifact>',
      },
    });

    expect(result).toEqual({
      appliedFilePaths: ['/home/project/src/App.tsx'],
      setup: {
        exitCode: 0,
        output: 'install ok\n',
        previewBaseUrl: null,
      },
      start: {
        exitCode: 0,
        output: '',
        previewBaseUrl: 'https://alpha1.bolt.gives/runtime/preview/session123/4101',
      },
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://alpha1.bolt.gives/runtime/sessions/session123/snapshot',
      expect.objectContaining({
        method: 'GET',
      }),
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://alpha1.bolt.gives/runtime/sessions/session123/sync',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          files: {
            '/home/project/src/App.tsx': {
              type: 'file',
              content: 'export default function App() {\n  return <h1>FOLLOWUP_MARKER</h1>;\n}\n',
              isBinary: false,
            },
          },
          prune: true,
        }),
      }),
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://alpha1.bolt.gives/runtime/sessions/session123/command',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ kind: 'shell', command: 'pnpm install' }),
      }),
    );
  });

  it('returns null when there are no file actions to apply', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await applyHostedRuntimeAssistantActions({
      requestUrl: 'https://alpha1.bolt.gives/api/chat',
      sessionId: 'session123',
      assistantContent: 'plain text only',
      synthesizedRunHandoff: {
        reason: 'inferred-project-commands',
        followupMessage: 'runtime handoff',
        startCommand: 'pnpm dev',
        assistantContent: '<boltArtifact id="runtime-handoff"></boltArtifact>',
      },
    });

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://alpha1.bolt.gives/runtime/sessions/session123/snapshot',
      expect.objectContaining({
        method: 'GET',
      }),
    );
  });

  it('preserves a working Vite runtime contract when the generated package.json falls back to CRA scripts', async () => {
    const craAssistantContent = `<boltArtifact id="taskspark" title="TaskSpark Notes">
<boltAction type="file" filePath="package.json">{
  "name": "taskboard-pro",
  "private": true,
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-scripts": "5.0.1"
  },
  "scripts": {
    "start": "react-scripts start"
  }
}</boltAction>
<boltAction type="file" filePath="src/App.tsx">export default function App(){return <h1>FOLLOWUP_MARKER</h1>;}</boltAction>
</boltArtifact>`;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sessionId: 'session123',
            files: {
              '/home/project/package.json': {
                type: 'file',
                content: JSON.stringify(
                  {
                    name: 'vite-react-app',
                    private: true,
                    scripts: {
                      dev: 'vite --host 0.0.0.0 --port 5173',
                      build: 'vite build',
                    },
                    dependencies: {
                      react: '^18.3.1',
                      'react-dom': '^18.3.1',
                    },
                    devDependencies: {
                      vite: '^5.4.21',
                      '@vitejs/plugin-react': '^4.7.0',
                    },
                  },
                  null,
                  2,
                ),
                isBinary: false,
              },
              '/home/project/vite.config.ts': {
                type: 'file',
                content: "import { defineConfig } from 'vite';\nexport default defineConfig({});\n",
                isBinary: false,
              },
              '/home/project/src/main.tsx': {
                type: 'file',
                content: "import React from 'react';\n",
                isBinary: false,
              },
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response('{"type":"stdout","chunk":"install ok\\n"}\n{"type":"exit","exitCode":0}\n', {
          status: 200,
          headers: { 'Content-Type': 'application/x-ndjson' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          '{"type":"ready","preview":{"baseUrl":"https://alpha1.bolt.gives/runtime/preview/session123/4101"}}\n{"type":"exit","exitCode":0}\n',
          {
            status: 200,
            headers: { 'Content-Type': 'application/x-ndjson' },
          },
        ),
      );

    vi.stubGlobal('fetch', fetchMock);

    await applyHostedRuntimeAssistantActions({
      requestUrl: 'https://alpha1.bolt.gives/api/chat',
      sessionId: 'session123',
      assistantContent: craAssistantContent,
      synthesizedRunHandoff: {
        reason: 'inferred-project-commands',
        followupMessage: 'runtime handoff',
        setupCommand: 'pnpm install --reporter=append-only --no-frozen-lockfile',
        startCommand: 'pnpm run dev',
        assistantContent: '<boltArtifact id="runtime-handoff"></boltArtifact>',
      },
    });

    const syncBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    const syncedPackageJson = JSON.parse(syncBody.files['/home/project/package.json'].content);
    const setupBody = JSON.parse(String(fetchMock.mock.calls[2][1]?.body));
    const startBody = JSON.parse(String(fetchMock.mock.calls[3][1]?.body));

    expect(syncedPackageJson.scripts.dev).toBe('vite --host 0.0.0.0 --port 5173');
    expect(syncedPackageJson.dependencies['react-scripts']).toBeUndefined();
    expect(syncedPackageJson.devDependencies.vite).toBe('^5.4.21');
    expect(setupBody.command).toContain('pnpm install --no-frozen-lockfile');
    expect(startBody.command).toBe('pnpm run dev');
  });

  it('rewrites generated JavaScript entry files onto the active TypeScript starter file and prunes stale siblings', async () => {
    const jsAssistantContent = `<boltArtifact id="taskspark" title="TaskSpark Notes">
<boltAction type="file" filePath="src/App.js">export default function App(){return <main>FOLLOWUP_MARKER</main>;}</boltAction>
</boltArtifact>`;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sessionId: 'session123',
            files: {
              '/home/project/src/App.tsx': {
                type: 'file',
                content: 'export default function App(){return <main>starter</main>;}\n',
                isBinary: false,
              },
              '/home/project/src/App.js': {
                type: 'file',
                content: 'export default function App(){return <main>stale js</main>;}\n',
                isBinary: false,
              },
              '/home/project/src/main.tsx': {
                type: 'file',
                content: "import App from './App';\n",
                isBinary: false,
              },
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response('{"type":"stdout","chunk":"install ok\\n"}\n{"type":"exit","exitCode":0}\n', {
          status: 200,
          headers: { 'Content-Type': 'application/x-ndjson' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          '{"type":"ready","preview":{"baseUrl":"https://alpha1.bolt.gives/runtime/preview/session123/4101"}}\n{"type":"exit","exitCode":0}\n',
          {
            status: 200,
            headers: { 'Content-Type': 'application/x-ndjson' },
          },
        ),
      );

    vi.stubGlobal('fetch', fetchMock);

    await applyHostedRuntimeAssistantActions({
      requestUrl: 'https://alpha1.bolt.gives/api/chat',
      sessionId: 'session123',
      assistantContent: jsAssistantContent,
      synthesizedRunHandoff: {
        reason: 'inferred-project-commands',
        followupMessage: 'runtime handoff',
        setupCommand: 'pnpm install',
        startCommand: 'pnpm run dev',
        assistantContent: '<boltArtifact id="runtime-handoff"></boltArtifact>',
      },
    });

    const syncBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));

    expect(syncBody.prune).toBe(true);
    expect(syncBody.files['/home/project/src/App.tsx'].content).toContain('FOLLOWUP_MARKER');
    expect(syncBody.files['/home/project/src/App.js']).toBeUndefined();
  });
});
