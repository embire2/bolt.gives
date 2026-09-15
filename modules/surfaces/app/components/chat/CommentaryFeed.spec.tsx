// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import type { JSONValue } from 'ai';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { workbenchStore } from '@bolt/project/lib/stores/workbench';
import { shouldUnlockPromptAfterPreviewReady } from './execution-status';

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

  it('shows restored health without allowing it to finalize a new prompt', () => {
    const events = [
      { type: 'telemetry' as const, timestamp: new Date().toISOString(), description: 'Preview health confirmed' },
    ];
    workbenchStore.stepRunnerEvents.set(events);
    render(<CommentaryFeed />);
    expect(screen.getByText('Preview is healthy and ready for inspection.')).toBeTruthy();
    expect(screen.queryByText(/Waiting for the first concrete runtime step/)).toBeNull();
    expect(shouldUnlockPromptAfterPreviewReady(events, 60_000, 1000)).toBe(false);
  });

  it('does not keep showing Ready after a later failed health check', () => {
    workbenchStore.stepRunnerEvents.set([
      { type: 'telemetry', timestamp: new Date().toISOString(), description: 'Preview verified' },
      { type: 'telemetry', timestamp: new Date().toISOString(), description: 'Preview health unavailable' },
    ]);
    render(<CommentaryFeed />);
    expect(screen.getByText('Preview has not passed its latest health check.')).toBeTruthy();
    expect(screen.queryByText(/^Ready$/)).toBeNull();
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

  it('does not report a completed historical command as still running', () => {
    const startedAt = new Date(Date.now() - 4_000).toISOString();
    const endedAt = new Date(Date.now() - 3_000).toISOString();

    workbenchStore.stepRunnerEvents.set([
      {
        type: 'step-start',
        timestamp: startedAt,
        description: 'Start application',
        stepIndex: 0,
      },
      {
        type: 'step-end',
        timestamp: endedAt,
        description: 'Start application',
        stepIndex: 0,
        exitCode: 0,
      },
      {
        type: 'complete',
        timestamp: new Date(Date.now() - 2_000).toISOString(),
        description: 'All steps complete',
      },
      {
        type: 'telemetry',
        timestamp: new Date().toISOString(),
        description: 'Preview verified',
      },
    ]);

    render(<CommentaryFeed data={[]} />);

    expect(screen.getByText(/^Ready$/i)).toBeTruthy();
    expect(screen.getByText(/workspace is ready for inspection/i)).toBeTruthy();
    expect(screen.queryByText(/Running Start application now/i)).toBeNull();
  });

  it('ignores a late transport heartbeat after a healthy Preview', () => {
    workbenchStore.stepRunnerEvents.set([
      { type: 'complete', timestamp: '2026-09-12T10:00:00Z' },
      { type: 'telemetry', timestamp: '2026-09-12T10:00:01Z', description: 'Preview verified' },
    ]);
    render(
      <CommentaryFeed
        data={[
          {
            type: 'agent-commentary',
            heartbeat: true,
            phase: 'action',
            status: 'in-progress',
            message: 'No new runtime event has landed yet',
            timestamp: '2026-09-12T10:00:10Z',
          },
        ]}
      />,
    );
    expect(screen.getByText(/^Ready$/)).toBeTruthy();
    expect(screen.queryByText(/No new runtime event/)).toBeNull();
  });

  it('does not call unverified generation Ready or reuse verification before a newer error', () => {
    workbenchStore.stepRunnerEvents.set([{ type: 'complete', timestamp: '2026-09-12T10:00:00Z' }]);

    const view = render(<CommentaryFeed data={[]} />);
    expect(screen.getByText(/^Verifying$/)).toBeTruthy();
    workbenchStore.stepRunnerEvents.set([
      { type: 'telemetry', timestamp: '2026-09-12T10:00:01Z', description: 'Preview verified' },
      { type: 'error', timestamp: '2026-09-12T10:00:02Z', error: 'server exited' },
    ]);
    view.rerender(<CommentaryFeed data={[]} />);
    expect(screen.queryByText(/^Ready$/)).toBeNull();
    expect(screen.getByText(/^Recovery$/)).toBeTruthy();
  });

  it('marks older in-progress commentary as superseded after verified completion', () => {
    const commentaryAt = new Date(Date.now() - 4_000).toISOString();
    const completedAt = new Date(Date.now() - 2_000).toISOString();
    const data = [
      {
        type: 'agent-commentary',
        phase: 'recovery',
        status: 'in-progress',
        order: 1,
        message: 'I am still restarting the preview.',
        timestamp: commentaryAt,
      },
    ] as JSONValue[];

    workbenchStore.stepRunnerEvents.set([
      {
        type: 'complete',
        timestamp: completedAt,
        description: 'All steps complete',
      },
      {
        type: 'telemetry',
        timestamp: new Date().toISOString(),
        description: 'Preview verified',
      },
    ]);

    render(<CommentaryFeed data={data} />);

    expect(screen.getByText(/^superseded$/i)).toBeTruthy();
    expect(screen.getByText(/^Ready$/i)).toBeTruthy();
  });
});
