// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { JSONValue } from 'ai';

let ExecutionTransparencyPanel: (typeof import('./ExecutionTransparencyPanel'))['ExecutionTransparencyPanel'];

describe('ExecutionTransparencyPanel', () => {
  beforeAll(async () => {
    if (typeof window !== 'undefined') {
      (window as { __vite_plugin_react_preamble_installed__?: boolean }).__vite_plugin_react_preamble_installed__ =
        true;
    }

    ExecutionTransparencyPanel = (await import('./ExecutionTransparencyPanel')).ExecutionTransparencyPanel;
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the full sub-agent plan without truncation', () => {
    const tail = 'FINAL-PLAN-TAIL-SEGMENT';
    const longPlan = [
      '1. Gather context and inspect relevant files.',
      '2. Draft the minimal safe fix with clear steps.',
      '3. Validate behavior with targeted checks and confirm rollout notes.',
      `4. Ensure the final segment stays visible for admin review: ${tail}`,
    ].join('\n');

    const data = [
      {
        type: 'sub-agent',
        agentId: 'planner-1',
        agentType: 'planner',
        state: 'in-progress',
        model: 'gpt-5-codex',
        provider: 'OpenAI',
        plan: longPlan,
        createdAt: new Date().toISOString(),
      },
    ] as JSONValue[];

    render(<ExecutionTransparencyPanel data={data} model="gpt-5-codex" isStreaming />);

    expect(screen.queryByText(/Sub-agent Timeline/i)).toBeTruthy();
    expect(screen.queryByText(new RegExp(tail, 'i'))).toBeTruthy();
  });
});
