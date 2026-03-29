import { afterEach, describe, expect, it, vi } from 'vitest';
import { PromptLibrary, type PromptOptions } from './prompt-library';

const options: PromptOptions = {
  cwd: '/home/project',
  allowedHtmlElements: [],
  modificationTagName: 'bolt-modification',
};

describe('PromptLibrary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to the default prompt when an unknown prompt id is requested', () => {
    const fallback = PromptLibrary.getPromptFromLibrary('missing-prompt', options);
    const directDefault = PromptLibrary.getPromptFromLibrary('default', options);

    expect(fallback).toBe(directDefault);
  });

  it('accepts undefined prompt ids without throwing', () => {
    const prompt = PromptLibrary.getPromptFromLibrary(undefined, options);

    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('falls back safely when the requested prompt generator throws', () => {
    const directDefault = PromptLibrary.getPromptFromLibrary('default', options);
    vi.spyOn(PromptLibrary.library.optimized, 'get').mockImplementation(() => {
      throw new Error('boom');
    });

    const fallback = PromptLibrary.getPromptFromLibrary('optimized', options);

    expect(fallback).toBe(directDefault);
  });
});
