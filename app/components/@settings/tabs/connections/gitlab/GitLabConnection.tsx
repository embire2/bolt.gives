import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { classNames } from '~/utils/classNames';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '~/components/ui/Collapsible';
import { Button } from '~/components/ui/Button';
import { useGitLabConnection } from '~/lib/stores/gitlabConnection';
import { RepositoryList } from './RepositoryList';
import { StatsDisplay } from './StatsDisplay';
import type { GitLabProjectInfo } from '~/types/GitLab';

interface GitLabConnectionProps {
  onCloneRepository?: (repoUrl: string) => void;
}

export default function GitLabConnection({ onCloneRepository }: GitLabConnectionProps = {}) {
  const {
    connection: connectionAtom,
    isConnected,
    user: userAtom,
    stats,
    gitlabUrl: gitlabUrlAtom,
    connect,
    disconnect,
    fetchStats,
    loadSavedConnection,
    setGitLabUrl,
    setToken,
    autoConnect,
  } = useGitLabConnection();

  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isFetchingStats, setIsFetchingStats] = useState(false);
  const [isStatsExpanded, setIsStatsExpanded] = useState(false);

  useEffect(() => {
    const initializeConnection = async () => {
      setIsLoading(true);

      const saved = loadSavedConnection();

      if (saved?.user && saved?.token) {
        // If we have stats, no need to fetch them again
        if (!saved.stats || !saved.stats.projects || saved.stats.projects.length === 0) {
          await fetchStats();
        }
      } else if (import.meta.env?.VITE_GITLAB_ACCESS_TOKEN) {
        // Auto-connect using environment variable if no saved connection
        const result = await autoConnect();

        if (result.success) {
          toast.success('Connected to GitLab automatically');
        }
      }

      setIsLoading(false);
    };

    initializeConnection();
  }, [autoConnect, fetchStats, loadSavedConnection]);

  const handleConnect = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsConnecting(true);

    try {
      const result = await connect(connectionAtom.get().token, gitlabUrlAtom.get());

      if (result.success) {
        toast.success('Connected to GitLab successfully');
        await fetchStats();
      } else {
        toast.error(`Failed to connect to GitLab: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to connect to GitLab:', error);
      toast.error(`Failed to connect to GitLab: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    disconnect();
    toast.success('Disconnected from GitLab');
  };

  const handleCloneRepository = (repoUrl: string) => {
    if (onCloneRepository) {
      onCloneRepository(repoUrl);
    } else {
      window.open(repoUrl, '_blank');
    }
  };

  if (isLoading || isConnecting || isFetchingStats) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="flex items-center gap-2">
          <div className="i-ph:spinner-gap-bold animate-spin w-4 h-4" />
          <span className="text-bolt-elements-textSecondary">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="bg-bolt-elements-background border border-bolt-elements-borderColor rounded-lg"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 text-orange-600">
              <svg viewBox="0 0 24 24" className="w-5 h-5">
                <path
                  fill="currentColor"
                  d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z"
                />
              </svg>
            </div>
            <h3 className="text-base font-medium text-bolt-elements-textPrimary">GitLab Connection</h3>
          </div>
        </div>

        {!isConnected && (
          <div className="text-xs text-bolt-elements-textSecondary bg-bolt-elements-background-depth-1 p-3 rounded-lg mb-4">
            <p className="flex items-center gap-1 mb-1">
              <span className="i-ph:lightbulb w-3.5 h-3.5 text-bolt-elements-icon-success" />
              <span className="font-medium">Tip:</span> You can also set the{' '}
              <code className="px-1 py-0.5 bg-bolt-elements-background-depth-2 rounded">VITE_GITLAB_ACCESS_TOKEN</code>{' '}
              environment variable to connect automatically.
            </p>
            <p>
              For self-hosted GitLab instances, also set{' '}
              <code className="px-1 py-0.5 bg-bolt-elements-background-depth-2 rounded">
                VITE_GITLAB_URL=https://your-gitlab-instance.com
              </code>
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-sm text-bolt-elements-textSecondary mb-2">GitLab URL</label>
            <input
              type="text"
              value={gitlabUrlAtom.get()}
              onChange={(e) => setGitLabUrl(e.target.value)}
              disabled={isConnecting || isConnected.get()}
              placeholder="https://gitlab.com"
              className={classNames(
                'w-full px-3 py-2 rounded-lg text-sm',
                'bg-[#F8F8F8] dark:bg-[#1A1A1A]',
                'border border-[#E5E5E5] dark:border-[#333333]',
                'text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary',
                'focus:outline-none focus:ring-1 focus:ring-bolt-elements-borderColorActive',
                'disabled:opacity-50',
              )}
            />
          </div>

          <div>
            <label className="block text-sm text-bolt-elements-textSecondary mb-2">Access Token</label>
            <input
              type="password"
              value={connectionAtom.get().token}
              onChange={(e) => setToken(e.target.value)}
              disabled={isConnecting || isConnected.get()}
              placeholder="Enter your GitLab access token"
              className={classNames(
                'w-full px-3 py-2 rounded-lg text-sm',
                'bg-[#F8F8F8] dark:bg-[#1A1A1A]',
                'border border-[#E5E5E5] dark:border-[#333333]',
                'text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary',
                'focus:outline-none focus:ring-1 focus:ring-bolt-elements-borderColorActive',
                'disabled:opacity-50',
              )}
            />
            <div className="mt-2 text-sm text-bolt-elements-textSecondary">
              <a
                href={`${gitlabUrlAtom.get()}/-/user_settings/personal_access_tokens`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-bolt-elements-borderColorActive hover:underline inline-flex items-center gap-1"
              >
                Get your token
                <div className="i-ph:arrow-square-out w-4 h-4" />
              </a>
              <span className="mx-2">•</span>
              <span>Required scopes: api, read_repository</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          {!isConnected ? (
            <button
              onClick={handleConnect}
              disabled={isConnecting || !connectionAtom.get().token}
              className={classNames(
                'px-4 py-2 rounded-lg text-sm flex items-center gap-2',
                'bg-[#FC6D26] text-white',
                'hover:bg-[#E24329] hover:text-white',
                'disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200',
                'transform active:scale-95',
              )}
            >
              {isConnecting ? (
                <>
                  <div className="i-ph:spinner-gap animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <div className="i-ph:plug-charging w-4 h-4" />
                  Connect
                </>
              )}
            </button>
          ) : (
            <>
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleDisconnect}
                    className={classNames(
                      'px-4 py-2 rounded-lg text-sm flex items-center gap-2',
                      'bg-red-500 text-white',
                      'hover:bg-red-600',
                    )}
                  >
                    <div className="i-ph:plug w-4 h-4" />
                    Disconnect
                  </button>
                  <span className="text-sm text-bolt-elements-textSecondary flex items-center gap-1">
                    <div className="i-ph:check-circle w-4 h-4 text-green-500" />
                    Connected to GitLab
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => window.open(`${gitlabUrlAtom.get()}/dashboard`, '_blank', 'noopener,noreferrer')}
                    className="flex items-center gap-2 hover:bg-bolt-elements-item-backgroundActive/10 hover:text-bolt-elements-textPrimary dark:hover:text-bolt-elements-textPrimary transition-colors"
                  >
                    <div className="i-ph:layout-dashboard w-4 h-4" />
                    Dashboard
                  </Button>
                  <Button
                    onClick={async () => {
                      setIsFetchingStats(true);

                      const result = await fetchStats();
                      setIsFetchingStats(false);

                      if (result.success) {
                        toast.success('GitLab stats refreshed');
                      } else {
                        toast.error(`Failed to refresh stats: ${result.error}`);
                      }
                    }}
                    disabled={isFetchingStats}
                    variant="outline"
                    className="flex items-center gap-2 hover:bg-bolt-elements-item-backgroundActive/10 hover:text-bolt-elements-textPrimary dark:hover:text-bolt-elements-textPrimary transition-colors"
                  >
                    {isFetchingStats ? (
                      <>
                        <div className="i-ph:spinner-gap w-4 h-4 animate-spin" />
                        Refreshing...
                      </>
                    ) : (
                      <>
                        <div className="i-ph:arrows-clockwise w-4 h-4" />
                        Refresh Stats
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>

        {isConnected.get() && userAtom.get() && stats.get() && (
          <div className="mt-6 border-t border-bolt-elements-borderColor pt-6">
            <div className="flex items-center gap-4 p-4 bg-bolt-elements-background-depth-1 rounded-lg mb-4">
              <div className="w-12 h-12 rounded-full border-2 border-bolt-elements-item-contentAccent flex items-center justify-center bg-bolt-elements-background-depth-2 overflow-hidden">
                {userAtom.get()?.avatar_url &&
                userAtom.get()?.avatar_url !== 'null' &&
                userAtom.get()?.avatar_url !== '' ? (
                  <img
                    src={userAtom.get()?.avatar_url}
                    alt={userAtom.get()?.username}
                    className="w-full h-full rounded-full object-cover"
                    onError={(e) => {
                      // Fallback to initials if avatar fails to load
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';

                      const parent = target.parentElement;

                      if (parent) {
                        const user = userAtom.get();
                        parent.innerHTML = (user?.name || user?.username || 'U').charAt(0).toUpperCase();

                        parent.classList.add(
                          'text-white',
                          'font-semibold',
                          'text-sm',
                          'flex',
                          'items-center',
                          'justify-center',
                        );
                      }
                    }}
                  />
                ) : (
                  <div className="w-full h-full rounded-full bg-bolt-elements-item-contentAccent flex items-center justify-center text-white font-semibold text-sm">
                    {(userAtom.get()?.name || userAtom.get()?.username || 'U').charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div>
                <h4 className="text-sm font-medium text-bolt-elements-textPrimary">
                  {userAtom.get()?.name || userAtom.get()?.username}
                </h4>
                <p className="text-sm text-bolt-elements-textSecondary">{userAtom.get()?.username}</p>
              </div>
            </div>

            <Collapsible open={isStatsExpanded} onOpenChange={setIsStatsExpanded}>
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between p-4 rounded-lg bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor hover:border-bolt-elements-borderColorActive/70 transition-all duration-200">
                  <div className="flex items-center gap-2">
                    <div className="i-ph:chart-bar w-4 h-4 text-bolt-elements-item-contentAccent" />
                    <span className="text-sm font-medium text-bolt-elements-textPrimary">GitLab Stats</span>
                  </div>
                  <div
                    className={classNames(
                      'i-ph:caret-down w-4 h-4 transform transition-transform duration-200 text-bolt-elements-textSecondary',
                      isStatsExpanded ? 'rotate-180' : '',
                    )}
                  />
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent className="overflow-hidden">
                <div className="space-y-4 mt-4">
                  <StatsDisplay
                    stats={stats.get()!}
                    onRefresh={async () => {
                      const result = await fetchStats();

                      if (result.success) {
                        toast.success('Stats refreshed');
                      } else {
                        toast.error(`Failed to refresh stats: ${result.error}`);
                      }
                    }}
                    isRefreshing={isFetchingStats}
                  />

                  <RepositoryList
                    repositories={stats.get()?.projects || []}
                    onClone={(repo: GitLabProjectInfo) => handleCloneRepository(repo.http_url_to_repo)}
                    onRefresh={async () => {
                      const result = await fetchStats(true); // Force refresh

                      if (result.success) {
                        toast.success('Repositories refreshed');
                      } else {
                        toast.error(`Failed to refresh repositories: ${result.error}`);
                      }
                    }}
                    isRefreshing={isFetchingStats}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}
      </div>
    </motion.div>
  );
}
