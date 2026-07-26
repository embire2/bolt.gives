import type { GitHubStats } from '@bolt/core/types/GitHub';

export function calculateStatsSummary(stats: GitHubStats): GitHubStats {
  return {
    ...stats,

    // Add any calculated fields that might be missing
  };
}
