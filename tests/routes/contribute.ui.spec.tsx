// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import type { AnchorHTMLAttributes } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@remix-run/react', () => ({
  Link: ({ children, to, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('~/components/header/Header', () => ({
  Header: () => <div data-testid="header" />,
}));

vi.mock('~/components/ui/BackgroundRays', () => ({
  default: () => <div data-testid="background-rays" />,
}));

let ContributePage: (typeof import('../../app/routes/contribute'))['default'];

describe('ContributePage', () => {
  beforeEach(async () => {
    (window as any).__vite_plugin_react_preamble_installed__ = true;
    ContributePage = (await import('../../app/routes/contribute')).default;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('keeps the no-form contributor page scrollable inside the app shell', () => {
    render(<ContributePage />);

    const main = screen.getByRole('main');
    expect(main.className).toContain('overflow-y-auto');
    expect(main.className).toContain('overflow-x-hidden');
    expect(main.className).toContain('flex-1');
    expect(main.parentElement?.className).not.toContain('overflow-hidden');
    expect(screen.getByText('Application form closed')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Apply to contribute/i })).toBeNull();
    expect(document.querySelector('form')).toBeNull();
  });
});
