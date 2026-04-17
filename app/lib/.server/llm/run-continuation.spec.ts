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

    expect(handoff?.setupCommand).toBe('pnpm install');
    expect(handoff?.assistantContent).toContain('<boltAction type="shell">pnpm install</boltAction>');
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
<boltAction type="shell">npx update-browserslist-db@latest && pnpm install --no-frozen-lockfile</boltAction>
<boltAction type="start">pnpm run dev</boltAction>
</boltArtifact>
`,
    });

    expect(handoff).toMatchObject({
      reason: 'inferred-project-commands',
      setupCommand: 'npx update-browserslist-db@latest && pnpm install --no-frozen-lockfile',
      startCommand: 'pnpm run dev',
    });
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
      setupCommand: 'pnpm install --no-frozen-lockfile',
      startCommand: 'npm run dev',
    });
    expect(handoff?.assistantContent).toContain(
      '<boltAction type="shell">pnpm install --no-frozen-lockfile</boltAction>',
    );
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
      setupCommand: 'pnpm install --reporter=append-only --no-frozen-lockfile',
      startCommand: 'npm run start',
    });
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
});
