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
  trialEndsAt: string;
  currentGitSha: string | null;
  previousGitSha: string | null;
  lastRolloutAt: string | null;
  lastDeploymentUrl: string | null;
  lastError: string | null;
  suspendedAt: string | null;
  expiredAt: string | null;
  sourceBranch: string;
};

export type ManagedInstanceOperatorRecord = ManagedInstanceRecord;

export type ManagedInstanceSupport = {
  supported: boolean;
  reason: string | null;
  trialDays: number;
  rootDomain: string;
  sourceBranch: string;
};
