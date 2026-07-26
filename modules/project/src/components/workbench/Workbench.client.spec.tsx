// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('framer-motion', () => {
  const MotionNode = ({ children, layoutId: _layoutId, transition: _transition, ...props }: any) =>
    React.createElement('div', props, children);

  return {
    cubicBezier: () => 'ease-in-out',
    motion: {
      div: MotionNode,
      span: MotionNode,
    },
  };
});

vi.mock('@bolt/project/lib/webcontainer', () => ({
  webcontainer: Promise.resolve({
    on: vi.fn(),
    spawn: vi.fn().mockResolvedValue({
      input: new WritableStream<string>(),
      output: new ReadableStream<string>({
        start(controller) {
          controller.close();
        },
      }),
      exit: Promise.resolve(0),
      kill: vi.fn(),
    }),
    workdir: '/home/project',
    fs: {
      readFile: vi.fn(),
      readdir: vi.fn(),
      mkdir: vi.fn(),
      writeFile: vi.fn(),
      rm: vi.fn(),
    },
    internal: {
      watchPaths: vi.fn(() => undefined),
    },
  }),
}));

vi.mock('@bolt/project/lib/hooks', () => ({
  default: () => false,
}));

vi.mock('@radix-ui/react-dropdown-menu', () => ({
  Root: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Trigger: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  Content: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Item: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
}));

vi.mock('./EditorPanel', () => ({
  EditorPanel: () => <div data-testid="code-panel">Code panel</div>,
}));

vi.mock('./Preview', () => ({
  Preview: () => <div data-testid="preview-panel">Preview panel</div>,
}));

vi.mock('./DiffView', () => ({
  DiffView: () => <div data-testid="diff-panel">Diff panel</div>,
}));

vi.mock('./PerformanceMonitor', () => ({
  PerformanceMonitor: () => <div>Performance monitor</div>,
}));

vi.mock('./WorkbenchExportButton', () => ({
  WorkbenchExportButton: () => <button type="button">Export</button>,
}));

vi.mock('~/components/chat/CommentaryFeed', () => ({
  CommentaryFeed: () => <div>Commentary feed</div>,
}));

vi.mock('~/components/chat/StepRunnerFeed', () => ({
  StepRunnerFeed: () => <div>Step runner feed</div>,
}));

vi.mock('~/components/chat/ExecutionTransparencyPanel', () => ({
  ExecutionTransparencyPanel: () => <div>Execution transparency</div>,
}));

let Workbench: (typeof import('./Workbench.client'))['Workbench'];
let buildWorkspaceSummary: (typeof import('./Workbench.client'))['buildWorkspaceSummary'];
let workbenchStore: (typeof import('@bolt/project/lib/stores/workbench'))['workbenchStore'];

describe('Workbench view selection', () => {
  beforeAll(async () => {
    (window as { __vite_plugin_react_preamble_installed__?: boolean }).__vite_plugin_react_preamble_installed__ = true;
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
      writable: true,
    });

    const workbenchModule = await import('./Workbench.client');
    Workbench = workbenchModule.Workbench;
    buildWorkspaceSummary = workbenchModule.buildWorkspaceSummary;
    workbenchStore = (await import('@bolt/project/lib/stores/workbench')).workbenchStore;
  });

  afterEach(() => {
    cleanup();
    workbenchStore.previews.set([]);
    workbenchStore.files.set({});
    workbenchStore.setSelectedFile(undefined);
    workbenchStore.currentView.set('code');
    workbenchStore.userSelectedView.set(undefined);
    workbenchStore.clearStepRunnerEvents();
  });

  it('does not jump back to preview after the user selects code', async () => {
    render(<Workbench embedded forceVisible chatStarted />);

    act(() => {
      workbenchStore.previews.set([
        {
          port: 5173,
          ready: true,
          baseUrl: 'http://localhost:5173',
        },
      ]);
    });

    await waitFor(() => {
      expect(workbenchStore.currentView.get()).toBe('preview');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Code' }));

    await waitFor(() => {
      expect(workbenchStore.currentView.get()).toBe('code');
    });

    act(() => {
      workbenchStore.currentView.set('preview');
    });

    await waitFor(() => {
      expect(workbenchStore.currentView.get()).toBe('code');
    });
    expect(screen.getByTestId('code-panel')).toBeTruthy();
  });

  it('reports preview ready after a historical shell step has completed', () => {
    const startedAt = new Date(Date.now() - 3_000).toISOString();
    const completedAt = new Date(Date.now() - 2_000).toISOString();

    expect(
      buildWorkspaceSummary({
        data: [
          {
            type: 'progress',
            label: 'response',
            status: 'in-progress',
            order: 1,
            message: 'Generating Response',
          },
          {
            type: 'progress',
            label: 'response',
            status: 'complete',
            order: 2,
            message: 'Response Generated',
          },
        ],
        stepRunnerEvents: [
          { type: 'step-start', timestamp: startedAt, description: 'Start application', stepIndex: 0 },
          { type: 'step-end', timestamp: completedAt, description: 'Start application', stepIndex: 0, exitCode: 0 },
          { type: 'telemetry', timestamp: new Date().toISOString(), description: 'Preview verified' },
        ],
        isStreaming: false,
        hasPreview: true,
      }).stateLabel,
    ).toBe('Preview ready');
  });

  it('keeps one stable working state while an automatic preview repair is running', () => {
    const summary = buildWorkspaceSummary({
      data: [],
      stepRunnerEvents: [],
      alert: {
        type: 'error',
        title: 'Preview Error',
        description: 'The preview is restarting after a dependency fix.',
        content: 'Restart in progress.',
        source: 'preview',
      },
      isStreaming: true,
      hasPreview: true,
    });

    expect(summary.stateLabel).toBe('Working');
    expect(summary.current).toContain('preview is restarting');
  });
});
