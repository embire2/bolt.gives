import { json, redirect, type LinksFunction, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/cloudflare';
import { ClientOnly } from 'remix-utils/client-only';
import { Chat } from '~/components/chat/Chat.client';
import { Header } from '~/components/header/Header';
import { FREE_HOSTED_MODEL_LABEL, FREE_PROVIDER_NAME } from '~/lib/modules/llm/free-provider-config';
import { getCreateRedirectHost, getPublicUrlConfig } from '~/lib/public-urls';
import BackgroundRays from '~/components/ui/BackgroundRays';
import { APP_VERSION } from '~/lib/version';

const SCREENSHOT_BASE_URL = '/screenshots';
const SITE_URL = 'https://bolt.gives';
const SEO_IMAGE_PATH = '/seo/bolt-gives-agentic-coding-platform.png';
const SEO_IMAGE_URL = `${SITE_URL}${SEO_IMAGE_PATH}`;
const SEO_TITLE = `bolt.gives v${APP_VERSION} | Open-source AI coding workspace with live previews`;
const SEO_DESCRIPTION =
  'Build previewable web apps from prompts with bolt.gives: an open-source AI coding workspace with hosted runtime execution, transparent logs, managed Cloudflare previews, website scrape-to-build, and history-aware follow-up prompts.';
const SEO_KEYWORDS = [
  'open-source AI coding workspace',
  'AI app builder',
  'AI website builder',
  'prompt to preview',
  'hosted runtime preview',
  'Cloudflare Pages AI app',
  'transparent agentic coding',
  'browser based coding agent',
  'DeepSeek V3.2 coding workspace',
  'bolt.gives contributor project',
].join(', ');

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

const conversionCards = [
  {
    eyebrow: 'Prompt-to-preview',
    title: 'Generate a working app, not just code snippets.',
    description:
      'The hosted runtime installs dependencies, writes files, starts the dev server, verifies preview health, and keeps the output visible while the agent works.',
  },
  {
    eyebrow: 'Transparent agent',
    title: 'See the plan, files, commands, and recovery path.',
    description:
      'Live commentary and technical execution feeds make each action inspectable, so users can trust what changed before they publish or continue.',
  },
  {
    eyebrow: 'History-aware iteration',
    title: 'Follow-up prompts build on the current project.',
    description:
      'Runtime snapshots and project-scoped context keep the AI oriented inside the app it already created instead of starting from a blank prompt.',
  },
  {
    eyebrow: 'Managed Cloudflare',
    title: 'Give each client a previewable instance.',
    description:
      'Managed trial instances use assigned hostnames, same-origin runtime previews, and the protected hosted FREE provider path.',
  },
];

const builderSteps = [
  {
    title: 'Describe the product',
    description:
      'Ask for a landing page, internal tool, dashboard, SaaS app, scraped website rebuild, or follow-up improvement using natural language.',
  },
  {
    title: 'Watch the runtime work',
    description:
      'bolt.gives shows commentary, file actions, command output, preview status, and recovery decisions while the hosted runtime executes.',
  },
  {
    title: 'Iterate from the live state',
    description:
      'Use follow-up prompts to improve the current project with the latest files, runtime snapshot, and preview context already attached.',
  },
];

const audienceCards = [
  {
    title: 'Founders and builders',
    description:
      'Turn early product ideas into previewable websites, SaaS flows, landing pages, and demo apps without hiding the work behind a black box.',
  },
  {
    title: 'Agencies and consultants',
    description:
      'Create client-specific Cloudflare trial instances, show visible progress, and keep each preview on the assigned hostname.',
  },
  {
    title: 'Open-source contributors',
    description:
      'Join the roadmap around prompt-to-preview reliability, runtime transparency, fleet observability, template packs, and self-hosting.',
  },
];

const faqItems = [
  {
    question: 'What is bolt.gives?',
    answer:
      'bolt.gives is an open-source AI coding platform that turns prompts into previewable web projects with hosted runtime execution, transparent logs, and history-aware follow-up prompts.',
  },
  {
    question: 'Can bolt.gives create a previewable web app?',
    answer:
      'Yes. The hosted runtime writes files, installs packages, starts the project, checks preview health, and keeps the generated files plus live preview visible in the workspace.',
  },
  {
    question: 'Does the AI remember where it is in the project?',
    answer:
      'Follow-up prompts use project-scoped context and current runtime snapshots so improvements build on the existing app state instead of losing the generated work.',
  },
  {
    question: 'How do I contribute to bolt.gives?',
    answer:
      'Open the contributor pathway at https://bolt.gives/contribute, share your GitHub username, experience, profile details, and why you want to help build the project.',
  },
];

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'bolt.gives',
      url: SITE_URL,
      logo: `${SITE_URL}/boltlogo2.png`,
      sameAs: ['https://github.com/embire2/bolt.gives'],
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: 'bolt.gives',
      description: SEO_DESCRIPTION,
      publisher: { '@id': `${SITE_URL}/#organization` },
      inLanguage: 'en',
    },
    {
      '@type': 'ImageObject',
      '@id': `${SITE_URL}/#primaryimage`,
      url: SEO_IMAGE_URL,
      contentUrl: SEO_IMAGE_URL,
      width: 1200,
      height: 630,
      caption:
        'Generated bolt.gives search image showing prompt-to-preview AI web app creation with transparent execution.',
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE_URL}/#software`,
      name: 'bolt.gives',
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Web browser',
      url: SITE_URL,
      image: SEO_IMAGE_URL,
      description: SEO_DESCRIPTION,
      softwareVersion: APP_VERSION,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
      },
      featureList: platformHighlights,
    },
    {
      '@type': 'FAQPage',
      '@id': `${SITE_URL}/#faq`,
      mainEntity: faqItems.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.answer,
        },
      })),
    },
    {
      '@type': 'WebPage',
      '@id': `${SITE_URL}/#webpage`,
      url: SITE_URL,
      name: SEO_TITLE,
      description: SEO_DESCRIPTION,
      isPartOf: { '@id': `${SITE_URL}/#website` },
      about: { '@id': `${SITE_URL}/#software` },
      primaryImageOfPage: { '@id': `${SITE_URL}/#primaryimage` },
      breadcrumb: {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: SITE_URL,
          },
        ],
      },
      inLanguage: 'en',
    },
  ],
};

const structuredDataJson = JSON.stringify(structuredData).replace(/</g, '\\u003c');

export const links: LinksFunction = () => [
  { rel: 'canonical', href: SITE_URL },
  { rel: 'image_src', href: SEO_IMAGE_URL },
  { rel: 'preload', as: 'image', href: SEO_IMAGE_PATH },
];

export const meta: MetaFunction = () => {
  return [
    { title: SEO_TITLE },
    {
      name: 'description',
      content: SEO_DESCRIPTION,
    },
    { name: 'keywords', content: SEO_KEYWORDS },
    { name: 'robots', content: 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1' },
    { name: 'googlebot', content: 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1' },
    { name: 'author', content: 'bolt.gives open-source contributors' },
    { name: 'application-name', content: 'bolt.gives' },
    { name: 'theme-color', content: '#0f172a' },
    { name: 'thumbnail', content: SEO_IMAGE_URL },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: 'bolt.gives' },
    { property: 'og:title', content: SEO_TITLE },
    { property: 'og:description', content: SEO_DESCRIPTION },
    { property: 'og:url', content: SITE_URL },
    { property: 'og:image', content: SEO_IMAGE_URL },
    { property: 'og:image:secure_url', content: SEO_IMAGE_URL },
    { property: 'og:image:type', content: 'image/png' },
    { property: 'og:image:width', content: '1200' },
    { property: 'og:image:height', content: '630' },
    {
      property: 'og:image:alt',
      content: 'bolt.gives generated image showing prompt-to-preview AI web app creation.',
    },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: SEO_TITLE },
    { name: 'twitter:description', content: SEO_DESCRIPTION },
    { name: 'twitter:image', content: SEO_IMAGE_URL },
    {
      name: 'twitter:image:alt',
      content: 'bolt.gives generated image showing prompt-to-preview AI web app creation.',
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
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredDataJson }} />
        <section className="relative overflow-hidden border-b border-slate-950/10 px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div className="absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_30%_20%,rgba(20,184,166,0.28),transparent_34%),radial-gradient(circle_at_75%_10%,rgba(245,158,11,0.24),transparent_30%)]" />
          <div className="relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div>
              <div className="inline-flex rounded-full border border-slate-950/15 bg-white/70 px-4 py-2 text-xs font-black uppercase tracking-[0.24em] text-teal-800 shadow-sm backdrop-blur">
                Open-source agentic coding
              </div>
              <h1 className="mt-6 max-w-4xl text-5xl font-black leading-[0.95] tracking-[-0.05em] text-slate-950 sm:text-6xl lg:text-7xl">
                The transparent AI coding workspace for prompt-to-preview web apps.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-700">
                Build websites, dashboards, SaaS prototypes, scraped-site rebuilds, and interactive apps with an
                open-source coding agent that shows the plan, writes real files, runs the commands, starts the preview,
                and keeps follow-up prompts grounded in the current project.
              </p>
              <div className="mt-6 grid max-w-2xl gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-teal-700/20 bg-teal-50 px-4 py-3">
                  <div className="text-sm font-black text-teal-900">No black box</div>
                  <p className="mt-1 text-xs leading-5 text-teal-950/70">Commentary and logs stay visible.</p>
                </div>
                <div className="rounded-2xl border border-amber-700/20 bg-amber-50 px-4 py-3">
                  <div className="text-sm font-black text-amber-950">Preview first</div>
                  <p className="mt-1 text-xs leading-5 text-amber-950/70">
                    Every serious build aims at a live preview.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-950/10 bg-white/75 px-4 py-3">
                  <div className="text-sm font-black text-slate-950">Open source</div>
                  <p className="mt-1 text-xs leading-5 text-slate-600">Contribute, inspect, self-host, and improve.</p>
                </div>
              </div>
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
                src={SEO_IMAGE_PATH}
                alt="Generated bolt.gives SEO image showing prompt-to-preview AI web app creation"
                className="aspect-video w-full rounded-[1.35rem] object-cover"
                loading="eager"
                decoding="async"
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

        <section className="border-b border-slate-950/10 bg-white/45 px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl">
              <div className="text-sm font-black uppercase tracking-[0.22em] text-teal-800">
                AI website builder with proof
              </div>
              <h2 className="mt-3 text-4xl font-black tracking-[-0.04em] text-slate-950">
                From prompt to production preview in one visible loop.
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-700">
                High-converting AI tools need more than a pretty prompt box. bolt.gives is built for people who want a
                browser-based AI app builder that can explain what it is doing, recover when previews fail, preserve
                project history, and produce an outcome that users can actually inspect.
              </p>
            </div>
            <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {conversionCards.map((card) => (
                <article
                  key={card.title}
                  className="rounded-[1.75rem] border border-slate-950/10 bg-white p-6 shadow-sm"
                >
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-teal-800">{card.eyebrow}</div>
                  <h3 className="mt-4 text-xl font-black leading-6 text-slate-950">{card.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{card.description}</p>
                </article>
              ))}
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

        <section className="border-y border-slate-950/10 bg-slate-950 px-4 py-12 text-white sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <div className="text-sm font-black uppercase tracking-[0.22em] text-teal-200">How it works</div>
              <h2 className="mt-3 text-4xl font-black tracking-[-0.04em]">A crawler-readable product story.</h2>
              <p className="mt-4 text-base leading-7 text-white/70">
                The homepage now says plainly what Google and humans need to understand: bolt.gives is an open-source AI
                coding workspace, AI website builder, hosted runtime, Cloudflare preview platform, and contributor
                project in one.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {builderSteps.map((step, index) => (
                <article key={step.title} className="rounded-[1.75rem] border border-white/10 bg-white/10 p-5">
                  <div className="text-4xl font-black text-amber-200">{index + 1}</div>
                  <h3 className="mt-4 text-lg font-black">{step.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-white/70">{step.description}</p>
                </article>
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
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
              <div>
                <div className="text-sm font-black uppercase tracking-[0.22em] text-teal-800">Built for action</div>
                <h2 className="mt-3 text-4xl font-black tracking-[-0.04em] text-slate-950">
                  Start coding, create an instance, or join the project.
                </h2>
                <p className="mt-4 text-base leading-7 text-slate-700">
                  The public site is conversion-oriented without hiding the engineering reality. Pick the path that
                  matches your intent: build in the shared workspace, spawn a managed Cloudflare instance, or contribute
                  pull requests to the open-source platform.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                {audienceCards.map((card) => (
                  <article
                    key={card.title}
                    className="rounded-[1.75rem] border border-slate-950/10 bg-white p-5 shadow-sm"
                  >
                    <h3 className="text-lg font-black text-slate-950">{card.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{card.description}</p>
                  </article>
                ))}
              </div>
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

        <section className="border-t border-slate-950/10 bg-white/70 px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <div className="text-sm font-black uppercase tracking-[0.22em] text-amber-800">FAQ</div>
            <h2 className="mt-3 text-4xl font-black tracking-[-0.04em] text-slate-950">
              Questions people ask before building with bolt.gives
            </h2>
            <div className="mt-8 grid gap-4">
              {faqItems.map((item) => (
                <article
                  key={item.question}
                  className="rounded-[1.5rem] border border-slate-950/10 bg-white p-5 shadow-sm"
                >
                  <h3 className="text-lg font-black text-slate-950">{item.question}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.answer}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
