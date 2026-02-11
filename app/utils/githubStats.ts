import type { GitHubStats, GitHubLanguageStats } from '~/types/GitHub';

export interface GitHubStatsSummary {
  totalRepositories: number;
  totalStars: number;
  totalForks: number;
  publicRepositories: number;
  privateRepositories: number;
  followers: number;
  publicGists: number;
  topLanguages: Array<{ name: string; count: number; percentage: number }>;
  recentActivityCount: number;
  lastUpdated?: string;
}

export function calculateStatsSummary(stats: GitHubStats): GitHubStatsSummary {
  // Calculate total repositories
  const totalRepositories = stats.repos?.length || stats.publicRepos || 0;

  // Calculate language statistics
  const topLanguages = calculateTopLanguages(stats.languages || {});

  return {
    totalRepositories,
    totalStars: stats.totalStars || stats.stars || 0,
    totalForks: stats.totalForks || stats.forks || 0,
    publicRepositories: stats.publicRepos || 0,
    privateRepositories: stats.privateRepos || 0,
    followers: stats.followers || 0,
    publicGists: stats.totalGists || stats.publicGists || 0,
    topLanguages,
    recentActivityCount: stats.recentActivity?.length || 0,
    lastUpdated: stats.lastUpdated,
  };
}

export function calculateTopLanguages(languages: GitHubLanguageStats): Array<{
  name: string;
  count: number;
  percentage: number;
}> {
  if (!languages || Object.keys(languages).length === 0) {
    return [];
  }

  const totalCount = Object.values(languages).reduce((sum, count) => sum + count, 0);

  if (totalCount === 0) {
    return [];
  }

  return Object.entries(languages)
    .map(([name, count]) => ({
      name,
      count,
      percentage: Math.round((count / totalCount) * 100),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10); // Top 10 languages
}

export function formatRepositoryStats(stats: GitHubStats) {
  const repositories = stats.repos || [];

  // Sort repositories by stars (descending)
  const topStarredRepos = repositories
    .filter((repo) => repo.stargazers_count > 0)
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 5);

  // Sort repositories by forks (descending)
  const topForkedRepos = repositories
    .filter((repo) => repo.forks_count > 0)
    .sort((a, b) => b.forks_count - a.forks_count)
    .slice(0, 5);

  // Recent repositories (by update date)
  const recentRepos = repositories
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 10);

  return {
    total: repositories.length,
    topStarredRepos,
    topForkedRepos,
    recentRepos,
    totalStars: repositories.reduce((sum, repo) => sum + repo.stargazers_count, 0),
    totalForks: repositories.reduce((sum, repo) => sum + repo.forks_count, 0),
  };
}

export function formatActivitySummary(stats: GitHubStats) {
  const activity = stats.recentActivity || [];

  // Group activities by type
  const activityByType = activity.reduce(
    (acc, event) => {
      acc[event.type] = (acc[event.type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  // Format activity types for display
  const formattedActivity = Object.entries(activityByType)
    .map(([type, count]) => ({
      type: formatActivityType(type),
      count,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    total: activity.length,
    byType: formattedActivity,
    recent: activity.slice(0, 5),
  };
}

function formatActivityType(type: string): string {
  const typeMap: Record<string, string> = {
    PushEvent: 'Pushes',
    CreateEvent: 'Created',
    DeleteEvent: 'Deleted',
    ForkEvent: 'Forks',
    WatchEvent: 'Stars',
    IssuesEvent: 'Issues',
    PullRequestEvent: 'Pull Requests',
    ReleaseEvent: 'Releases',
    PublicEvent: 'Made Public',
  };

  return typeMap[type] || type.replace('Event', '');
}

export function calculateGrowthMetrics(currentStats: GitHubStats, previousStats?: GitHubStats) {
  if (!previousStats) {
    return null;
  }

  const starsDiff = (currentStats.totalStars || 0) - (previousStats.totalStars || 0);
  const forksDiff = (currentStats.totalForks || 0) - (previousStats.totalForks || 0);
  const followersDiff = (currentStats.followers || 0) - (previousStats.followers || 0);
  const reposDiff = (currentStats.repos?.length || 0) - (previousStats.repos?.length || 0);

  return {
    stars: {
      current: currentStats.totalStars || 0,
      change: starsDiff,
      percentage: previousStats.totalStars ? Math.round((starsDiff / previousStats.totalStars) * 100) : 0,
    },
    forks: {
      current: currentStats.totalForks || 0,
      change: forksDiff,
      percentage: previousStats.totalForks ? Math.round((forksDiff / previousStats.totalForks) * 100) : 0,
    },
    followers: {
      current: currentStats.followers || 0,
      change: followersDiff,
      percentage: previousStats.followers ? Math.round((followersDiff / previousStats.followers) * 100) : 0,
    },
    repositories: {
      current: currentStats.repos?.length || 0,
      change: reposDiff,
      percentage: previousStats.repos?.length ? Math.round((reposDiff / previousStats.repos.length) * 100) : 0,
    },
  };
}
