import { describe, expect, it } from 'vitest';
import { analyzeRunContinuation, shouldForceRunContinuation, synthesizeRunHandoff } from './run-continuation';
import type { FileMap } from '~/lib/stores/files';

describe('shouldForceRunContinuation', () => {
  it('continues when a build request ends with scaffold-only output', () => {
    const shouldContinue = shouldForceRunContinuation({
      chatMode: 'build',
      alreadyAttempted: false,
      lastUserContent: 'Create an appointment scheduling website for a doctor office.',
      assistantContent: '<boltAction type="shell">pnpm dlx create-vite@latest . --template react</boltAction>',
    });

    expect(shouldContinue).toBe(true);
  });

  it('continues when starter bootstrap text is present but no start action exists', () => {
    const shouldContinue = shouldForceRunContinuation({
      chatMode: 'build',
      alreadyAttempted: false,
      lastUserContent: 'Build a dashboard with forms and validation.',
      assistantContent: 'Bolt is initializing your project with the required files using the Vite React template.',
    });

    expect(shouldContinue).toBe(true);
  });

  it('does not continue when the assistant already emitted a start action', () => {
    const shouldContinue = shouldForceRunContinuation({
      chatMode: 'build',
      alreadyAttempted: false,
      lastUserContent: 'Run the app and keep preview open.',
      assistantContent: '<boltAction type="start">pnpm run dev</boltAction>',
    });

    expect(shouldContinue).toBe(false);
  });

  it('continues when the assistant emitted a non-runnable natural-language start action', () => {
    const decision = analyzeRunContinuation({
      chatMode: 'build',
      alreadyAttempted: false,
      lastUserContent: 'Build a calendar app and run it.',
      assistantContent: `
<boltAction type="file" filePath="src/App.tsx">export default function App(){return <div>Calendar</div>;}</boltAction>
<boltAction type="start">Starting the Vite dev server for the calendar app now.</boltAction>
`,
    });

    expect(decision.shouldContinue).toBe(true);
    expect(decision.reason).toBe('run-intent-without-start');
  });

  it('continues when output is bootstrap-only even if start action exists', () => {
    const decision = analyzeRunContinuation({
      chatMode: 'build',
      alreadyAttempted: false,
      lastUserContent: "Create an appointment scheduling website for a doctor's office in React.",
      assistantContent: `
<boltAction type="shell">echo "Using built-in Vite React starter files"</boltAction>
<boltAction type="shell">pnpm install</boltAction>
<boltAction type="start">pnpm run dev</boltAction>
`,
    });

    expect(decision.shouldContinue).toBe(true);
    expect(decision.reason).toBe('bootstrap-only-shell-actions');
  });

  it('continues when a scaffold shell runs against an existing request snapshot without new implementation files', () => {
    const decision = analyzeRunContinuation({
      chatMode: 'build',
      alreadyAttempted: false,
      lastUserContent:
        'Build a small single-page React calendar app that lets the user add and view events. Implement complete files and run it.',
      assistantContent: `
<boltAction type="shell">pnpm dlx create-vite@latest . --template react --no-interactive --overwrite && pnpm install --reporter=append-only --no-frozen-lockfile</boltAction>
<boltAction type="start">pnpm run dev</boltAction>
`,
      currentFiles: {
        '/home/project/package.json': {
          type: 'file',
          isBinary: false,
          content: '{"scripts":{"dev":"vite --host 0.0.0.0 --port 5173"}}',
        },
        '/home/project/src/App.jsx': {
          type: 'file',
          isBinary: false,
          content: 'export default function App(){return <main>Existing shell</main>;}',
        },
      } as FileMap,
    });

    expect(decision.shouldContinue).toBe(true);
    expect(decision.reason).toBe('bootstrap-only-shell-actions');
  });

  it('continues when only non-implementation files were written', () => {
    const decision = analyzeRunContinuation({
      chatMode: 'build',
      alreadyAttempted: false,
      lastUserContent: "Create an appointment scheduling website for a doctor's office in React.",
      assistantContent: `
<boltAction type="file" filePath="README.md"># React + Vite + typescript fallback template</boltAction>
<boltAction type="shell">pnpm install</boltAction>
<boltAction type="start">pnpm run dev</boltAction>
`,
    });

    expect(decision.shouldContinue).toBe(true);
    expect(decision.reason).toBe('bootstrap-only-shell-actions');
  });

  it('does not continue when implementation files are already present', () => {
    const decision = analyzeRunContinuation({
      chatMode: 'build',
      alreadyAttempted: false,
      lastUserContent: "Create an appointment scheduling website for a doctor's office in React.",
      assistantContent: `
<boltAction type="file" filePath="src/App.tsx">export default function App(){return <div>appointments</div>;}</boltAction>
<boltAction type="shell">pnpm install</boltAction>
<boltAction type="start">pnpm run dev</boltAction>
`,
    });

    expect(decision.shouldContinue).toBe(false);
    expect(decision.reason).toBe('continuation-not-required');
  });

  it('continues in build mode when implementation was written but no runnable start action exists yet', () => {
    const decision = analyzeRunContinuation({
      chatMode: 'build',
      alreadyAttempted: false,
      lastUserContent: 'Build a small calendar app for a clinic.',
      assistantContent: `
<boltAction type="file" filePath="src/App.tsx">export default function App(){return <div>Calendar</div>;}</boltAction>
<boltAction type="shell">pnpm install</boltAction>
`,
    });

    expect(decision.shouldContinue).toBe(true);
    expect(decision.reason).toBe('run-intent-without-start');
  });

  it('continues when a follow-up build turn only verifies the app after replacing the starter entry', () => {
    const decision = analyzeRunContinuation({
      chatMode: 'build',
      alreadyAttempted: false,
      lastUserContent: 'Build a small calendar app for a clinic.',
      assistantContent: `
<boltAction type="file" filePath="src/App.tsx">export default function App(){return <div>Calendar</div>;}</boltAction>
<boltAction type="shell">ps aux | grep -E "vite|5173" | grep -v grep</boltAction>
<boltAction type="shell">curl -s -o /dev/null -w "%{http_code}\\n" http://127.0.0.1:5173</boltAction>
`,
      currentFiles: {
        '/home/project/src/App.tsx': {
          type: 'file',
          content: 'export default function App(){return <p>Your fallback starter is ready.</p>;}',
          isBinary: false,
        },
      } as unknown as FileMap,
    });

    expect(decision.shouldContinue).toBe(true);
    expect(decision.reason).toBe('run-intent-without-start');
  });

  it('continues when support files exist but no concrete app entry was generated yet', () => {
    const decision = analyzeRunContinuation({
      chatMode: 'build',
      alreadyAttempted: false,
      lastUserContent: "Create an appointment scheduling website for a doctor's office in React.",
      assistantContent: `
<boltAction type="file" filePath="package.json">{
  "name": "doctor-scheduler",
  "private": true,
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 5173"
  }
}</boltAction>
<boltAction type="file" filePath="src/components/Header.tsx">export function Header(){return <header>Appointments</header>;}</boltAction>
<boltAction type="shell">pnpm install</boltAction>
<boltAction type="start">pnpm run dev</boltAction>
`,
    });

    expect(decision.shouldContinue).toBe(true);
    expect(decision.reason).toBe('starter-without-implementation');
  });

  it('does not classify scaffold output as incomplete when implementation files are already present', () => {
    const decision = analyzeRunContinuation({
      chatMode: 'build',
      alreadyAttempted: false,
      lastUserContent: 'Build a React scheduler and run it.',
      assistantContent: `
<boltAction type="file" filePath="src/App.tsx">export default function App(){return <div>ready</div>;}</boltAction>
<boltAction type="shell">pnpm dlx create-vite@latest . --template react</boltAction>
`,
    });

    expect(decision.shouldContinue).toBe(true);
    expect(decision.reason).toBe('run-intent-without-start');
  });

  it('continues when only inspection shell commands were emitted', () => {
    const decision = analyzeRunContinuation({
      chatMode: 'build',
      alreadyAttempted: false,
      lastUserContent: 'Build a patient intake app and run it.',
      assistantContent: '<boltAction type="shell">ls -la && pwd && cat README.md</boltAction>',
    });

    expect(decision.shouldContinue).toBe(true);
    expect(decision.reason).toBe('inspection-only-shell-actions');
  });

  it('continues when the active starter entry file was never replaced', () => {
    const decision = analyzeRunContinuation({
      chatMode: 'build',
      alreadyAttempted: false,
      lastUserContent: 'Build a doctor scheduler and run it.',
      assistantContent: `
<boltAction type="file" filePath="src/components/Header.tsx">export function Header(){return <header>Luma Clinic</header>;}</boltAction>
<boltAction type="shell">pnpm install</boltAction>
<boltAction type="start">pnpm run dev</boltAction>
`,
      currentFiles: {
        'src/App.tsx': {
          type: 'file',
          isBinary: false,
          content: 'export default function App(){return <p>Your fallback starter is ready.</p>;}',
        },
      } as any,
    });

    expect(decision.shouldContinue).toBe(true);
    expect(decision.reason).toBe('starter-entry-unchanged');
    expect(decision.starterEntryFilePath).toBe('src/App.tsx');
  });

  it('does not force continuation once the starter entry file is replaced', () => {
    const decision = analyzeRunContinuation({
      chatMode: 'build',
      alreadyAttempted: false,
      lastUserContent: 'Build a doctor scheduler and run it.',
      assistantContent: `
<boltAction type="file" filePath="src/App.tsx">export default function App(){return <div>Luma Clinic</div>;}</boltAction>
<boltAction type="shell">pnpm install</boltAction>
<boltAction type="start">pnpm run dev</boltAction>
`,
      currentFiles: {
        'src/App.tsx': {
          type: 'file',
          isBinary: false,
          content: 'export default function App(){return <p>Your fallback starter is ready.</p>;}',
        },
      } as any,
    });

    expect(decision.shouldContinue).toBe(false);
    expect(decision.reason).toBe('continuation-not-required');
  });

  it('continues when the starter entry file was touched but still contains the fallback placeholder', () => {
    const decision = analyzeRunContinuation({
      chatMode: 'build',
      alreadyAttempted: false,
      lastUserContent: 'Build a doctor scheduler and run it.',
      assistantContent: `
<boltAction type="file" filePath="src/App.tsx">export default function App(){return <p>Your fallback starter is ready.</p>;}</boltAction>
<boltAction type="shell">pnpm install</boltAction>
<boltAction type="start">pnpm run dev</boltAction>
`,
      currentFiles: {
        'src/App.tsx': {
          type: 'file',
          isBinary: false,
          content: 'export default function App(){return <p>Your fallback starter is ready.</p>;}',
        },
      } as any,
    });

    expect(decision.shouldContinue).toBe(true);
    expect(decision.reason).toBe('starter-without-implementation');
    expect(decision.starterEntryFilePath).toBe('src/App.tsx');
  });

  it('treats hosted absolute starter entry paths as the same file as relative generated paths', () => {
    const assistantContent = [
      '<boltArtifact id="demo" title="Demo">',
      '<boltAction type="file" filePath="src/App.tsx">export default function App() { return <main>done</main>; }</boltAction>',
      '<boltAction type="start">npm run dev</boltAction>',
      '</boltArtifact>',
    ].join('\n');

    expect(
      analyzeRunContinuation({
        chatMode: 'build',
        lastUserContent: 'Build a task tracker and run it',
        assistantContent,
        alreadyAttempted: false,
        currentFiles: {
          '/home/project/src/App.tsx': {
            type: 'file',
            content: 'Your fallback starter is ready.',
            isBinary: false,
          },
        } as unknown as FileMap,
      }),
    ).toEqual({
      shouldContinue: false,
      reason: 'continuation-not-required',
    });
  });

  it('treats generated sibling source extensions as replacements for the active starter entry', () => {
    const assistantContent = [
      '<boltArtifact id="demo" title="Demo">',
      '<boltAction type="file" filePath="/src/App.jsx">export default function App() { return <main>Luma Clinic</main>; }</boltAction>',
      '<boltAction type="shell">pnpm install --no-frozen-lockfile</boltAction>',
      '<boltAction type="start">pnpm run dev</boltAction>',
      '</boltArtifact>',
    ].join('\n');

    expect(
      analyzeRunContinuation({
        chatMode: 'build',
        lastUserContent: 'Build a clinic scheduler and run it',
        assistantContent,
        alreadyAttempted: false,
        currentFiles: {
          '/home/project/src/App.tsx': {
            type: 'file',
            content: 'export default function App(){return <p>Your fallback starter is ready.</p>;}',
            isBinary: false,
          },
        } as unknown as FileMap,
      }),
    ).toEqual({
      shouldContinue: false,
      reason: 'continuation-not-required',
    });
  });

  it('returns reason when continuation is skipped due prior attempt', () => {
    const decision = analyzeRunContinuation({
      chatMode: 'build',
      alreadyAttempted: true,
      lastUserContent: 'Build a React scheduler app.',
      assistantContent: '<boltAction type="shell">pnpm install</boltAction>',
    });

    expect(decision.shouldContinue).toBe(false);
    expect(decision.reason).toBe('already-attempted');
  });

  it('synthesizes a runtime handoff when implementation files exist but start is missing', async () => {
    const handoff = await synthesizeRunHandoff({
      assistantContent: `
<boltArtifact id="artifact-1" title="package.json">
<boltAction type="file" filePath="package.json">{
  "name": "doctor-scheduler",
  "private": true,
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 5173"
  }
}</boltAction>
<boltAction type="file" filePath="src/App.tsx">export default function App(){return <div>Doctor schedule</div>;}</boltAction>
</boltArtifact>
`,
    });

    expect(handoff).toMatchObject({
      reason: 'inferred-project-commands',
      startCommand: 'npm run dev',
    });
    expect(handoff?.assistantContent).toContain('<boltAction type="shell">');
    expect(handoff?.assistantContent).toContain('<boltAction type="start">npm run dev</boltAction>');
  });

  it('does not synthesize a runtime handoff for starter-only scaffolds', async () => {
    const handoff = await synthesizeRunHandoff({
      assistantContent: `
<boltArtifact id="artifact-1" title="package.json">
<boltAction type="file" filePath="package.json">{
  "name": "starter",
  "private": true,
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 5173"
  }
}</boltAction>
<boltAction type="file" filePath="README.md"># starter</boltAction>
</boltArtifact>
`,
    });

    expect(handoff).toBeNull();
  });

  it('does not synthesize a runtime handoff until a concrete primary entry file exists', async () => {
    const handoff = await synthesizeRunHandoff({
      assistantContent: `
<boltArtifact id="artifact-1" title="doctor app">
<boltAction type="file" filePath="package.json">{
  "name": "doctor-scheduler",
  "private": true,
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 5173"
  }
}</boltAction>
<boltAction type="file" filePath="src/components/Header.tsx">export function Header(){return <header>Appointments</header>;}</boltAction>
<boltAction type="shell">pnpm install --no-frozen-lockfile</boltAction>
<boltAction type="start">pnpm run dev</boltAction>
</boltArtifact>
`,
    });

    expect(handoff).toBeNull();
  });

  it('does not synthesize a runtime handoff from a stale source snapshot without a manifest or new file actions', async () => {
    const handoff = await synthesizeRunHandoff({
      assistantContent: `
<boltArtifact id="runtime-only" title="Runtime">
<boltAction type="start">pnpm run dev</boltAction>
</boltArtifact>
`,
      currentFiles: {
        '/home/project/src/App.tsx': {
          type: 'file',
          isBinary: false,
          content: 'export default function App(){return <main>Existing app</main>;}',
        },
        '/home/project/src/main.tsx': {
          type: 'file',
          isBinary: false,
          content: 'import React from "react";',
        },
      } as FileMap,
    });

    expect(handoff).toBeNull();
  });

  it('does not synthesize a runtime handoff from request snapshot files when the response added no implementation', async () => {
    const handoff = await synthesizeRunHandoff({
      assistantContent: `
<boltArtifact id="runtime-only" title="Runtime">
<boltAction type="shell">pnpm dlx create-vite@latest . --template react --no-interactive --overwrite && pnpm install --reporter=append-only --no-frozen-lockfile</boltAction>
<boltAction type="start">pnpm run dev</boltAction>
</boltArtifact>
`,
      currentFiles: {
        '/home/project/package.json': {
          type: 'file',
          isBinary: false,
          content: '{"scripts":{"dev":"vite --host 0.0.0.0 --port 5173"}}',
        },
        '/home/project/src/App.jsx': {
          type: 'file',
          isBinary: false,
          content: 'export default function App(){return <main>Existing shell</main>;}',
        },
        '/home/project/src/main.jsx': {
          type: 'file',
          isBinary: false,
          content:
            "import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App.jsx';\n",
        },
      } as FileMap,
    });

    expect(handoff).toBeNull();
  });

  it('does not synthesize a runtime handoff from the stock Vite React starter', async () => {
    const handoff = await synthesizeRunHandoff({
      assistantContent: `
<boltArtifact id="runtime-only" title="Runtime">
<boltAction type="start">pnpm run dev</boltAction>
</boltArtifact>
`,
      currentFiles: {
        '/home/project/package.json': {
          type: 'file',
          isBinary: false,
          content: '{"scripts":{"dev":"vite --host 0.0.0.0 --port 5173"}}',
        },
        '/home/project/src/App.jsx': {
          type: 'file',
          isBinary: false,
          content: `
import { useState } from 'react';
import reactLogo from './assets/react.svg';
import viteLogo from '/vite.svg';

function App() {
  const [count, setCount] = useState(0);
  return <><h1>Vite + React</h1><button onClick={() => setCount((count) => count + 1)}>count is {count}</button></>;
}

export default App;
`,
        },
        '/home/project/src/main.jsx': {
          type: 'file',
          isBinary: false,
          content:
            "import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App.jsx';\n",
        },
      } as FileMap,
    });

    expect(handoff).toBeNull();
  });

  it('skips setup synthesis when install is already present', async () => {
    const handoff = await synthesizeRunHandoff({
      assistantContent: `
<boltAction type="shell">pnpm install</boltAction>
<boltArtifact id="artifact-1" title="package.json">
<boltAction type="file" filePath="package.json">{
  "name": "doctor-scheduler",
  "private": true,
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 5173"
  }
}</boltAction>
<boltAction type="file" filePath="src/App.tsx">export default function App(){return <div>Doctor schedule</div>;}</boltAction>
</boltArtifact>
`,
    });

    expect(handoff?.setupCommand).toContain('install');
    expect(handoff?.assistantContent).toContain('<boltAction type="shell">');
    expect(handoff?.assistantContent).toContain('<boltAction type="start">npm run dev</boltAction>');
  });

  it('synthesizes a runtime handoff from malformed package.json when the project shape is still clear', async () => {
    const handoff = await synthesizeRunHandoff({
      assistantContent: `
<boltArtifact id="artifact-1" title="doctor app">
<boltAction type="file" filePath="/home/project/package.json">{
  "name": "doctor-scheduler",
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 5173",
  }
}</boltAction>
<boltAction type="file" filePath="/home/project/vite.config.ts">import { defineConfig } from 'vite'; export default defineConfig({});</boltAction>
<boltAction type="file" filePath="/home/project/src/main.jsx">import React from 'react';</boltAction>
<boltAction type="file" filePath="/home/project/src/App.jsx">export default function App(){return <div>Doctor schedule</div>;}</boltAction>
</boltArtifact>
`,
    });

    expect(handoff).toMatchObject({
      reason: 'inferred-project-commands',
      startCommand: 'npm run dev',
    });
  });

  it('replays explicit runtime commands when preview was never verified', async () => {
    const handoff = await synthesizeRunHandoff({
      assistantContent: `
<boltArtifact id="artifact-1" title="doctor app">
<boltAction type="file" filePath="/home/project/package.json">{
  "name": "doctor-scheduler",
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 5173"
  }
}</boltAction>
<boltAction type="file" filePath="/home/project/src/App.jsx">export default function App(){return <div>Doctor schedule</div>;}</boltAction>
<boltAction type="shell">pnpm install --no-frozen-lockfile</boltAction>
<boltAction type="start">pnpm run dev</boltAction>
</boltArtifact>
`,
    });

    expect(handoff).toMatchObject({
      reason: 'inferred-project-commands',
      startCommand: 'pnpm run dev',
    });
    expect(handoff?.setupCommand).toContain('pnpm install --no-frozen-lockfile');
    expect(handoff?.assistantContent).toContain('<boltAction type="shell">');
    expect(handoff?.assistantContent).toContain('<boltAction type="start">pnpm run dev</boltAction>');
  });

  it('ignores natural-language start actions and falls back to inferred project commands', async () => {
    const handoff = await synthesizeRunHandoff({
      assistantContent: `
<boltArtifact id="artifact-1" title="notes app">
<boltAction type="file" filePath="/home/project/package.json">{
  "name": "northstar-notes",
  "private": true,
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 5173"
  }
}</boltAction>
<boltAction type="file" filePath="/home/project/src/App.jsx">export default function App(){return <div>Northstar Notes</div>;}</boltAction>
<boltAction type="shell">pnpm install --no-frozen-lockfile</boltAction>
<boltAction type="start">Starting Vite dev server for Northstar Notes...</boltAction>
</boltArtifact>
`,
    });

    expect(handoff).toMatchObject({
      reason: 'inferred-project-commands',
      startCommand: 'npm run dev',
    });
    expect(handoff?.setupCommand).toContain('npm install');
    expect(handoff?.assistantContent).toContain('<boltAction type="shell">');
    expect(handoff?.assistantContent).toContain('<boltAction type="start">npm run dev</boltAction>');
  });

  it('overrides an explicit start command when the generated package.json does not support it', async () => {
    const handoff = await synthesizeRunHandoff({
      assistantContent: `
<boltArtifact id="artifact-1" title="notes app">
<boltAction type="file" filePath="/home/project/package.json">{
  "name": "taskboard-pro",
  "private": true,
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build"
  }
}</boltAction>
<boltAction type="file" filePath="/home/project/vite.config.ts">import { defineConfig } from 'vite'; export default defineConfig({});</boltAction>
<boltAction type="file" filePath="/home/project/src/main.tsx">import React from 'react';</boltAction>
<boltAction type="file" filePath="/home/project/src/App.tsx">export default function App(){return <footer>FOLLOWUP</footer>;}</boltAction>
<boltAction type="shell">pnpm install --reporter=append-only --no-frozen-lockfile</boltAction>
<boltAction type="start">pnpm run dev</boltAction>
</boltArtifact>
`,
    });

    expect(handoff).toMatchObject({
      reason: 'inferred-project-commands',
      startCommand: 'npm run start',
    });
    expect(handoff?.setupCommand).toContain('npm install');
    expect(handoff?.assistantContent).toContain('<boltAction type="start">npm run start</boltAction>');
  });

  it('infers runtime handoff commands from the merged workspace state instead of a partial delta install', async () => {
    const handoff = await synthesizeRunHandoff({
      assistantContent: `
<boltAction type="shell">npm install moment</boltAction>
<boltAction type="file" filePath="src/App.tsx">export default function App(){return <div>Luma Clinic</div>;}</boltAction>
`,
      currentFiles: {
        'package.json': {
          type: 'file',
          isBinary: false,
          content: JSON.stringify({
            name: 'doctor-scheduler',
            private: true,
            scripts: {
              dev: 'vite',
              build: 'vite build',
              preview: 'vite preview',
            },
          }),
        },
        'src/main.tsx': {
          type: 'file',
          isBinary: false,
          content: 'import React from "react";',
        },
      } as FileMap,
    });

    expect(handoff).toMatchObject({
      reason: 'inferred-project-commands',
      startCommand: 'npm run dev',
    });
    expect(handoff?.setupCommand).toContain('npm install');
    expect(handoff?.setupCommand).not.toContain('moment');
    expect(handoff?.assistantContent).not.toContain('npx --yes serve');
  });

  it('does not synthesize runtime handoff while the merged starter entry still contains the fallback placeholder', async () => {
    const handoff = await synthesizeRunHandoff({
      assistantContent: `
<boltAction type="shell">pnpm install --no-frozen-lockfile</boltAction>
<boltAction type="file" filePath="src/App.tsx">export default function App(){return <p>Your fallback starter is ready.</p>;}</boltAction>
<boltAction type="file" filePath="src/index.css">@tailwind base;\n@tailwind components;\n@tailwind utilities;</boltAction>
`,
      currentFiles: {
        'package.json': {
          type: 'file',
          isBinary: false,
          content: JSON.stringify({
            name: 'doctor-scheduler',
            private: true,
            scripts: {
              dev: 'vite',
              build: 'vite build',
            },
          }),
        },
        'src/main.tsx': {
          type: 'file',
          isBinary: false,
          content: 'import React from "react";',
        },
      } as FileMap,
    });

    expect(handoff).toBeNull();
  });

  it('synthesizes runtime handoff when a generated sibling source extension replaces the starter entry', async () => {
    const handoff = await synthesizeRunHandoff({
      assistantContent: `
<boltAction type="file" filePath="/src/App.jsx">export default function App(){return <main>Luma Clinic</main>;}</boltAction>
<boltAction type="shell">pnpm install --no-frozen-lockfile</boltAction>
`,
      currentFiles: {
        '/home/project/package.json': {
          type: 'file',
          isBinary: false,
          content: JSON.stringify({
            name: 'clinic-scheduler',
            private: true,
            scripts: {
              dev: 'vite',
              build: 'vite build',
            },
          }),
        },
        '/home/project/src/App.tsx': {
          type: 'file',
          isBinary: false,
          content: 'export default function App(){return <p>Your fallback starter is ready.</p>;}',
        },
        '/home/project/src/main.tsx': {
          type: 'file',
          isBinary: false,
          content: 'import React from "react";',
        },
      } as FileMap,
    });

    expect(handoff).toMatchObject({
      reason: 'inferred-project-commands',
      startCommand: 'npm run dev',
    });
    expect(handoff?.setupCommand).toContain('npm install');
  });

  it('rewrites explicit npm runtime commands to pnpm when the generated project uses pnpm', async () => {
    const handoff = await synthesizeRunHandoff({
      assistantContent: `
<boltAction type="file" filePath="src/App.tsx">export default function App(){return <main>Scheduler Ready</main>;}</boltAction>
<boltAction type="shell">npm install</boltAction>
<boltAction type="start">npm run dev</boltAction>
`,
      currentFiles: {
        '/home/project/package.json': {
          type: 'file',
          isBinary: false,
          content: JSON.stringify({
            name: 'clinic-scheduler',
            private: true,
            scripts: {
              dev: 'vite',
              build: 'vite build',
            },
          }),
        },
        '/home/project/pnpm-lock.yaml': {
          type: 'file',
          isBinary: false,
          content: "lockfileVersion: '9.0'\n",
        },
        '/home/project/src/App.tsx': {
          type: 'file',
          isBinary: false,
          content: 'export default function App(){return <p>Your fallback starter is ready.</p>;}',
        },
        '/home/project/src/main.tsx': {
          type: 'file',
          isBinary: false,
          content: 'import React from "react";',
        },
      } as FileMap,
    });

    expect(handoff).toMatchObject({
      reason: 'inferred-project-commands',
      startCommand: 'pnpm run dev',
    });
    expect(handoff?.setupCommand).toContain('pnpm install --no-frozen-lockfile');
    expect(handoff?.setupCommand).not.toMatch(/\bnpm\s+install\b/i);
    expect(handoff?.assistantContent).toContain('<boltAction type="shell">');
    expect(handoff?.assistantContent).toContain('<boltAction type="start">pnpm run dev</boltAction>');
  });

  it('strips detached background operators from explicit runtime handoff start commands', async () => {
    const handoff = await synthesizeRunHandoff({
      assistantContent: `
<boltAction type="file" filePath="src/App.tsx">export default function App(){return <main>Scheduler Ready</main>;}</boltAction>
<boltAction type="shell">pnpm install</boltAction>
<boltAction type="start">pnpm run dev &</boltAction>
`,
      currentFiles: {
        '/home/project/package.json': {
          type: 'file',
          isBinary: false,
          content: JSON.stringify({
            name: 'clinic-scheduler',
            private: true,
            packageManager: 'pnpm@9.0.0',
            scripts: {
              dev: 'vite',
              build: 'vite build',
            },
          }),
        },
        '/home/project/src/App.tsx': {
          type: 'file',
          isBinary: false,
          content: 'export default function App(){return <p>Your fallback starter is ready.</p>;}',
        },
        '/home/project/src/main.tsx': {
          type: 'file',
          isBinary: false,
          content: 'import React from "react";',
        },
      } as FileMap,
    });

    expect(handoff).toMatchObject({
      reason: 'inferred-project-commands',
      startCommand: 'pnpm run dev',
    });
    expect(handoff?.assistantContent).toContain('<boltAction type="start">pnpm run dev</boltAction>');
    expect(handoff?.assistantContent).not.toContain('pnpm run dev &');
  });

  it('ignores node_modules package manifests when synthesizing runtime handoff commands', async () => {
    const handoff = await synthesizeRunHandoff({
      assistantContent: `
<boltAction type="file" filePath="src/App.tsx">export default function App(){return <main>Scheduler Ready</main>;}</boltAction>
<boltAction type="shell">npm install</boltAction>
<boltAction type="start">npm run dev</boltAction>
`,
      currentFiles: {
        '/home/project/node_modules/react/package.json': {
          type: 'file',
          isBinary: false,
          content: JSON.stringify({
            name: 'react',
            scripts: {
              start: 'node index.js',
            },
          }),
        },
        '/home/project/package.json': {
          type: 'file',
          isBinary: false,
          content: JSON.stringify({
            name: 'clinic-scheduler',
            private: true,
            scripts: {
              dev: 'vite',
              build: 'vite build',
            },
          }),
        },
        '/home/project/pnpm-lock.yaml': {
          type: 'file',
          isBinary: false,
          content: "lockfileVersion: '9.0'\n",
        },
        '/home/project/src/App.tsx': {
          type: 'file',
          isBinary: false,
          content: 'export default function App(){return <p>Your fallback starter is ready.</p>;}',
        },
        '/home/project/src/main.tsx': {
          type: 'file',
          isBinary: false,
          content: 'import React from "react";',
        },
      } as FileMap,
    });

    expect(handoff).toMatchObject({
      reason: 'inferred-project-commands',
      startCommand: 'pnpm run dev',
    });
    expect(handoff?.setupCommand).toContain('pnpm install --no-frozen-lockfile');
    expect(handoff?.setupCommand).not.toMatch(/\bnpm\s+install\b/i);
  });
});
