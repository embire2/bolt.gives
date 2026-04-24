import { useMemo, useSyncExternalStore } from 'react';
import { isHostedRuntimeEnabled } from '~/lib/runtime/hosted-runtime-client';
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

interface PerformanceSnapshot {
  cpuPercent: number;
  sample: NodePerformanceSample | null;
}

const EMPTY_PERFORMANCE_SNAPSHOT: PerformanceSnapshot = {
  cpuPercent: 0,
  sample: null,
};

const performanceListeners = new Set<() => void>();
let performanceSnapshot: PerformanceSnapshot = EMPTY_PERFORMANCE_SNAPSHOT;
let performancePreviousCpuSample: { total: number; timestamp: number } | null = null;
let performancePollTimer: ReturnType<typeof setTimeout> | null = null;
let performancePollController: AbortController | null = null;
let performancePollInFlight = false;

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

function useTokenUsageSnapshot() {
  return useSyncExternalStore(
    (onStoreChange) => tokenUsageStore.subscribe(onStoreChange),
    () => tokenUsageStore.get(),
    () => tokenUsageStore.get(),
  );
}

function emitPerformanceSnapshot(nextSnapshot: PerformanceSnapshot) {
  performanceSnapshot = nextSnapshot;
  performanceListeners.forEach((listener) => listener());
}

function getNextPerformancePollDelay() {
  const hidden = typeof document !== 'undefined' ? document.hidden : false;

  if (isHostedRuntimeEnabled()) {
    return hidden ? 120000 : 60000;
  }

  return hidden ? 30000 : 10000;
}

function clearPerformancePollTimer() {
  if (performancePollTimer) {
    clearTimeout(performancePollTimer);
    performancePollTimer = null;
  }
}

function schedulePerformancePoll(delayMs: number) {
  clearPerformancePollTimer();

  if (performanceListeners.size === 0) {
    return;
  }

  performancePollTimer = setTimeout(() => {
    void pollPerformanceSample();
  }, delayMs);
}

async function pollPerformanceSample() {
  if (performancePollInFlight || performanceListeners.size === 0) {
    return;
  }

  performancePollInFlight = true;

  const controller = new AbortController();
  performancePollController = controller;

  try {
    const response = await fetch('/api/system/performance', {
      signal: controller.signal,
    });

    if (!response.ok) {
      return;
    }

    const nextSample = (await response.json()) as NodePerformanceSample;

    if (!nextSample.available || !nextSample.cpu) {
      return;
    }

    const totalCpuMicros = nextSample.cpu.user + nextSample.cpu.system;
    const previous = performancePreviousCpuSample;
    let nextCpuPercent = performanceSnapshot.cpuPercent;

    if (previous) {
      const cpuDeltaMicros = totalCpuMicros - previous.total;
      const timeDeltaMs = nextSample.timestamp - previous.timestamp;

      if (timeDeltaMs > 0) {
        const rawPercent = (cpuDeltaMicros / (timeDeltaMs * 1000)) * 100;
        nextCpuPercent = Math.max(0, Math.min(100, rawPercent));
      }
    }

    performancePreviousCpuSample = {
      total: totalCpuMicros,
      timestamp: nextSample.timestamp,
    };

    emitPerformanceSnapshot({
      sample: nextSample,
      cpuPercent: nextCpuPercent,
    });
  } catch (error) {
    if ((error as { name?: string })?.name !== 'AbortError') {
      // Best-effort widget; keep silent if endpoint is unavailable.
    }
  } finally {
    if (performancePollController === controller) {
      performancePollController = null;
    }

    performancePollInFlight = false;
    schedulePerformancePoll(getNextPerformancePollDelay());
  }
}

function subscribeToPerformanceSnapshot(listener: () => void) {
  performanceListeners.add(listener);

  if (performanceListeners.size === 1) {
    schedulePerformancePoll(0);
  }

  return () => {
    performanceListeners.delete(listener);

    if (performanceListeners.size === 0) {
      clearPerformancePollTimer();

      if (performancePollController) {
        performancePollController.abort();
        performancePollController = null;
      }

      performancePollInFlight = false;
      performancePreviousCpuSample = null;
    }
  };
}

function usePerformanceSnapshot() {
  return useSyncExternalStore(
    subscribeToPerformanceSnapshot,
    () => performanceSnapshot,
    () => performanceSnapshot,
  );
}

export function PerformanceMonitor() {
  const { sample, cpuPercent } = usePerformanceSnapshot();
  const tokenUsage = useTokenUsageSnapshot();

  const recommendations = useMemo(() => {
    const items: string[] = [];
    const thresholds = readThresholds();
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
