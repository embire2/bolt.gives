import type {
  GitHubUserResponse,
  GitHubRepoInfo,
  GitHubBranch,
  GitHubOrganization,
  GitHubStats,
  GitHubLanguageStats,
} from '~/types/GitHub';

export interface GitHubApiServiceConfig {
  token?: string;
  tokenType?: 'classic' | 'fine-grained';
  baseURL?: string;
}

export interface DetailedRepoInfo extends GitHubRepoInfo {
  branches_count?: number;
  contributors_count?: number;
  issues_count?: number;
  pull_requests_count?: number;
}

export interface CommitActivity {
  total: number;
  week: number;
  days: number[];
}

export interface ContributorStats {
  total: number;
  weeks: Array<{
    w: number;
    a: number;
    d: number;
    c: number;
  }>;
  author: {
    login: string;
    id: number;
    avatar_url: string;
    html_url: string;
  };
}

export interface CommitHeatmapData {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface AuthorStats {
  login: string;
  avatar_url: string;
  html_url: string;
  contributions: number;
  additions: number;
  deletions: number;
}

export interface RepoComparisonResult {
  repo1: DetailedRepoInfo;
  repo2: DetailedRepoInfo;
  comparison: {
    starsDiff: number;
    forksDiff: number;
    sizeDiff: number;
    issuesDiff: number;
    contributorsDiff: number;
    languageOverlap: string[];
    uniqueLanguages1: string[];
    uniqueLanguages2: string[];
  };
}

export interface GitHubApiError {
  message: string;
  status: number;
  code?: string;
}

export class GitHubApiServiceClass {
  private _config: GitHubApiServiceConfig;
  private _baseURL: string;

  constructor(config: GitHubApiServiceConfig = {}) {
    this._config = config;
    this._baseURL = config.baseURL || 'https://api.github.com';
  }

  /**
   * Configure the service with authentication details
   */
  configure(config: GitHubApiServiceConfig): void {
    this._config = { ...this._config, ...config };
    this._baseURL = config.baseURL || this._baseURL;
  }

  private async _makeRequestInternal<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (!this._config.token) {
      throw new Error('GitHub token is required. Call configure() first.');
    }

    const response = await fetch(`${this._baseURL}${endpoint}`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `${this._config.tokenType === 'classic' ? 'token' : 'Bearer'} ${this._config.token}`,
        'User-Agent': 'Bolt.gives',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const errorData: any = await response.json().catch(() => ({ message: response.statusText }));
      const error: GitHubApiError = {
        message: errorData.message || response.statusText,
        status: response.status,
        code: errorData.code,
      };
      throw error;
    }

    return response.json();
  }

  /**
   * Fetch all user repositories with pagination
   */
  async getAuthenticatedUser(): Promise<GitHubUserResponse> {
    return this._makeRequestInternal<GitHubUserResponse>('/user');
  }

  async getAllUserRepositories(): Promise<GitHubRepoInfo[]> {
    const allRepos: GitHubRepoInfo[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const repos = await this._makeRequestInternal<GitHubRepoInfo[]>(
        `/user/repos?per_page=100&page=${page}&sort=updated`,
      );

      allRepos.push(...repos);
      hasMore = repos.length === 100; // If we got 100 repos, there might be more
      page++;
    }

    return allRepos;
  }

  /**
   * Fetch detailed information for a repository including additional metrics
   */
  async getDetailedRepositoryInfo(owner: string, repo: string): Promise<DetailedRepoInfo> {
    const [repoInfo, branches] = await Promise.all([
      this._makeRequestInternal<GitHubRepoInfo>(`/repos/${owner}/${repo}`),
      this.getRepositoryBranches(owner, repo).catch(() => []),
    ]);

    // Try to get additional metrics
    const [contributors, issues, pullRequests] = await Promise.allSettled([
      this._getRepositoryContributorsCount(owner, repo),
      this._getRepositoryIssuesCount(owner, repo),
      this._getRepositoryPullRequestsCount(owner, repo),
    ]);

    const detailedInfo: DetailedRepoInfo = {
      ...repoInfo,
      branches_count: branches.length,
      contributors_count: contributors.status === 'fulfilled' ? contributors.value : undefined,
      issues_count: issues.status === 'fulfilled' ? issues.value : undefined,
      pull_requests_count: pullRequests.status === 'fulfilled' ? pullRequests.value : undefined,
    };

    return detailedInfo;
  }

  /**
   * Get repository branches
   */
  async getRepositoryBranches(owner: string, repo: string): Promise<GitHubBranch[]> {
    return this._makeRequestInternal<GitHubBranch[]>(`/repos/${owner}/${repo}/branches`);
  }

  /**
   * Get contributors count using Link header pagination info
   */
  private async _getRepositoryContributorsCount(owner: string, repo: string): Promise<number> {
    const response = await fetch(`${this._baseURL}/repos/${owner}/${repo}/contributors?per_page=1`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `${this._config.tokenType === 'classic' ? 'token' : 'Bearer'} ${this._config.token}`,
        'User-Agent': 'Bolt.gives',
      },
    });

    if (!response.ok) {
      return 0;
    }

    const linkHeader = response.headers.get('Link');

    if (linkHeader) {
      const match = linkHeader.match(/page=(\d+)>; rel="last"/);
      return match ? parseInt(match[1], 10) : 1;
    }

    const data = await response.json();

    return Array.isArray(data) ? data.length : 0;
  }

  /**
   * Get issues count using Link header pagination info
   */
  private async _getRepositoryIssuesCount(owner: string, repo: string): Promise<number> {
    const response = await fetch(`${this._baseURL}/repos/${owner}/${repo}/issues?state=all&per_page=1`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `${this._config.tokenType === 'classic' ? 'token' : 'Bearer'} ${this._config.token}`,
        'User-Agent': 'Bolt.gives',
      },
    });

    if (!response.ok) {
      return 0;
    }

    const linkHeader = response.headers.get('Link');

    if (linkHeader) {
      const match = linkHeader.match(/page=(\d+)>; rel="last"/);
      return match ? parseInt(match[1], 10) : 1;
    }

    const data = await response.json();

    return Array.isArray(data) ? data.length : 0;
  }

  /**
   * Get pull requests count using Link header pagination info
   */
  private async _getRepositoryPullRequestsCount(owner: string, repo: string): Promise<number> {
    const response = await fetch(`${this._baseURL}/repos/${owner}/${repo}/pulls?state=all&per_page=1`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `${this._config.tokenType === 'classic' ? 'token' : 'Bearer'} ${this._config.token}`,
        'User-Agent': 'Bolt.gives',
      },
    });

    if (!response.ok) {
      return 0;
    }

    const linkHeader = response.headers.get('Link');

    if (linkHeader) {
      const match = linkHeader.match(/page=(\d+)>; rel="last"/);
      return match ? parseInt(match[1], 10) : 1;
    }

    const data = await response.json();

    return Array.isArray(data) ? data.length : 0;
  }

  /**
   * Fetch detailed information for multiple repositories in batches
   */
  async getDetailedRepositoriesInfo(
    repos: GitHubRepoInfo[],
    batchSize: number = 5,
    delayMs: number = 100,
  ): Promise<DetailedRepoInfo[]> {
    const detailedRepos: DetailedRepoInfo[] = [];

    for (let i = 0; i < repos.length; i += batchSize) {
      const batch = repos.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map((repo) => {
          const [owner, repoName] = repo.full_name.split('/');
          return this.getDetailedRepositoryInfo(owner, repoName);
        }),
      );

      // Collect successful results
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          detailedRepos.push(result.value);
        } else {
          console.error(`Failed to fetch details for ${batch[index].full_name}:`, result.reason);

          // Fallback to original repo data
          detailedRepos.push(batch[index]);
        }
      });

      // Add delay between batches to be respectful to the API
      if (i + batchSize < repos.length) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return detailedRepos;
  }

  /**
   * Calculate comprehensive statistics from repositories
   */
  calculateRepositoryStats(repos: DetailedRepoInfo[]): {
    languages: GitHubLanguageStats;
    mostUsedLanguages: Array<{ language: string; bytes: number; repos: number }>;
    totalBranches: number;
    totalContributors: number;
    totalIssues: number;
    totalPullRequests: number;
    repositoryHealth: {
      healthy: number;
      active: number;
      archived: number;
      forked: number;
    };
  } {
    const languages: GitHubLanguageStats = {};
    const languageBytes: Record<string, number> = {};
    const languageRepos: Record<string, number> = {};

    let totalBranches = 0;
    let totalContributors = 0;
    let totalIssues = 0;
    let totalPullRequests = 0;

    let healthyRepos = 0;
    let activeRepos = 0;
    let archivedRepos = 0;
    let forkedRepos = 0;

    repos.forEach((repo) => {
      // Language statistics
      if (repo.language) {
        languages[repo.language] = (languages[repo.language] || 0) + 1;
        languageBytes[repo.language] = (languageBytes[repo.language] || 0) + (repo.size || 0);
        languageRepos[repo.language] = (languageRepos[repo.language] || 0) + 1;
      }

      // Aggregate metrics
      totalBranches += repo.branches_count || 0;
      totalContributors += repo.contributors_count || 0;
      totalIssues += repo.issues_count || 0;
      totalPullRequests += repo.pull_requests_count || 0;

      // Repository health analysis
      const daysSinceUpdate = Math.floor((Date.now() - new Date(repo.updated_at).getTime()) / (1000 * 60 * 60 * 24));

      if (repo.archived) {
        archivedRepos++;
      } else if (repo.fork) {
        forkedRepos++;
      } else if (daysSinceUpdate < 7) {
        activeRepos++;
      } else if (daysSinceUpdate < 30 && repo.stargazers_count > 0) {
        healthyRepos++;
      }
    });

    // Create most used languages array sorted by bytes
    const mostUsedLanguages = Object.entries(languageBytes)
      .map(([language, bytes]) => ({
        language,
        bytes,
        repos: languageRepos[language] || 0,
      }))
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 20);

    return {
      languages,
      mostUsedLanguages,
      totalBranches,
      totalContributors,
      totalIssues,
      totalPullRequests,
      repositoryHealth: {
        healthy: healthyRepos,
        active: activeRepos,
        archived: archivedRepos,
        forked: forkedRepos,
      },
    };
  }

  /**
   * Generate comprehensive GitHub stats for a user
   */
  async generateComprehensiveStats(userData: GitHubUserResponse): Promise<GitHubStats> {
    try {
      // Fetch all repositories
      const allRepos = await this.getAllUserRepositories();

      // Get detailed information for repositories (in batches)
      const detailedRepos = await this.getDetailedRepositoriesInfo(allRepos);

      // Calculate statistics
      const stats = this.calculateRepositoryStats(detailedRepos);

      // Fetch additional data in parallel
      const [organizations, recentActivity] = await Promise.allSettled([
        this._makeRequestInternal<GitHubOrganization[]>('/user/orgs'),
        this._makeRequestInternal<any[]>(`/users/${userData.login}/events?per_page=10`),
      ]);

      // Calculate aggregated metrics
      const totalStars = detailedRepos.reduce((sum, repo) => sum + repo.stargazers_count, 0);
      const totalForks = detailedRepos.reduce((sum, repo) => sum + repo.forks_count, 0);
      const privateRepos = detailedRepos.filter((repo) => repo.private).length;

      const githubStats: GitHubStats = {
        repos: detailedRepos,
        recentActivity:
          recentActivity.status === 'fulfilled'
            ? recentActivity.value.slice(0, 10).map((event: any) => ({
                id: event.id,
                type: event.type,
                repo: { name: event.repo.name, url: event.repo.url },
                created_at: event.created_at,
                payload: event.payload || {},
              }))
            : [],
        languages: stats.languages,
        totalGists: userData.public_gists || 0,
        publicRepos: userData.public_repos || 0,
        privateRepos,
        stars: totalStars,
        forks: totalForks,
        followers: userData.followers || 0,
        publicGists: userData.public_gists || 0,
        privateGists: 0, // This would need additional API call
        lastUpdated: new Date().toISOString(),
        totalStars,
        totalForks,
        organizations: organizations.status === 'fulfilled' ? organizations.value : [],
        totalBranches: stats.totalBranches,
        totalContributors: stats.totalContributors,
        totalIssues: stats.totalIssues,
        totalPullRequests: stats.totalPullRequests,
        mostUsedLanguages: stats.mostUsedLanguages,
      };

      return githubStats;
    } catch (error) {
      console.error('Error generating comprehensive stats:', error);
      throw error;
    }
  }

  /**
   * Fetch authenticated user and rate limit info
   */
  async fetchUser(
    token: string,
    tokenType: 'classic' | 'fine-grained' = 'classic',
  ): Promise<{ user: GitHubUserResponse; rateLimit: any }> {
    this.configure({ token, tokenType });

    const [user, rateLimit] = await Promise.all([
      this.getAuthenticatedUser(),
      this._makeRequestInternal('/rate_limit'),
    ]);

    return { user, rateLimit };
  }

  /**
   * Fetch comprehensive GitHub stats for authenticated user
   */
  async fetchStats(token: string, tokenType: 'classic' | 'fine-grained' = 'classic'): Promise<GitHubStats> {
    this.configure({ token, tokenType });

    const user = await this.getAuthenticatedUser();

    return this.generateComprehensiveStats(user);
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    // This is a placeholder - implement caching if needed
  }

  /**
   * Clear user-specific cache
   */
  clearUserCache(_token: string): void {
    // This is a placeholder - implement user-specific caching if needed
  }

  /**
   * Get commit activity for the past year (for heatmap visualization)
   */
  async getCommitActivity(owner: string, repo: string): Promise<CommitActivity[]> {
    return this._makeRequestInternal<CommitActivity[]>(`/repos/${owner}/${repo}/stats/commit_activity`);
  }

  /**
   * Generate heatmap data from commit activity
   */
  async getCommitHeatmap(owner: string, repo: string): Promise<CommitHeatmapData[]> {
    const activity = await this.getCommitActivity(owner, repo);
    const heatmapData: CommitHeatmapData[] = [];

    for (const week of activity) {
      const weekDate = new Date(week.week * 1000);
      for (let day = 0; day < week.days.length; day++) {
        const date = new Date(weekDate);
        date.setDate(date.getDate() + day);
        const count = week.days[day];
        
        let level: 0 | 1 | 2 | 3 | 4 = 0;
        if (count > 0) level = 1;
        if (count > 2) level = 2;
        if (count > 5) level = 3;
        if (count > 10) level = 4;

        heatmapData.push({
          date: date.toISOString().split('T')[0],
          count,
          level,
        });
      }
    }

    return heatmapData;
  }

  /**
   * Get contributor statistics (additions/deletions per week)
   * The GitHub API returns an array of contributor stats, one per author
   */
  async getContributorStats(owner: string, repo: string): Promise<ContributorStats[] | null> {
    try {
      return await this._makeRequestInternal<ContributorStats[]>(`/repos/${owner}/${repo}/stats/contributors`);
    } catch (error) {
      console.warn(`Could not fetch contributor stats for ${owner}/${repo}:`, error);
      return null;
    }
  }

  /**
   * Get top contributors with their stats
   */
  async getTopContributors(owner: string, repo: string, limit: number = 10): Promise<AuthorStats[]> {
    const contributors = await this._makeRequestInternal<any[]>(`/repos/${owner}/${repo}/contributors?per_page=${limit}`);
    const contributorStatsArray = await this.getContributorStats(owner, repo);

    // Create a map from author login/id to their stats for O(1) lookup
    const statsMap = new Map<string, ContributorStats>();
    if (contributorStatsArray) {
      for (const stats of contributorStatsArray) {
        if (stats.author?.login) {
          statsMap.set(stats.author.login, stats);
        }
      }
    }

    return contributors.map((contributor) => {
      // Find matching stats entry for this contributor by login
      const contributorStats = statsMap.get(contributor.login);
      const stats = contributorStats?.weeks?.[contributorStats.weeks.length - 1];
      return {
        login: contributor.login,
        avatar_url: contributor.avatar_url,
        html_url: contributor.html_url,
        contributions: contributor.contributions,
        additions: stats?.a || 0,
        deletions: stats?.d || 0,
      };
    });
  }

  /**
   * Get repository languages (bytes)
   */
  async getRepositoryLanguages(owner: string, repo: string): Promise<Record<string, number>> {
    return this._makeRequestInternal<Record<string, number>>(`/repos/${owner}/${repo}/languages`);
  }

  /**
   * Compare two repositories
   */
  async compareRepositories(
    owner1: string, 
    repo1: string, 
    owner2: string, 
    repo2: string
  ): Promise<RepoComparisonResult> {
    const [info1, info2, languages1, languages2] = await Promise.all([
      this.getDetailedRepositoryInfo(owner1, repo1),
      this.getDetailedRepositoryInfo(owner2, repo2),
      this.getRepositoryLanguages(owner1, repo1),
      this.getRepositoryLanguages(owner2, repo2),
    ]);

    const langKeys1 = Object.keys(languages1);
    const langKeys2 = Object.keys(languages2);
    const languageOverlap = langKeys1.filter(l => langKeys2.includes(l));
    const uniqueLanguages1 = langKeys1.filter(l => !langKeys2.includes(l));
    const uniqueLanguages2 = langKeys2.filter(l => !langKeys1.includes(l));

    return {
      repo1: info1,
      repo2: info2,
      comparison: {
        starsDiff: info1.stargazers_count - info2.stargazers_count,
        forksDiff: info1.forks_count - info2.forks_count,
        sizeDiff: (info1.size || 0) - (info2.size || 0),
        issuesDiff: (info1.issues_count || 0) - (info2.issues_count || 0),
        contributorsDiff: (info1.contributors_count || 0) - (info2.contributors_count || 0),
        languageOverlap,
        uniqueLanguages1,
        uniqueLanguages2,
      },
    };
  }
}

// Export an instance of the service
export const gitHubApiService = new GitHubApiServiceClass();
