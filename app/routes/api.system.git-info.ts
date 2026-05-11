import { json, type LoaderFunction, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { parseCookies } from '~/lib/api/cookies';
import { isTenantAdminAuthorized } from '~/lib/.server/admin-auth';

interface GitInfo {
  local: {
    commitHash: string;
    branch: string;
    commitTime: string;
    author: string;
    email: string;
    remoteUrl: string;
    repoName: string;
  };
  github?: {
    currentRepo?: {
      fullName: string;
      defaultBranch: string;
      stars: number;
      forks: number;
      openIssues?: number;
    };
  };
  isForked?: boolean;
  timestamp?: string;
}

interface AppContext {
  env?: {
    GITHUB_ACCESS_TOKEN?: string;
  };
}

interface GitHubRepo {
  name: string;
  full_name: string;
  html_url: string;
  description: string;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  languages_url: string;
}

interface GitHubGist {
  id: string;
  html_url: string;
  description: string;
}

// These values will be replaced at build time

declare const __COMMIT_HASH: string;

declare const __GIT_BRANCH: string;

declare const __GIT_COMMIT_TIME: string;

declare const __GIT_AUTHOR: string;

declare const __GIT_EMAIL: string;

declare const __GIT_REMOTE_URL: string;

declare const __GIT_REPO_NAME: string;

const PRIVILEGED_ACTIONS = new Set(['getUser', 'getRepos', 'getOrgs', 'getActivity']);

function resolveBearerToken(request: Request) {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7).trim();

  return token.length > 0 ? token : null;
}

function buildLocalGitInfo(): GitInfo {
  return {
    local: {
      commitHash: typeof __COMMIT_HASH !== 'undefined' ? __COMMIT_HASH : 'development',
      branch: typeof __GIT_BRANCH !== 'undefined' ? __GIT_BRANCH : 'main',
      commitTime: typeof __GIT_COMMIT_TIME !== 'undefined' ? __GIT_COMMIT_TIME : new Date().toISOString(),
      author: typeof __GIT_AUTHOR !== 'undefined' ? __GIT_AUTHOR : 'development',
      email: typeof __GIT_EMAIL !== 'undefined' ? __GIT_EMAIL : 'development@local',
      remoteUrl: typeof __GIT_REMOTE_URL !== 'undefined' ? __GIT_REMOTE_URL : 'local',
      repoName: typeof __GIT_REPO_NAME !== 'undefined' ? __GIT_REPO_NAME : 'bolt.gives',
    },
    timestamp: new Date().toISOString(),
  };
}

async function callGithub<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }

  return (await response.json()) as T;
}

export const loader: LoaderFunction = async ({ request, context }: LoaderFunctionArgs & { context: AppContext }) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || '';

  if (!PRIVILEGED_ACTIONS.has(action)) {
    return json(buildLocalGitInfo());
  }

  const isAdmin = await isTenantAdminAuthorized(request);

  if (!isAdmin) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  const cookies = parseCookies(request.headers.get('Cookie'));
  const headerToken = resolveBearerToken(request);
  const cookieToken = cookies.githubToken;
  const serverGithubToken = process.env.GITHUB_ACCESS_TOKEN || context.env?.GITHUB_ACCESS_TOKEN;
  const token = headerToken || cookieToken || serverGithubToken;

  if (!token) {
    return json({ error: 'No GitHub token available' }, { status: 401 });
  }

  try {
    if (action === 'getUser') {
      const user = await callGithub('/user', token);
      return json({ user });
    }

    if (action === 'getRepos') {
      const repos = await callGithub<GitHubRepo[]>('/user/repos?per_page=100&sort=updated', token);
      const gists = await callGithub<GitHubGist[]>('/gists', token).catch(() => []);

      const languageStats: Record<string, number> = {};
      let totalStars = 0;
      let totalForks = 0;

      for (const repo of repos) {
        totalStars += repo.stargazers_count || 0;
        totalForks += repo.forks_count || 0;

        if (repo.language && repo.language !== 'null') {
          languageStats[repo.language] = (languageStats[repo.language] || 0) + 1;
        }
      }

      return json({
        repos,
        stats: {
          totalStars,
          totalForks,
          languages: languageStats,
          totalGists: gists.length,
        },
      });
    }

    if (action === 'getOrgs') {
      const organizations = await callGithub('/user/orgs', token);
      return json({ organizations });
    }

    if (action === 'getActivity') {
      const username = String(cookies.githubUsername || '').trim();

      if (!username) {
        return json({ error: 'GitHub username not found in cookies' }, { status: 400 });
      }

      const recentActivity = await callGithub(`/users/${encodeURIComponent(username)}/events?per_page=30`, token);

      return json({ recentActivity });
    }
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }

  return json({ error: 'Unsupported action' }, { status: 400 });
};
