import { describe, expect, it } from 'vitest';
import {
  STARTER_BOOTSTRAP_OBSERVATION_TIMEOUT_MS,
  getStarterBootstrapRuntimeActionStatus,
  selectMissingStarterBootstrapRuntimeActions,
  shouldWaitForStarterBootstrapObservation,
  shouldWaitForStarterContinuation,
  shouldRunImmediateStarterBootstrapRuntime,
} from './starter-bootstrap-runtime';

describe('selectMissingStarterBootstrapRuntimeActions', () => {
  it('returns install and start commands when no runtime bootstrap actions are present', () => {
    const actions = selectMissingStarterBootstrapRuntimeActions(
      {
        installCommand: 'pnpm install --reporter=append-only',
        startCommand: 'pnpm run dev',
      },
      [],
    );

    expect(actions).toEqual([
      {
        type: 'shell',
        content: 'pnpm install --reporter=append-only',
      },
      {
        type: 'start',
        content: 'pnpm run dev',
      },
    ]);
  });

  it('skips runtime commands that already exist on the workbench', () => {
    const actions = selectMissingStarterBootstrapRuntimeActions(
      {
        installCommand: 'pnpm install --reporter=append-only',
        startCommand: 'pnpm run dev',
      },
      [
        {
          type: 'shell',
          content: 'pnpm install --reporter=append-only',
        },
        {
          type: 'start',
          content: 'pnpm run dev',
        },
      ],
    );

    expect(actions).toEqual([]);
  });

  it('still dispatches a missing start command when install already exists', () => {
    const actions = selectMissingStarterBootstrapRuntimeActions(
      {
        installCommand: 'pnpm install --reporter=append-only',
        startCommand: 'pnpm run dev',
      },
      [
        {
          type: 'shell',
          content: 'pnpm install --reporter=append-only',
        },
      ],
    );

    expect(actions).toEqual([
      {
        type: 'start',
        content: 'pnpm run dev',
      },
    ]);
  });

  it('skips immediate fallback runtime bootstrap on hosted instances', () => {
    expect(
      shouldRunImmediateStarterBootstrapRuntime({
        commands: {
          installCommand: 'pnpm install --reporter=append-only',
          startCommand: 'pnpm run dev',
        },
        hostedRuntimeEnabled: true,
        usingLocalFallback: true,
      }),
    ).toBe(false);
  });

  it('skips eager fallback runtime bootstrap for local browser execution too', () => {
    expect(
      shouldRunImmediateStarterBootstrapRuntime({
        commands: {
          installCommand: 'pnpm install --reporter=append-only',
          startCommand: 'pnpm run dev',
        },
        hostedRuntimeEnabled: false,
        usingLocalFallback: true,
      }),
    ).toBe(false);
  });

  it('reports a starter command as pending while the matching workbench action is still queued', () => {
    expect(
      getStarterBootstrapRuntimeActionStatus(
        [
          {
            type: 'shell',
            content: 'pnpm install --reporter=append-only --no-frozen-lockfile',
            status: 'pending',
          },
        ],
        'pnpm install --reporter=append-only --no-frozen-lockfile',
      ),
    ).toBe('pending');
  });

  it('prefers active runtime work over older failed attempts for the same command', () => {
    expect(
      getStarterBootstrapRuntimeActionStatus(
        [
          {
            type: 'start',
            content: 'pnpm run dev',
            status: 'failed',
          },
          {
            type: 'start',
            content: 'pnpm run dev',
            status: 'running',
          },
        ],
        'pnpm run dev',
      ),
    ).toBe('running');
  });

  it('returns idle when the workbench has not queued the command yet', () => {
    expect(getStarterBootstrapRuntimeActionStatus([], 'pnpm run dev')).toBe('idle');
  });

  it('waits for starter continuation while install is still running', () => {
    expect(
      shouldWaitForStarterContinuation({
        installStatus: 'running',
        startStatus: 'idle',
      }),
    ).toBe(true);
  });

  it('does not block starter continuation once install is done and the dev server is already running', () => {
    expect(
      shouldWaitForStarterContinuation({
        installStatus: 'complete',
        startStatus: 'running',
      }),
    ).toBe(false);
  });

  it('waits briefly while starter bootstrap commands have not been observed yet', () => {
    expect(
      shouldWaitForStarterBootstrapObservation({
        commands: {
          installCommand: 'pnpm install --reporter=append-only',
          startCommand: 'pnpm run dev',
        },
        installStatus: 'idle',
        startStatus: 'idle',
        queuedAt: 1000,
        now: 1000 + STARTER_BOOTSTRAP_OBSERVATION_TIMEOUT_MS - 1,
      }),
    ).toBe(true);
  });

  it('stops waiting once the starter bootstrap observation grace period expires', () => {
    expect(
      shouldWaitForStarterBootstrapObservation({
        commands: {
          installCommand: 'pnpm install --reporter=append-only',
          startCommand: 'pnpm run dev',
        },
        installStatus: 'idle',
        startStatus: 'idle',
        queuedAt: 1000,
        now: 1000 + STARTER_BOOTSTRAP_OBSERVATION_TIMEOUT_MS,
      }),
    ).toBe(false);
  });

  it('keeps waiting after the grace period once runtime recovery is already being dispatched', () => {
    expect(
      shouldWaitForStarterBootstrapObservation({
        commands: {
          installCommand: 'pnpm install --reporter=append-only',
          startCommand: 'pnpm run dev',
        },
        installStatus: 'idle',
        startStatus: 'idle',
        queuedAt: 1000,
        now: 1000 + STARTER_BOOTSTRAP_OBSERVATION_TIMEOUT_MS + 5000,
        recoveryTriggered: true,
      }),
    ).toBe(true);
  });

  it('does not wait once the install finished and only the start action is missing', () => {
    expect(
      shouldWaitForStarterBootstrapObservation({
        commands: {
          installCommand: 'pnpm install --reporter=append-only',
          startCommand: 'pnpm run dev',
        },
        installStatus: 'complete',
        startStatus: 'idle',
        queuedAt: 1000,
        now: 1000 + 1000,
      }),
    ).toBe(false);
  });
});
