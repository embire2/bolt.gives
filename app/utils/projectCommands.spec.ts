import { describe, expect, it } from 'vitest';
import { detectProjectCommands } from './projectCommands';

describe('detectProjectCommands', () => {
  it('prefers live dev/start commands over preview for first-run projects', async () => {
    const commands = await detectProjectCommands([
      {
        path: '/package.json',
        content: JSON.stringify({
          scripts: {
            dev: 'vite',
            build: 'vite build',
            preview: 'vite preview --host 0.0.0.0 --port 4173',
          },
        }),
      },
    ]);

    expect(commands.startCommand).toBe('npm run dev');
    expect(commands.followupMessage).toContain('npm run dev');
  });

  it('only falls back to preview when a built output already exists', async () => {
    const commands = await detectProjectCommands([
      {
        path: '/package.json',
        content: JSON.stringify({
          scripts: {
            preview: 'vite preview --host 0.0.0.0 --port 4173',
          },
        }),
      },
      {
        path: '/dist/index.html',
        content: '<!doctype html><html><body>ready</body></html>',
      },
    ]);

    expect(commands.startCommand).toBe('npm run preview');
    expect(commands.followupMessage).toContain('production build already exists');
  });

  it('does not use preview as a first-run start command when no built output exists', async () => {
    const commands = await detectProjectCommands([
      {
        path: '/package.json',
        content: JSON.stringify({
          scripts: {
            preview: 'vite preview --host 0.0.0.0 --port 4173',
          },
        }),
      },
    ]);

    expect(commands.startCommand).toBeUndefined();
  });

  it('falls back to inferred Vite commands when package.json is malformed', async () => {
    const commands = await detectProjectCommands([
      {
        path: '/package.json',
        content: `{
          "name": "doctor-scheduler",
          "scripts": {
            "dev": "vite --host 0.0.0.0 --port 5173",
          }
        }`,
      },
      {
        path: '/vite.config.ts',
        content: 'import { defineConfig } from "vite"; export default defineConfig({});',
      },
      {
        path: '/src/main.jsx',
        content: 'import React from "react";',
      },
    ]);

    expect(commands.startCommand).toBe('npm run dev');
    expect(commands.followupMessage).toContain('Inferred');
  });

  it('uses the declared package manager when inferring fallback commands', async () => {
    const commands = await detectProjectCommands([
      {
        path: '/package.json',
        content: `{
          "name": "doctor-scheduler",
          "packageManager": "pnpm@9.0.0",
          "scripts": {
            "dev": "vite --host 0.0.0.0 --port 5173"
          }
        }`,
      },
      {
        path: '/src/main.tsx',
        content: 'console.log("ready");',
      },
    ]);

    expect(commands.setupCommand).toContain('pnpm install');
    expect(commands.startCommand).toBe('pnpm run dev');
  });

  it('prefers the root package.json over node_modules package manifests', async () => {
    const commands = await detectProjectCommands([
      {
        path: '/node_modules/react/package.json',
        content: JSON.stringify({
          name: 'react',
          scripts: {
            start: 'node index.js',
          },
        }),
      },
      {
        path: '/package.json',
        content: JSON.stringify({
          name: 'doctor-scheduler',
          scripts: {
            dev: 'vite',
            build: 'vite build',
          },
        }),
      },
      {
        path: '/pnpm-lock.yaml',
        content: "lockfileVersion: '9.0'\n",
      },
      {
        path: '/src/main.tsx',
        content: 'console.log("ready");',
      },
    ]);

    expect(commands.setupCommand).toContain('pnpm install');
    expect(commands.startCommand).toBe('pnpm run dev');
  });
});
