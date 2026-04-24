import type { ActionType } from '~/types/actions';
import type { ActionStatus } from '~/lib/runtime/action-runner';
import type { StarterTemplateBootstrapCommands } from '~/utils/selectStarterTemplate';

type RuntimeActionType = Extract<ActionType, 'shell' | 'start'>;
export type StarterBootstrapRuntimeActionStatus = ActionStatus | 'idle';

export type StarterBootstrapRuntimeAction = {
  type: RuntimeActionType;
  content: string;
  status?: ActionStatus;
};

export const STARTER_BOOTSTRAP_OBSERVATION_TIMEOUT_MS = 8000;

export function normalizeStarterBootstrapCommand(command: string | undefined): string | null {
  const normalized = command?.trim().replace(/\s+/g, ' ') || '';

  return normalized.length > 0 ? normalized : null;
}

const ACTION_STATUS_PRIORITY: Record<StarterBootstrapRuntimeActionStatus, number> = {
  idle: 0,
  complete: 1,
  aborted: 2,
  failed: 3,
  pending: 4,
  running: 5,
};

export function getStarterBootstrapRuntimeActionStatus(
  actions: StarterBootstrapRuntimeAction[],
  command: string | undefined,
): StarterBootstrapRuntimeActionStatus {
  const normalizedCommand = normalizeStarterBootstrapCommand(command);

  if (!normalizedCommand) {
    return 'idle';
  }

  let resolvedStatus: StarterBootstrapRuntimeActionStatus = 'idle';

  for (const action of actions) {
    const normalizedCandidate = normalizeStarterBootstrapCommand(action.content);

    if (
      !normalizedCandidate ||
      (!normalizedCandidate.includes(normalizedCommand) && !normalizedCommand.includes(normalizedCandidate))
    ) {
      continue;
    }

    const nextStatus = action.status || 'complete';

    if (ACTION_STATUS_PRIORITY[nextStatus] > ACTION_STATUS_PRIORITY[resolvedStatus]) {
      resolvedStatus = nextStatus;
    }

    if (resolvedStatus === 'running') {
      return resolvedStatus;
    }
  }

  return resolvedStatus;
}

export function shouldWaitForStarterContinuation(options: {
  installStatus: StarterBootstrapRuntimeActionStatus;
  startStatus: StarterBootstrapRuntimeActionStatus;
}): boolean {
  return (
    options.installStatus === 'pending' || options.installStatus === 'running' || options.startStatus === 'pending'
  );
}

export function shouldWaitForStarterBootstrapObservation(options: {
  commands: StarterTemplateBootstrapCommands | undefined;
  installStatus: StarterBootstrapRuntimeActionStatus;
  startStatus: StarterBootstrapRuntimeActionStatus;
  queuedAt: number | null | undefined;
  now?: number;
  observationTimeoutMs?: number;
  recoveryTriggered?: boolean;
}): boolean {
  if (!normalizeStarterBootstrapCommand(options.commands?.startCommand)) {
    return false;
  }

  if (options.startStatus !== 'idle') {
    return false;
  }

  if (normalizeStarterBootstrapCommand(options.commands?.installCommand) && options.installStatus !== 'idle') {
    return false;
  }

  if (options.recoveryTriggered) {
    return true;
  }

  const queuedAt = options.queuedAt ?? 0;

  if (queuedAt <= 0) {
    return false;
  }

  const now = options.now ?? Date.now();
  const observationTimeoutMs = options.observationTimeoutMs ?? STARTER_BOOTSTRAP_OBSERVATION_TIMEOUT_MS;

  return now - queuedAt < observationTimeoutMs;
}

export function shouldRunImmediateStarterBootstrapRuntime(options: {
  commands: StarterTemplateBootstrapCommands | undefined;
  hostedRuntimeEnabled: boolean;
  usingLocalFallback: boolean;
}): boolean {
  const hasBootstrapCommands = Boolean(options.commands?.installCommand || options.commands?.startCommand);

  if (!options.usingLocalFallback || !hasBootstrapCommands) {
    return false;
  }

  /*
   * Starter assistant artifacts already contain the scaffold/install/start actions.
   * Eagerly replaying those commands from the client races the parser/workbench queue and can
   * steal the shared shell before the artifact's own start action gets a chance to run.
   * Let the parsed artifact actions and the later preview-recovery path own bootstrap sequencing.
   */
  return false;
}

export function selectMissingStarterBootstrapRuntimeActions(
  commands: StarterTemplateBootstrapCommands | undefined,
  existingActions: StarterBootstrapRuntimeAction[],
): StarterBootstrapRuntimeAction[] {
  if (!commands) {
    return [];
  }

  const existingSignatures = new Set(
    existingActions
      .map((action) => {
        const normalized = normalizeStarterBootstrapCommand(action.content);

        return normalized ? `${action.type}:${normalized}` : null;
      })
      .filter((signature): signature is string => signature !== null),
  );

  const candidates: StarterBootstrapRuntimeAction[] = [];
  const normalizedInstall = normalizeStarterBootstrapCommand(commands.installCommand);
  const normalizedStart = normalizeStarterBootstrapCommand(commands.startCommand);

  if (normalizedInstall && !existingSignatures.has(`shell:${normalizedInstall}`)) {
    candidates.push({
      type: 'shell',
      content: commands.installCommand!.trim(),
    });
  }

  if (normalizedStart && !existingSignatures.has(`start:${normalizedStart}`)) {
    candidates.push({
      type: 'start',
      content: commands.startCommand!.trim(),
    });
  }

  return candidates;
}
