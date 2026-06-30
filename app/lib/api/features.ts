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
    id: 'release-v3.0.9.25',
    name: 'v3.0.9.25 blocked shell mutation recovery',
    description:
      'Hosted FREE runs now auto-heal blocked shell file-write attempts by asking the model to retry with complete file actions, while prompts explicitly forbid shell redirection, tee, sed -i, and inline file-writing scripts for project files.',
    releaseDate: '2026-06-30',
  },
  {
    id: 'release-v3.0.9.24',
    name: 'v3.0.9.24 live CLI workspaces, repair UX, and project publishing',
    description:
      'Hosted projects now auto-provision dedicated Ubuntu CLI workspaces, preview repair shows a calm in-progress state instead of refused-connection churn, and Preview can publish to a bolt.gives subdomain or start $10/month Stripe checkout for custom-domain hosting.',
    releaseDate: '2026-06-30',
  },
  {
    id: 'release-v3.0.9.23',
    name: 'v3.0.9.23 dedicated runtime-node live workspace setup',
    description:
      'A new Live Workspaces setup wizard can provision isolated Ubuntu CLI users, private per-project workspace directories, and dedicated PostgreSQL databases on a configured runtime node without exposing admin SSH credentials to the browser.',
    releaseDate: '2026-06-29',
  },
  {
    id: 'release-v3.0.9.22',
    name: 'v3.0.9.22 Cloudflare Pages collaboration transport hotfix',
    description:
      'Cloudflare Pages and managed fleet hosts now use the central bolt.gives collaboration WebSocket endpoint instead of same-host /collab routes that return 404 on Pages.',
    releaseDate: '2026-06-29',
  },
  {
    id: 'release-v3.0.9.21',
    name: 'v3.0.9.21 focused Preview and Calendar first pass',
    description:
      'Preview and Code now get the main Workspace viewport, manual Code selection is no longer stolen by preview refreshes, and Google Calendar-style prompts start from a deterministic first-pass app with the requested visible heading text.',
    releaseDate: '2026-06-29',
  },
  {
    id: 'release-v3.0.9.20',
    name: 'v3.0.9.20 compact Workspace prompt',
    description:
      'Workspace now uses a small follow-up prompt bar so files, Preview, and execution status stay visible, while Chat keeps the full provider/tools composer.',
    releaseDate: '2026-06-28',
  },
  {
    id: 'release-v3.0.9.19',
    name: 'v3.0.9.19 visible follow-up queue',
    description:
      'Follow-up prompts now stay usable while hidden preview recovery is still running: typed prompts queue visibly and send after the active run is idle, while exact-text guards ignore file-path false positives.',
    releaseDate: '2026-06-27',
  },
  {
    id: 'release-v3.0.9.18',
    name: 'v3.0.9.18 recovered follow-up objective guard',
    description:
      'Google Calendar-style follow-ups now keep their exact visible UI requirements through hidden preview recovery, including structured message parts and already-healthy old previews.',
    releaseDate: '2026-06-27',
  },
  {
    id: 'release-v3.0.9.17',
    name: 'v3.0.9.17 full-history exact follow-up guard',
    description:
      'Exact visible follow-up requirements are now checked across all user-message history available to the active stream, keeping recovery attached to the real follow-up prompt.',
    releaseDate: '2026-06-27',
  },
  {
    id: 'release-v3.0.9.16',
    name: 'v3.0.9.16 robust exact follow-up guard',
    description:
      'The exact visible text guard now checks every relevant latest-user-request candidate, so follow-up labels requested during continuation cannot be lost behind an older project goal.',
    releaseDate: '2026-06-27',
  },
  {
    id: 'release-v3.0.9.15',
    name: 'v3.0.9.15 exact follow-up outcome guard',
    description:
      'Follow-up prompts that request exact visible text, such as adding an agenda label to a generated calendar, now keep continuing until that literal text is present in the current UI source files.',
    releaseDate: '2026-06-27',
  },
  {
    id: 'release-v3.0.9.14',
    name: 'v3.0.9.14 history-aware follow-up reliability',
    description:
      'Follow-up prompts that ask to improve, add, change, or fix the existing project now keep continuing until a meaningful file edit is applied, instead of treating an already-healthy old preview as success.',
    releaseDate: '2026-06-27',
  },
  {
    id: 'release-v3.0.9.13',
    name: 'v3.0.9.13 follow-up composer and artifact stream repair',
    description:
      'Follow-up prompts now stay visible from both Chat and Workspace, and the artifact parser recovers when a model restarts an artifact inside an open file action instead of saving raw artifact tags into project files.',
    releaseDate: '2026-06-27',
  },
  {
    id: 'release-v3.0.9.12',
    name: 'v3.0.9.12 starter recovery status repair',
    description:
      'Preview health now clears stale starter-placeholder Recovery warnings once the generated workspace replaces the fallback starter and the preview is healthy.',
    releaseDate: '2026-06-27',
  },
  {
    id: 'release-v3.0.9.11',
    name: 'v3.0.9.11 hosted FREE starter continuation repair',
    description:
      'Hosted FREE project starts now continue after starter import and send the hidden model follow-up that replaces the fallback Vite screen with the requested generated app.',
    releaseDate: '2026-06-27',
  },
  {
    id: 'release-v3.0.9.10',
    name: 'v3.0.9.10 managed fleet rollout repair',
    description:
      'Managed Cloudflare refreshes now pass Wrangler commit-dirty consent for the live rsync checkout model, so active tenant Pages projects can roll forward to the latest health-verified build instead of failing on benign dirty-tree warnings.',
    releaseDate: '2026-06-27',
  },
  {
    id: 'release-v3.0.9.9',
    name: 'v3.0.9.9 hosted FREE start-project resilience',
    description:
      'Hosted FREE project creation now retries transient DeepSeek/OpenRouter internal-reference failures, returns clear FREE availability messages when retries are exhausted, and prevents ignored late stream disconnects from appearing as false Workspace failures after preview-ready completion.',
    releaseDate: '2026-06-27',
  },
  {
    id: 'release-v3.0.9.8',
    name: 'v3.0.9.8 Pages FREE secret binding repair',
    description:
      'Cloudflare Pages sync now writes relay and quota secrets directly into production and preview deployment configs, fixing direct Pages FREE requests that had a secret present but failed runtime quota authorization.',
    releaseDate: '2026-06-26',
  },
  {
    id: 'release-v3.0.9.7',
    name: 'v3.0.9.7 FREE quota deployment hardening',
    description:
      'Cloudflare Pages and managed fleet sync now provisions both the hosted FREE relay secret and the quota secret, keeping the locked DeepSeek V4 Pro path usable on direct Pages URLs and managed instances without exposing the upstream key.',
    releaseDate: '2026-06-26',
  },
  {
    id: 'release-v3.0.9.6',
    name: 'v3.0.9.6 hosted FREE daily spend cap',
    description:
      'The hosted FREE DeepSeek V4 Pro path now checks a server-side $1 per-person daily quota before coding starts, resets at 00:00 GMT+2, and tells users to bring their own provider key or wait for reset when the cap is reached.',
    releaseDate: '2026-06-26',
  },
  {
    id: 'release-v3.0.9.5',
    name: 'v3.0.9.5 hosted FREE Pages credential hardening',
    description:
      'Cloudflare Pages deployments now have a dedicated FREE-provider config sync and live smoke path so the locked DeepSeek V4 Pro route stays server-side and does not regress into asking users for an API key.',
    releaseDate: '2026-06-24',
  },
  {
    id: 'release-v3.0.9.4',
    name: 'v3.0.9.4 model refresh and workspace responsiveness',
    description:
      'User-configured model providers now include refreshed coding-capable model defaults plus MiniMax M3/M2.7 support, while the workspace keeps terminal, performance monitor, and export tooling off the startup path so project previews and file editing feel lighter.',
    releaseDate: '2026-06-23',
  },
  {
    id: 'release-v3.0.9.3',
    name: 'v3.0.9.3 web browsing and scrape-to-build restore',
    description:
      'Built-in web browsing now relaunches stale Playwright browsers, returns structured tool failures instead of crashing chat, and automatically injects direct website URL content into build prompts so users can scrape an existing site and generate a new previewable project from it.',
    releaseDate: '2026-05-05',
  },
  {
    id: 'release-v3.0.9.2',
    name: 'v3.0.9.2 managed Cloudflare coding restore',
    description:
      'Managed Cloudflare trial instances now pass authenticated hosted FREE relay requests through the server CSRF gate, restoring prompt-to-preview coding and follow-up edits on Pages-hosted instances without exposing operator-funded model credentials.',
    releaseDate: '2026-05-03',
  },
  {
    id: 'release-v3.0.9.1',
    name: 'v3.0.9.1 compact workspace activity and hosted follow-up reliability',
    description:
      'Workspace Activity now stays compact so generated files and preview remain visible, while hosted FREE project generation keeps follow-up prompts anchored to the current runtime snapshot and closes verified preview streams promptly.',
    releaseDate: '2026-04-28',
  },
  {
    id: 'release-v3.0.8',
    name: 'v3.0.8 Cloudflare trial registration and private admin control plane',
    description:
      'Managed Cloudflare trials now require a client registration profile, private operator records are stored in the server-backed admin panel, admin email/draft activity is tracked centrally, and admin.bolt.gives becomes the operator-facing control surface for trial assignment visibility.',
    releaseDate: '2026-04-04',
  },
  {
    id: 'release-v3.0.7',
    name: 'v3.0.7 managed Cloudflare trials and locked FREE startup regression',
    description:
      'bolt.gives now ships the managed Cloudflare trial-instance control plane, enforces one-client/one-instance in runtime via email plus browser session ownership, and includes a browser release regression that verifies startup lands on the locked FREE DeepSeek V4 Pro path.',
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
      'Hosted FREE moved to a managed OpenRouter route as the visible default, alongside a wider prompt rail and refreshed release docs.',
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
