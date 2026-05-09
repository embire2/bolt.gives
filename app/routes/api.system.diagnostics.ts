import { json, type LoaderFunction, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { parseCookies } from '~/lib/api/cookies';
import { isTenantAdminAuthorized } from '~/lib/.server/admin-auth';

interface AppContext {
  env?: {
    GITHUB_ACCESS_TOKEN?: string;
    NETLIFY_TOKEN?: string;
  };
}

async function getExternalApiStatus(url: string, headers?: HeadersInit) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    return {
      isReachable: response.ok,
      status: response.status,
      statusText: response.statusText,
    };
  } catch (error) {
    return {
      isReachable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export const loader: LoaderFunction = async ({ request, context }: LoaderFunctionArgs & { context: AppContext }) => {
  const authenticated = await isTenantAdminAuthorized(request);
  const timestamp = new Date().toISOString();

  if (!authenticated) {
    return json({
      status: 'ok',
      authenticated: false,
      serverTimestamp: timestamp,
      message: 'Diagnostics are restricted to tenant administrators on this deployment.',
    });
  }

  const cookieValues = parseCookies(request.headers.get('Cookie'));
  const hasGithubTokenCookie = Boolean(cookieValues.githubToken);
  const hasGithubUsernameCookie = Boolean(cookieValues.githubUsername);
  const hasNetlifyCookie = Boolean(cookieValues.netlifyToken);

  const envVars = {
    hasGithubToken: Boolean(process.env.GITHUB_ACCESS_TOKEN || context.env?.GITHUB_ACCESS_TOKEN),
    hasNetlifyToken: Boolean(process.env.NETLIFY_TOKEN || context.env?.NETLIFY_TOKEN),
    nodeEnv: process.env.NODE_ENV,
  };

  const corsStatus = {
    headers: {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  };

  const apiEndpoints = {
    githubUser: '/api/system/git-info?action=getUser',
    githubRepos: '/api/system/git-info?action=getRepos',
    githubOrgs: '/api/system/git-info?action=getOrgs',
    githubActivity: '/api/system/git-info?action=getActivity',
    gitInfo: '/api/system/git-info',
  };

  const [githubApiStatus, netlifyApiStatus] = await Promise.all([
    getExternalApiStatus('https://api.github.com/zen', {
      Accept: 'application/vnd.github.v3+json',
    }),
    getExternalApiStatus('https://api.netlify.com/api/v1/'),
  ]);

  return json({
    status: 'success',
    authenticated: true,
    environment: envVars,
    cookies: {
      hasGithubTokenCookie,
      hasGithubUsernameCookie,
      hasNetlifyCookie,
    },
    localStorage: {
      explanation: 'Local storage can only be checked on the client side. Use browser devtools to check.',
      githubKeysToCheck: ['github_connection'],
      netlifyKeysToCheck: ['netlify_connection'],
    },
    apiEndpoints,
    externalApis: {
      github: githubApiStatus,
      netlify: netlifyApiStatus,
    },
    corsStatus,
    technicalDetails: {
      serverTimestamp: timestamp,
      userAgent: request.headers.get('User-Agent'),
      referrer: request.headers.get('Referer'),
      host: request.headers.get('Host'),
      method: request.method,
      url: request.url,
    },
  });
};
