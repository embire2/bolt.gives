import React from 'react';
import { Button } from '~/components/ui/Button';
import type { GitHubStats } from '~/types/GitHub';

interface StatsDisplayProps {
  stats: GitHubStats;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function StatsDisplay({ stats, onRefresh, isRefreshing }: StatsDisplayProps) {
  // Calculate top languages for display
  const topLanguages = Object.entries(stats.languages || {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return (
    <div className="space-y-4">
      {/* Repository Stats */}
      <div>
        <h5 className="text-sm font-medium text-bolt-elements-textPrimary mb-2">Repository Stats</h5>
        <div className="grid grid-cols-2 gap-4">
          {[
            {
              label: 'Public Repos',
              value: stats.publicRepos || 0,
            },
            {
              label: 'Private Repos',
              value: stats.privateRepos || 0,
            },
          ].map((stat, index) => (
            <div
              key={index}
              className="flex flex-col p-3 rounded-lg bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor"
            >
              <span className="text-xs text-bolt-elements-textSecondary">{stat.label}</span>
              <span className="text-lg font-medium text-bolt-elements-textPrimary">{stat.value.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Contribution Stats */}
      <div>
        <h5 className="text-sm font-medium text-bolt-elements-textPrimary mb-2">Contribution Stats</h5>
        <div className="grid grid-cols-3 gap-4">
          {[
            {
              label: 'Stars',
              value: stats.totalStars || stats.stars || 0,
              icon: 'i-ph:star',
              iconColor: 'text-bolt-elements-icon-warning',
            },
            {
              label: 'Forks',
              value: stats.totalForks || stats.forks || 0,
              icon: 'i-ph:git-fork',
              iconColor: 'text-bolt-elements-icon-info',
            },
            {
              label: 'Followers',
              value: stats.followers || 0,
              icon: 'i-ph:users',
              iconColor: 'text-bolt-elements-icon-success',
            },
          ].map((stat, index) => (
            <div
              key={index}
              className="flex flex-col p-3 rounded-lg bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor"
            >
              <span className="text-xs text-bolt-elements-textSecondary">{stat.label}</span>
              <span className="text-lg font-medium text-bolt-elements-textPrimary flex items-center gap-1">
                <div className={`${stat.icon} w-4 h-4 ${stat.iconColor}`} />
                {stat.value.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Gist Stats */}
      <div>
        <h5 className="text-sm font-medium text-bolt-elements-textPrimary mb-2">Gist Stats</h5>
        <div className="grid grid-cols-2 gap-4">
          {[
            {
              label: 'Public Gists',
              value: stats.publicGists || 0,
              icon: 'i-ph:note',
            },
            {
              label: 'Total Gists',
              value: stats.totalGists || 0,
              icon: 'i-ph:note-blank',
            },
          ].map((stat, index) => (
            <div
              key={index}
              className="flex flex-col p-3 rounded-lg bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor"
            >
              <span className="text-xs text-bolt-elements-textSecondary">{stat.label}</span>
              <span className="text-lg font-medium text-bolt-elements-textPrimary flex items-center gap-1">
                <div className={`${stat.icon} w-4 h-4 text-bolt-elements-icon-tertiary`} />
                {stat.value.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Top Languages */}
      {topLanguages.length > 0 && (
        <div>
          <h5 className="text-sm font-medium text-bolt-elements-textPrimary mb-2">Top Languages</h5>
          <div className="space-y-2">
            {topLanguages.map(([language, count]) => (
              <div key={language} className="flex items-center justify-between">
                <span className="text-sm text-bolt-elements-textPrimary">{language}</span>
                <span className="text-sm text-bolt-elements-textSecondary">{count} repositories</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {stats.recentActivity && stats.recentActivity.length > 0 && (
        <div>
          <h5 className="text-sm font-medium text-bolt-elements-textPrimary mb-2">Recent Activity</h5>
          <div className="space-y-2">
            {stats.recentActivity.slice(0, 3).map((activity) => (
              <div key={activity.id} className="flex items-center gap-2 text-sm">
                <div className="i-ph:git-commit w-3 h-3 text-bolt-elements-icon-tertiary" />
                <span className="text-bolt-elements-textSecondary">
                  {activity.type.replace('Event', '')} in {activity.repo.name}
                </span>
                <span className="text-xs text-bolt-elements-textTertiary ml-auto">
                  {new Date(activity.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="pt-2 border-t border-bolt-elements-borderColor">
        <div className="flex items-center justify-between">
          <span className="text-xs text-bolt-elements-textSecondary">
            Last updated: {new Date(stats.lastUpdated).toLocaleString()}
          </span>
          {onRefresh && (
            <Button onClick={onRefresh} disabled={isRefreshing} variant="outline" size="sm" className="text-xs">
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
