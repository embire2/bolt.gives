// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import type { JSONValue } from 'ai';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { workbenchStore } from '~/lib/stores/workbench';

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
    workbenchStore.clearStepRunnerEvents();
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
    expect(screen.getAllByText(/^Doing$/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/applying the smallest fix/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Corrected the broken import path/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Restarting the preview to verify the fix/i).length).toBeGreaterThan(0);
  });

  it('renders a live status summary when progress exists before commentary arrives', () => {
    const data = [
      {
        type: 'progress',
        label: 'response',
        status: 'in-progress',
        order: 1,
        message: 'Generating Response',
      },
    ] as JSONValue[];

    workbenchStore.stepRunnerEvents.set([
      {
        type: 'step-start',
        timestamp: new Date().toISOString(),
        description: 'Running pnpm install',
        stepIndex: 1,
      },
    ]);

    render(<CommentaryFeed data={data} />);

    expect(screen.getByText(/Current status/i)).toBeTruthy();
    expect(screen.getByText(/^Now:/i)).toBeTruthy();
    expect(screen.getByText(/Running pnpm install/i)).toBeTruthy();
    expect(screen.getByText(/Waiting for the first concrete runtime step/i)).toBeTruthy();
  });

  it('prioritizes terminal failures over stale generic commentary in the summary card', () => {
    const data = [
      {
        type: 'agent-commentary',
        phase: 'plan',
        status: 'in-progress',
        order: 1,
        message: 'I am gathering context and preparing the next step.',
        detail: 'Key changes: None yet.\nNext: I will continue with the next safe action.',
        timestamp: new Date(Date.now() - 10_000).toISOString(),
      },
    ] as JSONValue[];

    workbenchStore.stepRunnerEvents.set([
      {
        type: 'step-start',
        timestamp: new Date(Date.now() - 2_000).toISOString(),
        description: 'Run shell command: pnpm install',
        stepIndex: 1,
      },
      {
        type: 'error',
        timestamp: new Date().toISOString(),
        description: 'Run shell command: pnpm install',
        error: "ERROR Unknown option: 'progress'",
        stepIndex: 1,
      },
    ]);

    render(<CommentaryFeed data={data} />);

    expect(screen.getByText(/The last command failed/i)).toBeTruthy();
    expect(screen.getByText(/Unknown option: 'progress'/i)).toBeTruthy();
    expect(screen.getByText(/Architect is preparing the smallest safe fix/i)).toBeTruthy();
  });
});
