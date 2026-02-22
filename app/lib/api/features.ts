export interface Feature {
  id: string;
  name: string;
  description: string;
  viewed: boolean;
  releaseDate: string;
}

const VIEWED_FEATURES_STORAGE_KEY = 'bolt_viewed_features';

type FeatureDefinition = Omit<Feature, 'viewed'>;

const FEATURE_FEED: FeatureDefinition[] = [
  {
    id: 'release-v1.0.3',
    name: 'v1.0.3 reliability hardening',
    description:
      'Architect recovery events, long-run timeline de-bloat, provider history persistence, and stricter runtime safeguards.',
    releaseDate: '2026-02-20',
  },
  {
    id: 'release-v1.0.2',
    name: 'v1.0.2 transparency baseline',
    description:
      'Execution transparency panel, commentary instrumentation, reliability guardrails, and persistent project memory.',
    releaseDate: '2026-02-17',
  },
  {
    id: 'release-v1.0.1',
    name: 'v1.0.1 multimodal and multi-step stability',
    description:
      'Image attachment support for prompts, stronger small-model behavior, and default multi-step backend execution.',
    releaseDate: '2026-02-15',
  },
];

function readViewedFeatureIds(): Set<string> {
  if (typeof window === 'undefined') {
    return new Set();
  }

  try {
    const raw = window.localStorage.getItem(VIEWED_FEATURES_STORAGE_KEY);

    if (!raw) {
      return new Set();
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return new Set();
    }

    return new Set(parsed.filter((id): id is string => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

function persistViewedFeatureIds(ids: Set<string>) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(VIEWED_FEATURES_STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // Persistence failures should never block feature rendering.
  }
}

export const getFeatureFlags = async (): Promise<Feature[]> => {
  const viewedFeatureIds = readViewedFeatureIds();
  const sorted = [...FEATURE_FEED].sort((a, b) => Date.parse(b.releaseDate) - Date.parse(a.releaseDate));

  return sorted.map((feature) => ({
    ...feature,
    viewed: viewedFeatureIds.has(feature.id),
  }));
};

export const markFeatureViewed = async (featureId: string): Promise<void> => {
  if (!featureId) {
    return;
  }

  const viewedFeatureIds = readViewedFeatureIds();
  viewedFeatureIds.add(featureId);
  persistViewedFeatureIds(viewedFeatureIds);
};
