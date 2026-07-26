// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

let SpeechRecognitionButton: (typeof import('./SpeechRecognition'))['SpeechRecognitionButton'];

describe('SpeechRecognitionButton', () => {
  beforeAll(async () => {
    (window as any).__vite_plugin_react_preamble_installed__ = true;
    SpeechRecognitionButton = (await import('./SpeechRecognition')).SpeechRecognitionButton;
  });

  afterEach(() => {
    cleanup();
  });

  it('calls onStart when not listening', () => {
    const onStart = vi.fn();
    const onStop = vi.fn();

    render(<SpeechRecognitionButton isListening={false} onStart={onStart} onStop={onStop} disabled={false} />);
    fireEvent.click(screen.getByTitle('Start speech recognition'));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledTimes(0);
  });

  it('calls onStop when listening', () => {
    const onStart = vi.fn();
    const onStop = vi.fn();

    render(<SpeechRecognitionButton isListening={true} onStart={onStart} onStop={onStop} disabled={false} />);
    fireEvent.click(screen.getByTitle('Stop listening'));

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledTimes(0);
  });
});
