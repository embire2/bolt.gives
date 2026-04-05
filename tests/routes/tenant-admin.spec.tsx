// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import type { FormHTMLAttributes } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const remixMocks = vi.hoisted(() => ({
  useLoaderData: vi.fn(),
  useActionData: vi.fn(),
  formProps: [] as Array<Record<string, unknown>>,
}));

vi.mock('@remix-run/react', () => ({
  Form: ({ children, reloadDocument, ...props }: FormHTMLAttributes<HTMLFormElement> & { reloadDocument?: boolean }) => {
    remixMocks.formProps.push({ ...props, reloadDocument });
    return <form {...props}>{children}</form>;
  },
  useLoaderData: remixMocks.useLoaderData,
  useActionData: remixMocks.useActionData,
}));

vi.mock('~/components/header/Header', () => ({
  Header: () => <div data-testid="header" />,
}));

vi.mock('~/components/ui/BackgroundRays', () => ({
  default: () => <div data-testid="background-rays" />,
}));

let TenantAdminPage: (typeof import('../../app/routes/tenant-admin'))['default'];

describe('TenantAdminPage', () => {
  beforeEach(async () => {
    (window as any).__vite_plugin_react_preamble_installed__ = true;
    remixMocks.useActionData.mockReturnValue(undefined);
    remixMocks.formProps.length = 0;
    remixMocks.useLoaderData.mockReturnValue({
      adminHost: true,
      supported: true,
      authenticated: true,
      adminPanelUrl: 'https://admin.bolt.gives',
      defaultAdmin: {
        username: 'admin',
        password: 'admin',
      },
      admin: {
        username: 'admin',
        mustChangePassword: false,
        updatedAt: '2026-04-04T12:00:00.000Z',
        passwordUpdatedAt: '2026-04-04T12:00:00.000Z',
        lastLoginAt: '2026-04-04T12:05:00.000Z',
      },
      tenants: [],
      clientProfiles: [
        {
          id: 'profile-1',
          name: 'Owner Example',
          email: 'owner@example.com',
          company: 'OpenWeb',
          role: 'Founder',
          phone: null,
          country: 'South Africa',
          useCase: 'Clinic scheduler',
          requestedSubdomain: 'clinic-trial',
          registrationSource: 'managed-instance:alpha1.bolt.gives',
          createdAt: '2026-04-04T11:00:00.000Z',
          updatedAt: '2026-04-04T11:00:00.000Z',
          lastInstanceSlug: 'clinic-trial',
          lastInstanceStatus: 'active',
          lastInstanceUrl: 'https://clinic-trial.pages.dev',
        },
      ],
      emailMessages: [],
      mailSupport: {
        configured: false,
        fromAddress: null,
        transportLabel: null,
        reason: 'SMTP is not configured on the runtime service yet.',
      },
      managedSupport: {
        supported: true,
        reason: null,
        trialDays: 15,
        rootDomain: 'pages.dev',
        sourceBranch: 'main',
      },
      managedInstances: [
        {
          id: 'instance-1',
          name: 'Clinic Trial',
          email: 'owner@example.com',
          projectName: 'clinic-trial',
          routeHostname: 'clinic-trial.pages.dev',
          pagesUrl: 'https://clinic-trial.pages.dev',
          plan: 'experimental-free-15d',
          status: 'active',
          createdAt: '2026-04-04T12:00:00.000Z',
          updatedAt: '2026-04-04T12:10:00.000Z',
          trialEndsAt: '2026-04-19T12:00:00.000Z',
          currentGitSha: 'abc1234',
          previousGitSha: null,
          lastRolloutAt: '2026-04-04T12:10:00.000Z',
          lastDeploymentUrl: 'https://clinic-trial.pages.dev',
          lastError: null,
          suspendedAt: null,
          expiredAt: null,
          sourceBranch: 'main',
        },
      ],
      auditTrail: [],
    });
    TenantAdminPage = (await import('../../app/routes/tenant-admin')).default;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the managed trial operator section with admin actions', () => {
    render(<TenantAdminPage />);

    expect(screen.getByText('Admin Panel')).toBeTruthy();
    expect(screen.getByText('Client Profiles')).toBeTruthy();
    expect(screen.getByText('Owner Example')).toBeTruthy();
    expect(screen.getByText('Managed Cloudflare Trials')).toBeTruthy();
    expect(screen.getByText('Clinic Trial')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Refresh deployment' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Suspend trial' })).toBeTruthy();
    expect(screen.queryByText(/CLOUDFLARE_API_TOKEN/i)).toBeNull();
  });

  it('uses enhanced auth submits so the app can apply the admin session before navigation', () => {
    remixMocks.formProps.length = 0;
    remixMocks.useLoaderData.mockReturnValue({
      adminHost: true,
      supported: true,
      authenticated: false,
      adminPanelUrl: 'https://admin.bolt.gives',
      defaultAdmin: {
        username: 'admin',
        password: 'admin',
      },
      admin: {
        username: 'admin',
        mustChangePassword: true,
        updatedAt: '2026-04-04T12:00:00.000Z',
        passwordUpdatedAt: '2026-04-04T12:00:00.000Z',
        lastLoginAt: null,
      },
      tenants: [],
      clientProfiles: [],
      emailMessages: [],
      mailSupport: {
        configured: false,
        fromAddress: null,
        transportLabel: null,
        reason: 'SMTP is not configured on the runtime service yet.',
      },
      managedSupport: {
        supported: true,
        reason: null,
        trialDays: 15,
        rootDomain: 'pages.dev',
        sourceBranch: 'main',
      },
      managedInstances: [],
      auditTrail: [],
    });

    render(<TenantAdminPage />);

    const loginFormProps = remixMocks.formProps.find((props) => props.method === 'post');
    expect(loginFormProps?.reloadDocument).not.toBe(true);
  });
});
