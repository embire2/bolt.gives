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
    id: 'release-v3.0.7',
    name: 'v3.0.7 managed Cloudflare trials and locked FREE startup regression',
    description:
      'bolt.gives now ships the managed Cloudflare trial-instance control plane, enforces one-client/one-instance in runtime via email plus browser session ownership, and includes a browser release regression that verifies startup lands on the locked FREE DeepSeek V3.2 path.',
    releaseDate: '2026-04-03',
  },
  {
    id: 'release-v3.0.6',
    name: 'v3.0.6 narrower browser shell, tenant approval flow, release smoke gate',
    description:
      'CodeMirror languages now split more aggressively, terminal and GitHub deploy tooling stay off the startup path until explicitly opened, commentary heartbeats use runtime command/file events, tenant onboarding now includes approval plus invite-based password setup, and the live preview recovery smoke now runs inside the release workflow.',
    releaseDate: '2026-04-03',
  },
  {
    id: 'release-v3.0.5',
    name: 'v3.0.5 thinner client, smarter commentary, stronger tenants',
    description:
      'The client now uses a metadata-only provider catalog, server LLM execution keeps heavy provider SDKs out of the browser, commentary heartbeats derive from real file/command state, tenant users can sign in and rotate passwords, and a committed live smoke flow now verifies generated app success plus preview auto-recovery.',
    releaseDate: '2026-04-03',
  },
  {
    id: 'release-v3.0.3',
    name: 'v3.0.3 server-first runtime and tenant admin baseline',
    description:
      'The browser now carries less runtime weight, editor/collaboration/chart surfaces are deferred harder, sidebar access is explicit again, and server-hosted instances get a bootstrap tenant admin dashboard.',
    releaseDate: '2026-03-30',
  },
  {
    id: 'release-v3.0.2',
    name: 'v3.0.2 cloudflare managed-instance blueprint',
    description:
      'The release line now documents the experimental one-client / one-instance Cloudflare managed service design, adds a real Chat/Workspace tab shell, and ships Pages FREE-provider relay fixes.',
    releaseDate: '2026-03-28',
  },
  {
    id: 'release-v3.0.1',
    name: 'v3.0.1 hosted free-model fallback',
    description:
      'Hosted FREE moved to a managed DeepSeek V3.2 route as the visible default, alongside a wider prompt rail and refreshed release docs.',
    releaseDate: '2026-03-25',
  },
  {
    id: 'release-v3.0.0',
    name: 'v3.0.0 runtime reliability reset',
    description:
      'Starter continuation, provider/key normalization, dev-port resilience, path-safe file actions, and verified OpenAI gpt-5.4 live app generation.',
    releaseDate: '2026-03-22',
  },
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
