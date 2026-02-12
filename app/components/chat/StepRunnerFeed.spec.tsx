// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { InteractiveStepRunnerEvent } from '~/lib/runtime/interactive-step-runner';

vi.mock('~/lib/stores/workbench', async () => {
  const { atom } = await import('nanostores');
  const stepRunnerEvents = atom<InteractiveStepRunnerEvent[]>([]);

  return {
    workbenchStore: {
      stepRunnerEvents,
      clearStepRunnerEvents() {
        stepRunnerEvents.set([]);
      },
    },
  };
});

import { workbenchStore } from '~/lib/stores/workbench';

let StepRunnerFeed: (typeof import('./StepRunnerFeed'))['StepRunnerFeed'];

function createEvent(index: number, description: string): InteractiveStepRunnerEvent {
  return {
    type: 'step-start',
    timestamp: new Date(Date.now() + index).toISOString(),
    stepIndex: index,
    description,
  };
}

describe('StepRunnerFeed', () => {
  beforeAll(async () => {
    if (typeof window !== 'undefined') {
      (window as { __vite_plugin_react_preamble_installed__?: boolean }).__vite_plugin_react_preamble_installed__ =
        true;
    }

    StepRunnerFeed = (await import('./StepRunnerFeed')).StepRunnerFeed;
  });

  afterEach(() => {
    cleanup();
    workbenchStore.stepRunnerEvents.set([]);
  });

  it('renders the most recent 8 events in order', () => {
    const events = Array.from({ length: 9 }, (_, index) => createEvent(index, `step-${index + 1}`));
    workbenchStore.stepRunnerEvents.set(events);

    render(<StepRunnerFeed />);

    expect(screen.queryByText('Interactive Step Runner')).toBeTruthy();
    expect(screen.queryByText('step-1')).toBeNull();
    expect(screen.queryByText('step-2')).toBeTruthy();
    expect(screen.queryByText('step-9')).toBeTruthy();
  });

  it('clears events when the clear button is clicked', () => {
    workbenchStore.stepRunnerEvents.set([createEvent(0, 'step-clear-test')]);

    render(<StepRunnerFeed />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(workbenchStore.stepRunnerEvents.get()).toHaveLength(0);
  });

  it('shows a suggested fix hint for error events', () => {
    workbenchStore.stepRunnerEvents.set([
      {
        type: 'error',
        timestamp: new Date().toISOString(),
        stepIndex: 0,
        description: 'Run ESLint',
        exitCode: 1,
        error: 'lint failed',
      },
    ]);

    render(<StepRunnerFeed />);

    expect(screen.queryByText(/hint:/i)).toBeTruthy();
    expect(screen.queryByText(/pnpm run lint/i)).toBeTruthy();
  });
});
