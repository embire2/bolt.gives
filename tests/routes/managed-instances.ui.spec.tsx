// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import type { FormHTMLAttributes } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const remixMocks = vi.hoisted(() => ({
  useLoaderData: vi.fn(),
  useActionData: vi.fn(),
}));

vi.mock('@remix-run/react', () => ({
  Form: ({
    children,
    reloadDocument: _reloadDocument,
    ...props
  }: FormHTMLAttributes<HTMLFormElement> & { reloadDocument?: boolean }) => <form {...props}>{children}</form>,
  useLoaderData: remixMocks.useLoaderData,
  useActionData: remixMocks.useActionData,
}));

vi.mock('~/components/header/Header', () => ({
  Header: () => <div data-testid="header" />,
}));

vi.mock('~/components/ui/BackgroundRays', () => ({
  default: () => <div data-testid="background-rays" />,
}));

let ManagedInstancesPage: (typeof import('../../app/routes/managed-instances'))['default'];

describe('ManagedInstancesPage', () => {
  beforeEach(async () => {
    (window as any).__vite_plugin_react_preamble_installed__ = true;
    remixMocks.useActionData.mockReturnValue(undefined);
    remixMocks.useLoaderData.mockReturnValue({
      support: {
        supported: true,
        reason: null,
        trialDays: 15,
        rootDomain: 'pages.dev',
        sourceBranch: 'main',
      },
      instance: {
        id: 'instance-1',
        name: 'Clinic Trial',
        projectName: 'clinic-trial',
        routeHostname: 'clinic-trial-a1b.pages.dev',
        email: 'owner@example.com',
        pagesUrl: 'https://clinic-trial-a1b.pages.dev',
        trialEndsAt: '2026-04-19T12:00:00.000Z',
        plan: 'experimental-free-15d',
        currentGitSha: 'abc1234',
        previousGitSha: null,
        lastRolloutAt: '2026-04-04T12:10:00.000Z',
        lastDeploymentUrl: 'https://clinic-trial-a1b.pages.dev',
        status: 'active',
        createdAt: '2026-04-04T12:00:00.000Z',
        updatedAt: '2026-04-04T12:10:00.000Z',
        lastError: null,
        suspendedAt: null,
        expiredAt: null,
        sourceBranch: 'main',
      },
      sessionEmail: 'owner@example.com',
      sessionProjectName: 'clinic-trial',
    });
    ManagedInstancesPage = (await import('../../app/routes/managed-instances')).default;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders a success state with the assigned live instance details', () => {
    render(<ManagedInstancesPage />);

    expect(screen.getByText('Your bolt.gives server is live')).toBeTruthy();
    expect(screen.getByText('Server details')).toBeTruthy();
    expect(
      screen.getByRole('link', {
        name: 'https://clinic-trial-a1b.pages.dev',
      }),
    ).toBeTruthy();
    expect(screen.getByText(/Cloudflare assigned/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open live instance' })).toBeTruthy();
  });
});
