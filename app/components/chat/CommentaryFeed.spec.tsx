// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import type { JSONValue } from 'ai';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

let CommentaryFeed: (typeof import('./CommentaryFeed'))['CommentaryFeed'];

describe('CommentaryFeed', () => {
  beforeAll(async () => {
    if (typeof window !== 'undefined') {
      (window as { __vite_plugin_react_preamble_installed__?: boolean }).__vite_plugin_react_preamble_installed__ =
        true;
    }

    CommentaryFeed = (await import('./CommentaryFeed')).CommentaryFeed;
  });

  afterEach(() => {
    cleanup();
  });

  it('renders commentary cards with contract details', () => {
    const data = [
      {
        type: 'agent-commentary',
        phase: 'action',
        status: 'in-progress',
        order: 1,
        message: 'I am applying the smallest fix that restores the preview.',
        detail: 'Key changes: Corrected the broken import path.\nNext: Restarting the preview to verify the fix.',
        timestamp: new Date().toISOString(),
      },
    ] as JSONValue[];

    render(<CommentaryFeed data={data} />);

    expect(screen.queryByText(/Live Commentary/i)).toBeTruthy();
    expect(screen.queryByText(/^Doing$/i)).toBeTruthy();
    expect(screen.queryByText(/applying the smallest fix/i)).toBeTruthy();
    expect(screen.queryByText(/Corrected the broken import path/i)).toBeTruthy();
    expect(screen.queryByText(/Restarting the preview to verify the fix/i)).toBeTruthy();
  });

  it('returns nothing when there are no commentary events', () => {
    const data = [
      {
        type: 'checkpoint',
        checkpointType: 'preview-ready',
        status: 'complete',
        message: 'Preview is ready.',
        timestamp: new Date().toISOString(),
      },
    ] as JSONValue[];

    const { container } = render(<CommentaryFeed data={data} />);

    expect(container.firstChild).toBeNull();
  });
});
