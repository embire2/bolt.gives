import { describe, expect, it } from 'vitest';
import { shouldEnableBuiltInWebTools } from './tool-intent';

describe('shouldEnableBuiltInWebTools', () => {
  it('enables web tools when user asks to browse docs', () => {
    const enabled = shouldEnableBuiltInWebTools([
      {
        role: 'user',
        content: 'Study these API documentation links and summarize them for me.',
      } as any,
    ]);

    expect(enabled).toBe(true);
  });

  it('enables web tools when user provides an external URL', () => {
    const enabled = shouldEnableBuiltInWebTools([
      {
        role: 'user',
        content: 'Read https://example.com/docs and create an md summary.',
      } as any,
    ]);

    expect(enabled).toBe(true);
  });

  it('keeps web tools disabled for plain local scaffolding requests', () => {
    const enabled = shouldEnableBuiltInWebTools([
      {
        role: 'user',
        content: 'Create a mini Node + React website in this workspace and run it.',
      } as any,
    ]);

    expect(enabled).toBe(false);
  });
});
