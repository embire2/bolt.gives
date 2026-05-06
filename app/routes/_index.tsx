import { json, redirect, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/cloudflare';
import { ClientOnly } from 'remix-utils/client-only';
import { Chat } from '~/components/chat/Chat.client';
import { Header } from '~/components/header/Header';
import { FREE_HOSTED_MODEL_LABEL, FREE_PROVIDER_NAME } from '~/lib/modules/llm/free-provider-config';
import { getCreateRedirectHost, getPublicUrlConfig } from '~/lib/public-urls';
import BackgroundRays from '~/components/ui/BackgroundRays';
import { APP_VERSION } from '~/lib/version';

const SCREENSHOT_BASE_URL = '/screenshots';

const screenshotCards = [
  {
    title: 'Public home',
    description: 'The public project website with release notes, links, and contributor pathway.',
    src: `${SCREENSHOT_BASE_URL}/home.png`,
  },
  {
    title: 'Chat workspace',
    description: 'The hosted FREE model path starts from a visible chat-first coding surface.',
    src: `${SCREENSHOT_BASE_URL}/chat.png`,
  },
  {
    title: 'Plan prompts',
    description: 'Users can ask for structured planning before file changes are made.',
    src: `${SCREENSHOT_BASE_URL}/chat-plan.png`,
  },
  {
    title: 'Workspace preview',
    description: 'Generated files, execution state, and preview stay visible while the runtime works.',
    src: `${SCREENSHOT_BASE_URL}/system-in-action.png`,
  },
  {
    title: 'Changelog',
    description: 'Release history stays public so changes are visible and auditable.',
    src: `${SCREENSHOT_BASE_URL}/changelog.png`,
  },
];

const platformHighlights = [
  'Stable hosted release v3.0.9.3 with v3.1.0 platform hardening in progress.',
  `Hosted ${FREE_PROVIDER_NAME} provider locked to ${FREE_HOSTED_MODEL_LABEL} through the protected server-side path.`,
  'Web browsing and website scrape-to-build prompts are restored for direct URL-based rebuilds.',
  'Managed Cloudflare trials use their own assigned hostnames and same-origin runtime previews.',
  'Follow-up prompts keep project history, runtime snapshots, and current workspace context.',
  'Contributors can apply through the public pathway and join roadmap-aligned PR work.',
];

export const meta: MetaFunction = () => {
  return [
    { title: `bolt.gives v${APP_VERSION} | Open-source AI coding workspace` },
    {
      name: 'description',
      content:
        'bolt.gives is an open-source agentic coding platform with hosted previews, transparent execution, managed Cloudflare trials, and a public contributor pathway.',
    },
  ];
};

export const loader = ({ request }: LoaderFunctionArgs) => {
  const host = new URL(request.url).host.toLowerCase();
  const { adminHost } = getPublicUrlConfig(undefined, request.url);
  const createRedirectHost = getCreateRedirectHost();

  if (host === adminHost) {
    return redirect('/tenant-admin');
  }

  if (host === createRedirectHost) {
    return redirect('/managed-instances');
  }

  return json({});
};

function HomeShellFallback() {
  return (
    <main className="flex min-h-0 flex-1 items-center justify-center px-4 py-6 sm:px-6 lg:px-8">
      <div className="w-full max-w-chat rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-xs text-bolt-elements-textSecondary">
          <span className="font-medium text-bolt-elements-textTertiary">Provider</span>
          <span className="rounded-full border border-bolt-elements-borderColor px-2 py-0.5 text-bolt-elements-textPrimary">
            {FREE_PROVIDER_NAME}
          </span>
          <span className="text-bolt-elements-textTertiary">Model</span>
          <span className="rounded-full border border-bolt-elements-borderColor px-2 py-0.5 text-bolt-elements-textPrimary">
            {FREE_HOSTED_MODEL_LABEL}
          </span>
        </div>
        <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-4 py-5 text-sm text-bolt-elements-textSecondary">
          Preparing the coding workspace. The prompt box will become interactive as soon as the chat shell is ready.
        </div>
      </div>
    </main>
  );
}

export function ChatWorkspace() {
  return (
    <div className="flex h-full w-full flex-col bg-bolt-elements-background-depth-1">
      <BackgroundRays />
      <Header />
      <ClientOnly fallback={<HomeShellFallback />}>{() => <Chat />}</ClientOnly>
    </div>
  );
}

export default function Index() {
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#f5f1e8] text-slate-950">
      <BackgroundRays />
      <Header />
      <main className="modern-scrollbar relative z-1 flex-1 overflow-y-auto overflow-x-hidden">
        <section className="relative overflow-hidden border-b border-slate-950/10 px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div className="absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_30%_20%,rgba(20,184,166,0.28),transparent_34%),radial-gradient(circle_at_75%_10%,rgba(245,158,11,0.24),transparent_30%)]" />
          <div className="relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div>
              <div className="inline-flex rounded-full border border-slate-950/15 bg-white/70 px-4 py-2 text-xs font-black uppercase tracking-[0.24em] text-teal-800 shadow-sm backdrop-blur">
                Open-source agentic coding
              </div>
              <h1 className="mt-6 max-w-4xl text-5xl font-black leading-[0.95] tracking-[-0.05em] text-slate-950 sm:text-6xl lg:text-7xl">
                The transparent AI coding workspace for people who want to see the work.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-700">
                bolt.gives turns prompts into previewable projects with hosted runtime execution, visible commentary,
                technical logs, Cloudflare trial instances, and history-aware follow-up prompts that build on the
                current project instead of starting over.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="/chat"
                  className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-lg shadow-slate-950/20 transition hover:-translate-y-0.5 hover:bg-teal-900"
                >
                  Start coding
                </a>
                <a
                  href="https://create.bolt.gives"
                  className="rounded-2xl border border-slate-950/15 bg-white px-5 py-3 text-sm font-black text-slate-950 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-600"
                >
                  Create managed instance
                </a>
                <a
                  href="/contribute"
                  className="rounded-2xl border border-amber-700/30 bg-amber-100 px-5 py-3 text-sm font-black text-amber-950 shadow-sm transition hover:-translate-y-0.5 hover:bg-amber-200"
                >
                  Contribute to Project
                </a>
              </div>
              <div className="mt-8 grid max-w-xl grid-cols-3 gap-3 text-sm">
                <div className="rounded-2xl border border-slate-950/10 bg-white/70 p-4 shadow-sm">
                  <div className="text-2xl font-black">v{APP_VERSION}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">stable</div>
                </div>
                <div className="rounded-2xl border border-slate-950/10 bg-white/70 p-4 shadow-sm">
                  <div className="text-2xl font-black">v3.1.0</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">roadmap</div>
                </div>
                <div className="rounded-2xl border border-slate-950/10 bg-white/70 p-4 shadow-sm">
                  <div className="text-2xl font-black">{FREE_HOSTED_MODEL_LABEL}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">{FREE_PROVIDER_NAME}</div>
                </div>
              </div>
            </div>
            <div className="rounded-[2rem] border border-slate-950/10 bg-slate-950 p-3 shadow-2xl shadow-slate-950/20">
              <img
                src={`${SCREENSHOT_BASE_URL}/system-in-action.png`}
                alt="bolt.gives workspace showing files, live activity, and preview"
                className="aspect-video w-full rounded-[1.35rem] object-cover"
              />
              <div className="grid gap-3 p-4 text-sm text-white/75 sm:grid-cols-3">
                <div>
                  <div className="font-black text-white">Visible execution</div>
                  <p className="mt-1">Commentary and technical feeds show what the agent is doing.</p>
                </div>
                <div>
                  <div className="font-black text-white">Previewable output</div>
                  <p className="mt-1">Hosted runtimes install, build, start, and verify real previews.</p>
                </div>
                <div>
                  <div className="font-black text-white">History aware</div>
                  <p className="mt-1">Follow-up prompts reuse current runtime snapshots and project context.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <div className="text-sm font-black uppercase tracking-[0.22em] text-teal-800">Current release</div>
              <h2 className="mt-3 text-4xl font-black tracking-[-0.04em] text-slate-950">What is live now</h2>
              <p className="mt-4 text-base leading-7 text-slate-700">
                The current release line focuses on prompt-to-preview reliability, safer hosted FREE relay behavior, web
                browsing recovery, direct website scrape-to-build prompts, and managed Cloudflare instance previews that
                stay on each assigned hostname.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <a href="/changelog" className="text-sm font-black text-teal-800 underline underline-offset-4">
                  Read changelog
                </a>
                <a
                  href="https://github.com/embire2/bolt.gives"
                  className="text-sm font-black text-teal-800 underline underline-offset-4"
                >
                  GitHub repository
                </a>
                <a href="/contribute" className="text-sm font-black text-teal-800 underline underline-offset-4">
                  Contributor pathway
                </a>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {platformHighlights.map((highlight) => (
                <div key={highlight} className="rounded-3xl border border-slate-950/10 bg-white p-5 shadow-sm">
                  <div className="mb-4 h-2 w-12 rounded-full bg-gradient-to-r from-teal-600 to-amber-500" />
                  <p className="text-sm font-semibold leading-6 text-slate-700">{highlight}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-slate-950/10 bg-white/70 px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-sm font-black uppercase tracking-[0.22em] text-amber-800">Real screenshots</div>
                <h2 className="mt-3 text-4xl font-black tracking-[-0.04em] text-slate-950">The product as it ships</h2>
              </div>
              <p className="max-w-xl text-sm leading-6 text-slate-600">
                These screenshots are captured from the running product and used in the project README so the public
                site, docs, and release artifacts stay aligned.
              </p>
            </div>
            <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {screenshotCards.map((screenshot) => (
                <article
                  key={screenshot.title}
                  className="overflow-hidden rounded-[1.75rem] border border-slate-950/10 bg-white shadow-sm"
                >
                  <img
                    src={screenshot.src}
                    alt={`${screenshot.title} screenshot`}
                    className="aspect-video w-full object-cover"
                  />
                  <div className="p-5">
                    <h3 className="text-lg font-black text-slate-950">{screenshot.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{screenshot.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-5 md:grid-cols-3">
            <a
              href="/chat"
              className="rounded-[2rem] bg-slate-950 p-7 text-white shadow-xl shadow-slate-950/15 transition hover:-translate-y-0.5"
            >
              <div className="text-sm font-black uppercase tracking-[0.22em] text-white/55">Build</div>
              <h3 className="mt-4 text-2xl font-black">Open the coding workspace</h3>
              <p className="mt-3 text-sm leading-6 text-white/70">
                Start with the hosted FREE model, visible execution, and runtime preview.
              </p>
            </a>
            <a
              href="https://create.bolt.gives"
              className="rounded-[2rem] border border-slate-950/10 bg-white p-7 shadow-sm transition hover:-translate-y-0.5"
            >
              <div className="text-sm font-black uppercase tracking-[0.22em] text-teal-800">Trial</div>
              <h3 className="mt-4 text-2xl font-black">Create a managed instance</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Register for a Cloudflare Pages instance with its own hostname and preview path.
              </p>
            </a>
            <a
              href="/contribute"
              className="rounded-[2rem] border border-amber-700/20 bg-amber-100 p-7 shadow-sm transition hover:-translate-y-0.5"
            >
              <div className="text-sm font-black uppercase tracking-[0.22em] text-amber-900">Contribute</div>
              <h3 className="mt-4 text-2xl font-black">Contribute to Project</h3>
              <p className="mt-3 text-sm leading-6 text-amber-950/75">
                Apply with your GitHub username, experience, profile details, and why you want to help.
              </p>
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
