export const USAGE_BALANCE_REFRESH_INTERVAL_MS = 60_000;
export const PROJECT_ENTITLEMENT_REFRESH_INTERVAL_MS = 5 * 60_000;

export function shouldRefreshProjectEntitlement(options: {
  sessionId: string | null;
  previousSessionId: string | null;
  lastRefreshedAt: number;
  now?: number;
  force?: boolean;
}) {
  if (options.force || options.sessionId !== options.previousSessionId) {
    return true;
  }

  if (!options.sessionId) {
    return false;
  }

  return (options.now ?? Date.now()) - options.lastRefreshedAt >= PROJECT_ENTITLEMENT_REFRESH_INTERVAL_MS;
}
