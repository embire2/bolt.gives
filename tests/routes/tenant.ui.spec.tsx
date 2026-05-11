// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import type { FormHTMLAttributes } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const remixMocks = vi.hoisted(() => ({
  useLoaderData: vi.fn(),
  useActionData: vi.fn(),
}));

vi.mock('@remix-run/react', () => ({
  Form: ({ children, ...props }: FormHTMLAttributes<HTMLFormElement>) => <form {...props}>{children}</form>,
  useLoaderData: remixMocks.useLoaderData,
  useActionData: remixMocks.useActionData,
}));

vi.mock('~/components/header/Header', () => ({
  Header: () => <div data-testid="header" />,
}));

vi.mock('~/components/ui/BackgroundRays', () => ({
  default: () => <div data-testid="background-rays" />,
}));

let TenantPortalPage: (typeof import('../../app/routes/tenant'))['default'];

describe('TenantPortalPage', () => {
  beforeEach(async () => {
    (window as any).__vite_plugin_react_preamble_installed__ = true;
    remixMocks.useActionData.mockReturnValue(undefined);
    remixMocks.useLoaderData.mockReturnValue({
      authenticated: false,
      tenant: null,
      invite: null,
    });
    TenantPortalPage = (await import('../../app/routes/tenant')).default;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('keeps tenant details scrollable inside the app shell', () => {
    render(<TenantPortalPage />);

    const main = screen.getByRole('main');
    expect(main.className).toContain('overflow-y-auto');
    expect(main.className).toContain('overflow-x-hidden');
    expect(main.className).toContain('flex-1');
    expect(main.className).toContain('min-h-0');
    expect(main.parentElement?.className).toContain('h-full');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
  });
});
