// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { workbenchStore } from '~/lib/stores/workbench';

vi.mock('~/lib/webcontainer', () => ({
  webcontainer: Promise.resolve({
    on: vi.fn(),
    spawn: vi.fn(),
    setPreviewScript: vi.fn(),
    workdir: '/home/project',
    fs: {
      readFile: vi.fn().mockResolvedValue(''),
      readdir: vi.fn().mockResolvedValue([]),
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
      rm: vi.fn().mockResolvedValue(undefined),
    },
    internal: {
      watchPaths: vi.fn(() => undefined),
    },
  }),
}));

let Artifact: (typeof import('./Artifact'))['Artifact'];

describe('Artifact', () => {
  beforeAll(async () => {
    if (typeof window !== 'undefined') {
      (window as { __vite_plugin_react_preamble_installed__?: boolean }).__vite_plugin_react_preamble_installed__ =
        true;
    }

    Artifact = (await import('./Artifact')).Artifact;
  });

  beforeEach(() => {
    workbenchStore.artifacts.set({});
  });

  afterEach(() => {
    cleanup();
    workbenchStore.artifacts.set({});
  });

  it('renders a safe placeholder while the workspace artifact is still registering', () => {
    render(<Artifact messageId="message-1" artifactId="artifact-missing" />);

    expect(screen.getByText(/Preparing workspace/i)).toBeTruthy();
    expect(screen.getByText(/Waiting for workspace details and file actions/i)).toBeTruthy();
    expect(screen.getByText(/Waiting for the workspace to finish initializing/i)).toBeTruthy();
  });
});
