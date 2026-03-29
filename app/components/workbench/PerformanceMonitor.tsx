import { useStore } from '@nanostores/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { tokenUsageStore } from '~/lib/stores/performance';
import { classNames } from '~/utils/classNames';

interface NodePerformanceSample {
  available: boolean;
  timestamp: number;
  memory?: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  cpu?: {
    user: number;
    system: number;
  };
}

interface PerformanceThresholds {
  memoryMb: number;
  cpuPercent: number;
  tokenTotal: number;
}

const STORAGE_KEY = 'bolt_performance_thresholds';

const DEFAULT_THRESHOLDS: PerformanceThresholds = {
  memoryMb: 1200,
  cpuPercent: 80,
  tokenTotal: 25000,
};

function readThresholds(): PerformanceThresholds {
  if (typeof window === 'undefined') {
    return DEFAULT_THRESHOLDS;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return DEFAULT_THRESHOLDS;
  }

  try {
    return { ...DEFAULT_THRESHOLDS, ...(JSON.parse(raw) as Partial<PerformanceThresholds>) };
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}

function formatMb(bytes = 0) {
  return (bytes / (1024 * 1024)).toFixed(0);
}

export function PerformanceMonitor() {
  const tokenUsage = useStore(tokenUsageStore);
  const [sample, setSample] = useState<NodePerformanceSample | null>(null);
  const [cpuPercent, setCpuPercent] = useState(0);
  const thresholdsRef = useRef(readThresholds());
  const previousCpuRef = useRef<{ total: number; timestamp: number } | null>(null);

  useEffect(() => {
    let mounted = true;

    const poll = async () => {
      try {
        thresholdsRef.current = readThresholds();

        const response = await fetch('/api/system/performance');

        if (!response.ok) {
          return;
        }

        const nextSample = (await response.json()) as NodePerformanceSample;

        if (!mounted || !nextSample.available || !nextSample.cpu) {
          return;
        }

        const totalCpuMicros = nextSample.cpu.user + nextSample.cpu.system;
        const previous = previousCpuRef.current;

        if (previous) {
          const cpuDeltaMicros = totalCpuMicros - previous.total;
          const timeDeltaMs = nextSample.timestamp - previous.timestamp;

          if (timeDeltaMs > 0) {
            const rawPercent = (cpuDeltaMicros / (timeDeltaMs * 1000)) * 100;
            setCpuPercent(Math.max(0, Math.min(100, rawPercent)));
          }
        }

        previousCpuRef.current = {
          total: totalCpuMicros,
          timestamp: nextSample.timestamp,
        };

        setSample(nextSample);
      } catch {
        // Best-effort widget; keep silent if endpoint is unavailable.
      }
    };

    poll();

    const interval = setInterval(poll, 5000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const recommendations = useMemo(() => {
    const items: string[] = [];
    const thresholds = thresholdsRef.current;
    const rssMb = Number(formatMb(sample?.memory?.rss));

    if (rssMb > thresholds.memoryMb) {
      items.push('Memory is high. Close unused tabs or disable heavy previews.');
    }

    if (cpuPercent > thresholds.cpuPercent) {
      items.push('CPU is high. Reduce background tasks or switch to a smaller model.');
    }

    if (tokenUsage.totalTokens > thresholds.tokenTotal) {
      items.push('Token usage is high. Consider local models for lightweight prompts.');
    }

    if (items.length === 0) {
      items.push('Resources look healthy.');
    }

    return items;
  }, [sample, cpuPercent, tokenUsage.totalTokens]);

  const warning = recommendations.some((item) => item !== 'Resources look healthy.');

  return (
    <div
      className={classNames(
        'min-w-[250px] rounded-md border px-2 py-1 text-xs',
        warning
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
          : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary',
      )}
      title="Performance monitor"
    >
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-medium">Perf</span>
        <span>
          CPU {cpuPercent.toFixed(0)}% | RAM {formatMb(sample?.memory?.rss)}MB | Tokens {tokenUsage.totalTokens}
        </span>
      </div>
      <div className="truncate text-[10px]">{recommendations[0]}</div>
    </div>
  );
}
