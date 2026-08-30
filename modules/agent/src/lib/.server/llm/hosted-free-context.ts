export interface HostedFreeProjectMemory {
  summary?: string;
  architecture?: string;
  latestGoal?: string;
}

export function shouldUseDeterministicHostedFreeContext(options: {
  provider?: string;
  contextOptimization?: boolean;
  chatMode?: 'discuss' | 'build';
}) {
  return (
    options.provider?.trim().toUpperCase() === 'FREE' &&
    options.contextOptimization === true &&
    (options.chatMode || 'build') === 'build'
  );
}

function compactContextValue(value: string | undefined, maxLength: number) {
  const normalized = String(value || '')
    .trim()
    .replace(/\s+/g, ' ');

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}

export function buildDeterministicHostedFreeSummary(options: {
  latestUserGoal?: string;
  projectMemory?: HostedFreeProjectMemory | null;
}) {
  const currentGoal = compactContextValue(options.latestUserGoal, 1200);
  const previousGoal = compactContextValue(options.projectMemory?.latestGoal, 800);
  const projectSummary = compactContextValue(options.projectMemory?.summary, 1800);
  const architecture = compactContextValue(options.projectMemory?.architecture, 1200);

  return [
    'Deterministic hosted FREE context:',
    currentGoal ? `Current request: ${currentGoal}` : '',
    previousGoal && previousGoal !== currentGoal ? `Previous project goal: ${previousGoal}` : '',
    projectSummary ? `Persisted project summary: ${projectSummary}` : '',
    architecture ? `Persisted architecture: ${architecture}` : '',
    'The attached workspace snapshot is authoritative. Preserve it and apply the latest request incrementally.',
  ]
    .filter(Boolean)
    .join('\n');
}
