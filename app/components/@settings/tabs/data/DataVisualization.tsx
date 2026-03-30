import { useEffect, useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import type { Chat } from '~/lib/persistence/chats';
import { classNames } from '~/utils/classNames';

type ChartComponentProps = {
  data: unknown;
  options: unknown;
};

type ChartComponents = {
  Bar: ComponentType<ChartComponentProps>;
  Pie: ComponentType<ChartComponentProps>;
};

type DataVisualizationProps = {
  chats: Chat[];
};

export function DataVisualization({ chats }: DataVisualizationProps) {
  const [chartsByDate, setChatsByDate] = useState<Record<string, number>>({});
  const [messagesByRole, setMessagesByRole] = useState<Record<string, number>>({});
  const [apiKeyUsage, setApiKeyUsage] = useState<Array<{ provider: string; count: number }>>([]);
  const [averageMessagesPerChat, setAverageMessagesPerChat] = useState<number>(0);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [chartComponents, setChartComponents] = useState<ChartComponents | null>(null);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([import('chart.js'), import('react-chartjs-2')]).then(([chartJsModule, chartReactModule]) => {
      if (cancelled) {
        return;
      }

      const {
        Chart,
        CategoryScale,
        LinearScale,
        BarElement,
        Title,
        Tooltip,
        Legend,
        ArcElement,
        PointElement,
        LineElement,
      } = chartJsModule;
      Chart.register(
        CategoryScale,
        LinearScale,
        BarElement,
        Title,
        Tooltip,
        Legend,
        ArcElement,
        PointElement,
        LineElement,
      );

      setChartComponents({
        Bar: chartReactModule.Bar as ComponentType<ChartComponentProps>,
        Pie: chartReactModule.Pie as ComponentType<ChartComponentProps>,
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    setIsDarkMode(isDark);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          setIsDarkMode(document.documentElement.classList.contains('dark'));
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!chats.length) {
      return;
    }

    const chatDates: Record<string, number> = {};
    const roleCounts: Record<string, number> = {};
    const apiUsage: Record<string, number> = {};
    let totalMessages = 0;

    chats.forEach((chat) => {
      const date = new Date(chat.timestamp).toLocaleDateString();
      chatDates[date] = (chatDates[date] || 0) + 1;

      chat.messages.forEach((message) => {
        roleCounts[message.role] = (roleCounts[message.role] || 0) + 1;
        totalMessages++;

        if (message.role === 'assistant') {
          const providerMatch = message.content.match(/provider:\s*([\w-]+)/i);
          const provider = providerMatch ? providerMatch[1] : 'unknown';
          apiUsage[provider] = (apiUsage[provider] || 0) + 1;
        }
      });
    });

    const sortedDates = Object.keys(chatDates).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    const sortedChatsByDate: Record<string, number> = {};
    sortedDates.forEach((date) => {
      sortedChatsByDate[date] = chatDates[date];
    });

    setChatsByDate(sortedChatsByDate);
    setMessagesByRole(roleCounts);
    setApiKeyUsage(Object.entries(apiUsage).map(([provider, count]) => ({ provider, count })));
    setAverageMessagesPerChat(totalMessages / chats.length);
  }, [chats]);

  const getThemeColor = (varName: string): string => {
    if (typeof document !== 'undefined') {
      return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    }

    return isDarkMode ? '#FFFFFF' : '#000000';
  };

  const chartColors = {
    grid: isDarkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)',
    text: getThemeColor('--bolt-elements-textPrimary'),
    border: getThemeColor('--bolt-elements-borderColor'),
  };

  const getChartColors = (index: number) => {
    const baseColors = [
      getThemeColor('--bolt-elements-button-primary-text'),
      isDarkMode ? 'rgb(244, 114, 182)' : 'rgb(236, 72, 153)',
      getThemeColor('--bolt-elements-icon-success'),
      isDarkMode ? 'rgb(250, 204, 21)' : 'rgb(234, 179, 8)',
      isDarkMode ? 'rgb(56, 189, 248)' : 'rgb(14, 165, 233)',
    ];

    const color = baseColors[index % baseColors.length];
    let r = 0;
    let g = 0;
    let b = 0;
    const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    const rgbaMatch = color.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)/);

    if (rgbMatch) {
      [, r, g, b] = rgbMatch.map(Number);
    } else if (rgbaMatch) {
      [, r, g, b] = rgbaMatch.map(Number);
    } else if (color.startsWith('#')) {
      const bigint = parseInt(color.slice(1), 16);
      r = (bigint >> 16) & 255;
      g = (bigint >> 8) & 255;
      b = bigint & 255;
    }

    return {
      bg: `rgba(${r}, ${g}, ${b}, ${isDarkMode ? 0.7 : 0.5})`,
      border: `rgba(${r}, ${g}, ${b}, ${isDarkMode ? 0.9 : 0.8})`,
    };
  };

  const chartData = useMemo(
    () => ({
      history: {
        labels: Object.keys(chartsByDate),
        datasets: [
          {
            label: 'Chats Created',
            data: Object.values(chartsByDate),
            backgroundColor: getChartColors(0).bg,
            borderColor: getChartColors(0).border,
            borderWidth: 1,
          },
        ],
      },
      roles: {
        labels: Object.keys(messagesByRole),
        datasets: [
          {
            label: 'Messages by Role',
            data: Object.values(messagesByRole),
            backgroundColor: Object.keys(messagesByRole).map((_, i) => getChartColors(i).bg),
            borderColor: Object.keys(messagesByRole).map((_, i) => getChartColors(i).border),
            borderWidth: 1,
          },
        ],
      },
      apiUsage: {
        labels: apiKeyUsage.map((item) => item.provider),
        datasets: [
          {
            label: 'API Usage',
            data: apiKeyUsage.map((item) => item.count),
            backgroundColor: apiKeyUsage.map((_, i) => getChartColors(i).bg),
            borderColor: apiKeyUsage.map((_, i) => getChartColors(i).border),
            borderWidth: 1,
          },
        ],
      },
    }),
    [apiKeyUsage, chartsByDate, isDarkMode, messagesByRole],
  );

  const baseChartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      color: chartColors.text,
      plugins: {
        legend: {
          position: 'top' as const,
          labels: {
            color: chartColors.text,
            font: {
              weight: 'bold' as const,
              size: 12,
            },
            padding: 16,
            usePointStyle: true,
          },
        },
        title: {
          display: true,
          color: chartColors.text,
          font: {
            size: 16,
            weight: 'bold' as const,
          },
          padding: 16,
        },
        tooltip: {
          titleColor: chartColors.text,
          bodyColor: chartColors.text,
          backgroundColor: isDarkMode ? 'rgba(23, 23, 23, 0.8)' : 'rgba(255, 255, 255, 0.8)',
          borderColor: chartColors.border,
          borderWidth: 1,
        },
      },
    }),
    [chartColors.border, chartColors.text, isDarkMode],
  );

  const chartOptions = useMemo(
    () => ({
      ...baseChartOptions,
      plugins: {
        ...baseChartOptions.plugins,
        title: {
          ...baseChartOptions.plugins.title,
          text: 'Chat History',
        },
      },
      scales: {
        x: {
          grid: { color: chartColors.grid, drawBorder: false },
          border: { display: false },
          ticks: { color: chartColors.text, font: { weight: 500 } },
        },
        y: {
          grid: { color: chartColors.grid, drawBorder: false },
          border: { display: false },
          ticks: { color: chartColors.text },
        },
      },
    }),
    [baseChartOptions, chartColors.grid, chartColors.text],
  );

  if (!chartComponents) {
    return (
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6 text-sm text-bolt-elements-textSecondary">
        Loading visualizations…
      </div>
    );
  }

  const { Bar, Pie } = chartComponents;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
          <h3 className="mb-4 text-base font-semibold text-bolt-elements-textPrimary">Chat History</h3>
          <div className="h-72">
            <Bar data={chartData.history} options={chartOptions} />
          </div>
        </div>
        <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
          <h3 className="mb-4 text-base font-semibold text-bolt-elements-textPrimary">Message Roles</h3>
          <div className="h-72">
            <Pie
              data={chartData.roles}
              options={{
                ...baseChartOptions,
                plugins: {
                  ...baseChartOptions.plugins,
                  title: { ...baseChartOptions.plugins.title, text: 'Messages by Role' },
                },
              }}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div
          className={classNames(
            'rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4',
          )}
        >
          <div className="text-sm text-bolt-elements-textSecondary">Average messages per chat</div>
          <div className="mt-2 text-2xl font-semibold text-bolt-elements-textPrimary">
            {averageMessagesPerChat.toFixed(1)}
          </div>
        </div>
        <div
          className={classNames(
            'rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4',
          )}
        >
          <div className="text-sm text-bolt-elements-textSecondary">Assistant provider usage</div>
          <div className="mt-3 space-y-2">
            {apiKeyUsage.slice(0, 5).map((item) => (
              <div key={item.provider} className="flex items-center justify-between text-sm">
                <span className="text-bolt-elements-textPrimary">{item.provider}</span>
                <span className="text-bolt-elements-textSecondary">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
