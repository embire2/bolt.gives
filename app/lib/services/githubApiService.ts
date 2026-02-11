import type {
  GitHubUserResponse,
  GitHubRepoInfo,
  GitHubEvent,
  GitHubStats,
  GitHubLanguageStats,
  GitHubRateLimits,
} from '~/types/GitHub';

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

class GitHubCache {
  private _cache = new Map<string, CacheEntry<any>>();

  set<T>(key: string, data: T, duration = CACHE_DURATION): void {
    const timestamp = Date.now();
    this._cache.set(key, {
      data,
      timestamp,
      expiresAt: timestamp + duration,
    });
  }

  get<T>(key: string): T | null {
    const entry = this._cache.get(key);

    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this._cache.delete(key);
      return null;
    }

    return entry.data;
  }

  clear(): void {
    this._cache.clear();
  }

  isExpired(key: string): boolean {
    const entry = this._cache.get(key);
    return !entry || Date.now() > entry.expiresAt;
  }

  delete(key: string): void {
    this._cache.delete(key);
  }
}

class GitHubApiService {
  private _cache = new GitHubCache();
  private _baseUrl = 'https://api.github.com';

  private async _makeRequest<T>(
    endpoint: string,
    token: string,
    tokenType: 'classic' | 'fine-grained' = 'classic',
    options: RequestInit = {},
  ): Promise<{ data: T; rateLimit?: GitHubRateLimits }> {
    const authHeader = tokenType === 'classic' ? `token ${token}` : `Bearer ${token}`;

    const response = await fetch(`${this._baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
        'User-Agent': 'bolt.diy-app',
        ...options.headers,
      },
    });

    // Extract rate limit information
    const rateLimit: GitHubRateLimits = {
      limit: parseInt(response.headers.get('x-ratelimit-limit') || '5000'),
      remaining: parseInt(response.headers.get('x-ratelimit-remaining') || '5000'),
      reset: new Date(parseInt(response.headers.get('x-ratelimit-reset') || '0') * 1000),
      used: parseInt(response.headers.get('x-ratelimit-used') || '0'),
    };

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`GitHub API Error (${response.status}): ${response.statusText}. ${errorBody}`);
    }

    const data = (await response.json()) as T;

    return { data, rateLimit };
  }

  async fetchUser(
    token: string,
    _tokenType: 'classic' | 'fine-grained' = 'classic',
  ): Promise<{
    user: GitHubUserResponse;
    rateLimit: GitHubRateLimits;
  }> {
    const cacheKey = `user:${token.slice(0, 8)}`;
    const cached = this._cache.get<{ user: GitHubUserResponse; rateLimit: GitHubRateLimits }>(cacheKey);

    if (cached) {
      return cached;
    }

    try {
      // Use server-side API endpoint for user validation
      const response = await fetch('/api/system/git-info?action=getUser', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`GitHub API Error (${response.status}): ${response.statusText}`);
      }

      // Get rate limit information from headers
      const rateLimit: GitHubRateLimits = {
        limit: parseInt(response.headers.get('x-ratelimit-limit') || '5000'),
        remaining: parseInt(response.headers.get('x-ratelimit-remaining') || '5000'),
        reset: new Date(parseInt(response.headers.get('x-ratelimit-reset') || '0') * 1000),
        used: parseInt(response.headers.get('x-ratelimit-used') || '0'),
      };

      const data = (await response.json()) as { user: GitHubUserResponse };
      const user = data.user;

      if (!user || !user.login) {
        throw new Error('Invalid user data received');
      }

      const result = { user, rateLimit };
      this._cache.set(cacheKey, result);

      return result;
    } catch (error) {
      console.error('Failed to fetch GitHub user:', error);
      throw error;
    }
  }

  async fetchRepositories(token: string, tokenType: 'classic' | 'fine-grained' = 'classic'): Promise<GitHubRepoInfo[]> {
    const cacheKey = `repos:${token.slice(0, 8)}`;
    const cached = this._cache.get<GitHubRepoInfo[]>(cacheKey);

    if (cached) {
      return cached;
    }

    try {
      let allRepos: any[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const { data: repos } = await this._makeRequest<any[]>(
          `/user/repos?per_page=100&page=${page}`,
          token,
          tokenType,
        );

        allRepos = [...allRepos, ...repos];

        hasMore = repos.length === 100;
        page++;
      }

      const repositories: GitHubRepoInfo[] = allRepos.map((repo) => ({
        id: repo.id.toString(),
        name: repo.name,
        full_name: repo.full_name,
        html_url: repo.html_url,
        description: repo.description || '',
        stargazers_count: repo.stargazers_count || 0,
        forks_count: repo.forks_count || 0,
        default_branch: repo.default_branch || 'main',
        updated_at: repo.updated_at,
        language: repo.language || '',
        languages_url: repo.languages_url,
        private: repo.private || false,
        topics: repo.topics || [],
      }));

      this._cache.set(cacheKey, repositories);

      return repositories;
    } catch (error) {
      console.error('Failed to fetch GitHub repositories:', error);
      throw error;
    }
  }

  async fetchRecentActivity(
    username: string,
    token: string,
    tokenType: 'classic' | 'fine-grained' = 'classic',
  ): Promise<GitHubEvent[]> {
    const cacheKey = `activity:${username}:${token.slice(0, 8)}`;
    const cached = this._cache.get<GitHubEvent[]>(cacheKey);

    if (cached) {
      return cached;
    }

    try {
      const { data: events } = await this._makeRequest<any[]>(
        `/users/${username}/events?per_page=10`,
        token,
        tokenType,
      );

      const recentActivity: GitHubEvent[] = events.slice(0, 5).map((event) => ({
        id: event.id,
        type: event.type,
        created_at: event.created_at,
        repo: {
          name: event.repo?.name || '',
          url: event.repo?.url || '',
        },
        payload: {
          action: event.payload?.action,
          ref: event.payload?.ref,
          ref_type: event.payload?.ref_type,
          description: event.payload?.description,
        },
      }));

      this._cache.set(cacheKey, recentActivity);

      return recentActivity;
    } catch (error) {
      console.error('Failed to fetch GitHub recent activity:', error);
      throw error;
    }
  }

  async fetchRepositoryLanguages(languagesUrl: string, token: string): Promise<GitHubLanguageStats> {
    const cacheKey = `languages:${languagesUrl}`;
    const cached = this._cache.get<GitHubLanguageStats>(cacheKey);

    if (cached) {
      return cached;
    }

    try {
      const response = await fetch(languagesUrl, {
        headers: {
          Authorization: `token ${token}`,
          'User-Agent': 'bolt.diy-app',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch languages: ${response.statusText}`);
      }

      const languages = (await response.json()) as GitHubLanguageStats;
      this._cache.set(cacheKey, languages);

      return languages;
    } catch (error) {
      console.error('Failed to fetch repository languages:', error);
      return {};
    }
  }

  async fetchStats(token: string, tokenType: 'classic' | 'fine-grained' = 'classic'): Promise<GitHubStats> {
    try {
      // Fetch user data
      const { user } = await this.fetchUser(token, tokenType);

      // Fetch repositories
      const repositories = await this.fetchRepositories(token, tokenType);

      // Fetch recent activity
      const recentActivity = await this.fetchRecentActivity(user.login, token, tokenType);

      // Calculate stats
      const totalStars = repositories.reduce((sum, repo) => sum + repo.stargazers_count, 0);
      const totalForks = repositories.reduce((sum, repo) => sum + repo.forks_count, 0);
      const privateRepos = repositories.filter((repo) => repo.private).length;

      // Calculate language statistics
      const languages: GitHubLanguageStats = {};

      for (const repo of repositories) {
        if (repo.language) {
          languages[repo.language] = (languages[repo.language] || 0) + 1;
        }
      }

      const stats: GitHubStats = {
        repos: repositories,
        totalStars,
        totalForks,
        organizations: [], // TODO: Implement organizations fetching if needed
        recentActivity,
        languages,
        totalGists: user.public_gists || 0,
        publicRepos: user.public_repos || 0,
        privateRepos,
        stars: totalStars,
        forks: totalForks,
        followers: user.followers || 0,
        publicGists: user.public_gists || 0,
        privateGists: 0, // GitHub API doesn't provide private gists count directly
        lastUpdated: new Date().toISOString(),
      };

      return stats;
    } catch (error) {
      console.error('Failed to fetch GitHub stats:', error);
      throw error;
    }
  }

  clearCache(): void {
    this._cache.clear();
  }

  clearUserCache(token: string): void {
    const keyPrefix = token.slice(0, 8);
    this._cache.delete(`user:${keyPrefix}`);
    this._cache.delete(`repos:${keyPrefix}`);
  }
}

export const gitHubApiService = new GitHubApiService();
