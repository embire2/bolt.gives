// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

let SketchCanvas: (typeof import('./SketchCanvas'))['SketchCanvas'];

describe('SketchCanvas', () => {
  beforeAll(async () => {
    (window as any).__vite_plugin_react_preamble_installed__ = true;
    SketchCanvas = (await import('./SketchCanvas')).SketchCanvas;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('exports rectangles and text elements via onChange', async () => {
    const onChange = vi.fn();
    vi.spyOn(window, 'prompt').mockReturnValue('Header');

    const { container } = render(<SketchCanvas onChange={onChange} />);

    fireEvent.click(screen.getByTitle('Sketch canvas'));
    fireEvent.click(screen.getByText('Add Text'));

    const drawArea = container.querySelector('.cursor-crosshair') as HTMLDivElement | null;
    expect(drawArea).toBeTruthy();

    Object.defineProperty(drawArea as any, 'getBoundingClientRect', {
      value: () => ({
        left: 0,
        top: 0,
        width: 200,
        height: 200,
        right: 200,
        bottom: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    fireEvent.mouseDown(drawArea as Element, { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(drawArea as Element, { clientX: 60, clientY: 50 });
    fireEvent.mouseUp(drawArea as Element);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });

    const last = onChange.mock.calls.at(-1)?.[0] as Array<any>;
    expect(last.some((el) => el.type === 'text' && el.text === 'Header')).toBe(true);

    // width/height based on drag distance
    expect(
      last.some((el) => el.type === 'rect' && el.x === 10 && el.y === 10 && el.width === 50 && el.height === 40),
    ).toBe(true);
  });
});
