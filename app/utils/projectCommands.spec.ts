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
});
