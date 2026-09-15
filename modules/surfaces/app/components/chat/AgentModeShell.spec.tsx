// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

let AgentModeShell: typeof import('./AgentModeShell').AgentModeShell;

beforeAll(async () => {
  (window as Window & { __vite_plugin_react_preamble_installed__?: boolean }).__vite_plugin_react_preamble_installed__ =
    true;
  AgentModeShell = (await import('./AgentModeShell')).AgentModeShell;
});

afterEach(cleanup);

describe('Agent Mode status contrast', () => {
  it.each([
    [true, 'Working', 'sky'],
    [false, 'Needs repair', 'amber'],
    [false, 'Ready', 'emerald'],
  ] as const)('keeps %s/%s readable in both themes', (isStreaming, statusLabel, color) => {
    render(
      <AgentModeShell
        conversation={null}
        workspace={null}
        composer={null}
        isStreaming={isStreaming}
        statusLabel={statusLabel}
        modeLabel="Build"
      />,
    );

    const badge = screen.getByText(statusLabel).parentElement!;
    expect(badge.classList.contains(`text-${color}-800`)).toBe(true);
    expect(badge.classList.contains(`dark:text-${color}-300`)).toBe(true);
    expect(badge.classList.contains(`text-${color}-300`)).toBe(false);
  });
});
