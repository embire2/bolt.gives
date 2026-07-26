// @vitest-environment jsdom

(globalThis as any).__vite_plugin_react_preamble_installed__ = true;

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let CursorGlow: (typeof import('./CursorGlow'))['CursorGlow'];

describe('CursorGlow', () => {
  const originalMatchMedia = window.matchMedia;
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  const originalCancelAnimationFrame = window.cancelAnimationFrame;

  beforeAll(async () => {
    (window as any).__vite_plugin_react_preamble_installed__ = true;
    CursorGlow = (await import('./CursorGlow')).CursorGlow;
  });

  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: true,
        media: '(pointer: fine)',
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    Object.defineProperty(window, 'requestAnimationFrame', {
      writable: true,
      value: vi.fn((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      }),
    });

    Object.defineProperty(window, 'cancelAnimationFrame', {
      writable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', { writable: true, value: originalMatchMedia });
    Object.defineProperty(window, 'requestAnimationFrame', { writable: true, value: originalRequestAnimationFrame });
    Object.defineProperty(window, 'cancelAnimationFrame', { writable: true, value: originalCancelAnimationFrame });
  });

  it('updates glow position when the cursor moves', async () => {
    render(<CursorGlow />);

    await waitFor(() => {
      expect(document.querySelector('.bolt-cursor-glow')).not.toBeNull();
    });

    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 120, clientY: 180 }));

    await waitFor(() => {
      const glow = document.querySelector('.bolt-cursor-glow') as HTMLDivElement | null;
      expect(glow).not.toBeNull();
      expect(glow?.style.transform).toBe('translate3d(-120px, -60px, 0)');
      expect(glow?.style.opacity).toBe('1');
    });
  });
});
