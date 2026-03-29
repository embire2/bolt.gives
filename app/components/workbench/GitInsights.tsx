import React, { useMemo } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import type { CommitHeatmapData, AuthorStats } from '~/lib/services/githubApiService';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

interface GitInsightsProps {
  heatmapData: CommitHeatmapData[];
  contributors: AuthorStats[];
  repoName: string;
  onGenerateDocs?: () => void;
  onScan?: () => void;
  onCompare?: () => void;
  isLoading?: boolean;
}

export const GitInsights: React.FC<GitInsightsProps> = ({
  heatmapData,
  contributors,
  repoName,
  onGenerateDocs,
  onScan,
  onCompare,
  isLoading = false,
}) => {
  // Generate weeks for heatmap display
  const weeks = useMemo(() => {
    const result: CommitHeatmapData[][] = [];
    let currentWeek: CommitHeatmapData[] = [];

    heatmapData.forEach((day, index) => {
      currentWeek.push(day);
      if (currentWeek.length === 7) {
        result.push(currentWeek);
        currentWeek = [];
      }
    });

    if (currentWeek.length > 0) {
      result.push(currentWeek);
    }

    return result.slice(-52); // Last 52 weeks (1 year)
  }, [heatmapData]);

  const getLevelColor = (level: number) => {
    const colors = ['bg-gray-800', 'bg-green-900', 'bg-green-700', 'bg-green-500', 'bg-green-400'];
    return colors[level] || colors[0];
  };

  // Chart data for contributors
  const contributorChartData = useMemo(() => ({
    labels: contributors.map(c => c.login),
    datasets: [
      {
        label: 'Contributions',
        data: contributors.map(c => c.contributions),
        backgroundColor: 'rgba(138, 95, 255, 0.7)',
        borderColor: 'rgba(138, 95, 255, 1)',
        borderWidth: 1,
      },
    ],
  }), [contributors]);

  // Language distribution from contributors
  const languageChartData = useMemo(() => {
    const topContributors = contributors.slice(0, 5);
    return {
      labels: topContributors.map(c => c.login),
      datasets: [
        {
          data: topContributors.map(c => c.contributions),
          backgroundColor: [
            'rgba(138, 95, 255, 0.7)',
            'rgba(239, 68, 68, 0.7)',
            'rgba(34, 197, 94, 0.7)',
            'rgba(14, 165, 233, 0.7)',
            'rgba(249, 115, 22, 0.7)',
          ],
          borderColor: [
            'rgba(138, 95, 255, 1)',
            'rgba(239, 68, 68, 1)',
            'rgba(34, 197, 94, 1)',
            'rgba(14, 165, 233, 1)',
            'rgba(249, 115, 22, 1)',
          ],
          borderWidth: 2,
        },
      ],
    };
  }, [contributors]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(255, 255, 255, 0.1)',
        },
        ticks: {
          color: '#A3A3A3',
        },
      },
      x: {
        grid: {
          display: false,
        },
        ticks: {
          color: '#A3A3A3',
        },
      },
    },
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="i-ph:spinner animate-spin text-4xl text-accent-500" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-bolt-elements-textPrimary">Git Insights</h2>
          <p className="text-sm text-bolt-elements-textSecondary">{repoName}</p>
        </div>
        <div className="flex gap-2">
          {onScan && (
            <button
              onClick={onScan}
              className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md bg-bolt-elements-button-secondary-background hover:bg-bolt-elements-button-secondary-backgroundHover text-bolt-elements-button-secondary-text transition-colors"
            >
              <div className="i-ph:shield-check" />
              Scan
            </button>
          )}
          {onGenerateDocs && (
            <button
              onClick={onGenerateDocs}
              className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md bg-bolt-elements-button-secondary-background hover:bg-bolt-elements-button-secondary-backgroundHover text-bolt-elements-button-secondary-text transition-colors"
            >
              <div className="i-ph:file-text" />
              Generate Docs
            </button>
          )}
          {onCompare && (
            <button
              onClick={onCompare}
              className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md bg-bolt-elements-button-secondary-background hover:bg-bolt-elements-button-secondary-backgroundHover text-bolt-elements-button-secondary-text transition-colors"
            >
              <div className="i-ph:arrows-left-right" />
              Compare
            </button>
          )}
        </div>
      </div>

      {/* Commit Activity Heatmap */}
      <div className="bg-bolt-elements-background-depth-2 rounded-lg p-4 border border-bolt-elements-borderColor">
        <h3 className="text-lg font-semibold text-bolt-elements-textPrimary mb-4">Commit Activity</h3>
        
        <div className="overflow-x-auto">
          <div className="flex gap-1 min-w-max">
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="flex flex-col gap-1">
                {Array.from({ length: 7 }).map((_, dayIndex) => {
                  const dayData = week[dayIndex];
                  if (!dayData) {
                    return <div key={dayIndex} className="w-3 h-3" />;
                  }
                  return (
                    <div
                      key={dayIndex}
                      className={`w-3 h-3 rounded-sm ${getLevelColor(dayData.level)}`}
                      title={`${dayData.date}: ${dayData.count} commits`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 mt-4 text-xs text-bolt-elements-textTertiary">
          <span>Less</span>
          {[0, 1, 2, 3, 4].map(level => (
            <div key={level} className={`w-3 h-3 rounded-sm ${getLevelColor(level)}`} />
          ))}
          <span>More</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-bolt-elements-background-depth-2 rounded-lg p-4 border border-bolt-elements-borderColor">
          <div className="text-2xl font-bold text-accent-500">
            {contributors.reduce((sum, c) => sum + c.contributions, 0)}
          </div>
          <div className="text-sm text-bolt-elements-textSecondary">Total Contributions</div>
        </div>
        <div className="bg-bolt-elements-background-depth-2 rounded-lg p-4 border border-bolt-elements-borderColor">
          <div className="text-2xl font-bold text-green-500">
            {contributors.length}
          </div>
          <div className="text-sm text-bolt-elements-textSecondary">Contributors</div>
        </div>
        <div className="bg-bolt-elements-background-depth-2 rounded-lg p-4 border border-bolt-elements-borderColor">
          <div className="text-2xl font-bold text-blue-500">
            {heatmapData.filter(d => d.count > 0).length}
          </div>
          <div className="text-sm text-bolt-elements-textSecondary">Active Days</div>
        </div>
        <div className="bg-bolt-elements-background-depth-2 rounded-lg p-4 border border-bolt-elements-borderColor">
          <div className="text-2xl font-bold text-orange-500">
            {Math.max(...heatmapData.map(d => d.count), 0)}
          </div>
          <div className="text-sm text-bolt-elements-textSecondary">Busiest Day</div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Contributor Chart */}
        <div className="bg-bolt-elements-background-depth-2 rounded-lg p-4 border border-bolt-elements-borderColor">
          <h3 className="text-lg font-semibold text-bolt-elements-textPrimary mb-4">Top Contributors</h3>
          <div className="h-64">
            {contributors.length > 0 ? (
              <Bar data={contributorChartData} options={chartOptions} />
            ) : (
              <div className="flex items-center justify-center h-full text-bolt-elements-textTertiary">
                No contributor data available
              </div>
            )}
          </div>
        </div>

        {/* Language Distribution */}
        <div className="bg-bolt-elements-background-depth-2 rounded-lg p-4 border border-bolt-elements-borderColor">
          <h3 className="text-lg font-semibold text-bolt-elements-textPrimary mb-4">Contributor Distribution</h3>
          <div className="h-64 flex items-center justify-center">
            {contributors.length > 0 ? (
              <Doughnut
                data={languageChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: 'right',
                      labels: {
                        color: '#A3A3A3',
                        padding: 10,
                      },
                    },
                  },
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-bolt-elements-textTertiary">
                No contributor data available
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Contributor List */}
      <div className="bg-bolt-elements-background-depth-2 rounded-lg p-4 border border-bolt-elements-borderColor">
        <h3 className="text-lg font-semibold text-bolt-elements-textPrimary mb-4">Contributor Details</h3>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {contributors.map(contributor => (
            <div
              key={contributor.login}
              className="flex items-center gap-3 p-2 rounded-md hover:bg-bolt-elements-background-depth-1 transition-colors"
            >
              <img
                src={contributor.avatar_url}
                alt={contributor.login}
                className="w-8 h-8 rounded-full"
              />
              <a
                href={contributor.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-sm text-accent-500 hover:underline"
              >
                {contributor.login}
              </a>
              <div className="text-right">
                <div className="text-sm font-medium text-bolt-elements-textPrimary">
                  {contributor.contributions}
                </div>
                <div className="text-xs text-bolt-elements-textTertiary">
                  +{contributor.additions} -{contributor.deletions}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default GitInsights;
