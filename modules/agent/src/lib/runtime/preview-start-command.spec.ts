import { describe, expect, it } from 'vitest';
import { normalizePreviewStartCommand } from './preview-start-command';

describe('normalizePreviewStartCommand', () => {
  it('drops model-authored background polling after a preview start command', () => {
    expect(normalizePreviewStartCommand('pnpm run dev & sleep 4 curl -s http://localhost:5173 | head -100')).toEqual({
      command: 'pnpm run dev',
      discardedVerification: true,
      isPreviewStart: true,
    });
  });

  it('recognizes standalone framework preview commands', () => {
    expect(normalizePreviewStartCommand('vite --host 0.0.0.0 --port 5173')).toMatchObject({
      command: 'vite --host 0.0.0.0 --port 5173',
      isPreviewStart: true,
    });
  });

  it('does not auto-normalize unrelated compound commands', () => {
    expect(normalizePreviewStartCommand('pnpm run dev & rm -rf output')).toMatchObject({
      command: 'pnpm run dev & rm -rf output',
      isPreviewStart: false,
    });
  });
});
