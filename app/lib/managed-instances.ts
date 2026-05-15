export type ManagedInstanceStatus = 'provisioning' | 'active' | 'updating' | 'failed' | 'suspended' | 'expired';

export type ManagedInstanceRecord = {
  id: string;
  name: string;
  email: string;
  projectName: string;
  routeHostname: string;
  pagesUrl: string;
  plan: string;
  status: ManagedInstanceStatus;
  createdAt: string;
  updatedAt: string;
  trialEndsAt: string | null;
  currentGitSha: string | null;
  previousGitSha: string | null;
  lastGoodGitSha: string | null;
  lastRolloutAt: string | null;
  lastDeploymentUrl: string | null;
  lastGoodDeploymentUrl: string | null;
  lastHealthcheckAt: string | null;
  lastHealthcheckStatus: 'unknown' | 'healthy' | 'unhealthy';
  lastRollbackAt: string | null;
  lastRollbackOutcome: string | null;
  rolloutHistory: ManagedInstanceRolloutHistoryEntry[];
  lastError: string | null;
  suspendedAt: string | null;
  expiredAt: string | null;
  sourceBranch: string;
};

export type ManagedInstanceOperatorRecord = ManagedInstanceRecord;

export type ManagedInstanceRolloutHistoryEntry = {
  id: string;
  actor: string;
  reason: string;
  status: 'started' | 'healthy' | 'failed' | 'rollback-skipped' | 'rollback-ready';
  targetGitSha: string | null;
  previousGitSha: string | null;
  deploymentUrl: string | null;
  healthcheckUrl: string | null;
  rollbackOutcome: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

export type ManagedInstanceFleetSummary = {
  total: number;
  active: number;
  updating: number;
  failed: number;
  suspended: number;
  expired: number;
  healthy: number;
  unhealthy: number;
  rollbackReady: number;
  lastGoodSha: string | null;
};

export type ManagedInstanceSupport = {
  supported: boolean;
  reason: string | null;
  trialDays: number;
  rootDomain: string;
  sourceBranch: string;
  rolloutGuard?: {
    allowed: boolean;
    reason: string | null;
    currentSha: string | null;
    originMainSha: string | null;
    behindCount: number;
    checkedAt: string | null;
  };
};
