import type { MetaFunction } from '@remix-run/cloudflare';
import { Link } from '@remix-run/react';
import { APP_VERSION } from '@bolt/core/lib/version';

export const meta: MetaFunction = () => [
  { title: `WebCoder.codes Premium | Deep Build Agent by bolt.gives v${APP_VERSION}` },
  {
    name: 'description',
    content:
      'Upgrade a bolt.gives project to WebCoder.codes Premium for Deep Build orchestration, 10,000 complexity-priced credits, verified previews, deployment health checks, and custom-domain hosting.',
  },
];

const FEATURES = [
  {
    marker: '01',
    title: 'Deep Build, not one-shot generation',
    copy: 'The agent inspects the existing project, plans the change, implements it, reviews the result, runs tests, and verifies Preview before it stops.',
  },
  {
    marker: '02',
    title: '10,000 credits that reflect real effort',
    copy: 'Quick edits stay inexpensive. Architecture, databases, billing, deployment, and full-stack builds consume more credits with the charge shown at task start.',
  },
  {
    marker: '03',
    title: 'Production-aware recovery',
    copy: 'Build output, browser errors, runtime health, Preview ownership, and deployment checks become working context so repair loops converge instead of flashing forever.',
  },
  {
    marker: '04',
    title: 'Ship without leaving the workspace',
    copy: 'Publish free to a shareable bolt.gives subdomain, deploy static production builds to Cloudflare Pages, or attach one custom domain to the Premium project.',
  },
];

const WORKFLOW = [
  'Describe the outcome in plain English.',
  'Review the visible complexity charge.',
  'Watch implementation and verification events.',
  'Open the working Preview.',
  'Deploy to OpenWeb.Software, Cloudflare, or your own domain.',
];

export default function PremiumPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f2efe6] text-[#11130f]">
      <div
        className="pointer-events-none fixed inset-0 opacity-40"
        style={{
          backgroundImage:
            'linear-gradient(rgba(17,19,15,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(17,19,15,0.06) 1px, transparent 1px)',
          backgroundSize: '42px 42px',
        }}
      />

      <div className="relative mx-auto max-w-[1500px] px-5 pb-20 pt-5 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between border-b border-[#11130f] pb-4">
          <Link to="/" className="font-mono text-xs font-bold uppercase tracking-[0.24em]">
            bolt.gives / v{APP_VERSION}
          </Link>
          <a
            href="https://webcoder.codes"
            className="border border-[#11130f] bg-[#11130f] px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.16em] text-[#d9ff43] transition hover:bg-[#d9ff43] hover:text-[#11130f]"
          >
            WebCoder.codes
          </a>
        </header>

        <section className="grid min-h-[650px] items-end gap-10 border-b border-[#11130f] py-16 lg:grid-cols-[1.25fr_0.75fr] lg:py-24">
          <div>
            <p className="mb-8 font-mono text-xs font-bold uppercase tracking-[0.28em] text-[#406100]">
              Premium agentic engineering
            </p>
            <h1 className="max-w-5xl font-serif text-[clamp(4rem,10vw,9.5rem)] leading-[0.78] tracking-[-0.07em]">
              Build deep.
              <br />
              Ship clean.
            </h1>
            <p className="mt-10 max-w-2xl text-lg leading-7 sm:text-xl">
              WebCoder.codes turns a prompt into an engineering run: inspect, plan, implement, test, repair, verify, and
              deploy. No scaffold-only finish line.
            </p>
          </div>

          <aside className="border border-[#11130f] bg-[#d9ff43] p-6 shadow-[10px_10px_0_#11130f] sm:p-8">
            <div className="font-mono text-xs font-bold uppercase tracking-[0.2em]">Per project / per site</div>
            <div className="mt-8 flex items-end gap-3">
              <span className="font-serif text-7xl leading-none">$5</span>
              <span className="pb-2 font-mono text-xs font-bold uppercase">every 28 days</span>
            </div>
            <div className="my-7 h-px bg-[#11130f]" />
            <p className="font-mono text-sm leading-6">
              10,000 complexity-priced credits, Deep Build orchestration, custom-domain hosting, and deployment health
              verification.
            </p>
            <Link
              to="/chat"
              className="mt-8 flex w-full items-center justify-between border border-[#11130f] bg-[#11130f] px-5 py-4 font-mono text-sm font-bold uppercase tracking-[0.12em] text-white transition hover:-translate-y-1"
            >
              Open Premium workspace
              <span aria-hidden="true">→</span>
            </Link>
            <p className="mt-4 text-xs leading-5">
              Publish the project free first, then select <strong>WebCoder Premium</strong> in Preview to attach its
              domain and activate billing.
            </p>
          </aside>
        </section>

        <section className="grid border-b border-[#11130f] lg:grid-cols-2">
          {FEATURES.map((feature) => (
            <article
              key={feature.marker}
              className="group min-h-72 border-b border-[#11130f] p-7 last:border-b-0 odd:lg:border-r lg:[&:nth-last-child(-n+2)]:border-b-0 sm:p-10"
            >
              <div className="font-mono text-xs font-bold text-[#406100]">{feature.marker}</div>
              <h2 className="mt-12 max-w-lg font-serif text-4xl leading-none tracking-[-0.04em] transition group-hover:translate-x-2 sm:text-5xl">
                {feature.title}
              </h2>
              <p className="mt-6 max-w-xl leading-7 text-[#34382f]">{feature.copy}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-10 border-b border-[#11130f] py-16 lg:grid-cols-[0.7fr_1.3fr] lg:py-24">
          <div>
            <p className="font-mono text-xs font-bold uppercase tracking-[0.24em] text-[#406100]">The working loop</p>
            <h2 className="mt-6 font-serif text-5xl leading-none tracking-[-0.05em] sm:text-6xl">
              Every task has a visible finish line.
            </h2>
          </div>
          <ol className="border-t border-[#11130f]">
            {WORKFLOW.map((step, index) => (
              <li
                key={step}
                className="grid grid-cols-[48px_1fr] gap-5 border-b border-[#11130f] py-6 text-lg sm:grid-cols-[72px_1fr] sm:text-xl"
              >
                <span className="font-mono text-sm font-bold text-[#406100]">0{index + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <footer className="flex flex-col gap-6 pt-10 font-mono text-xs uppercase tracking-[0.14em] sm:flex-row sm:items-center sm:justify-between">
          <span>WebCoder.codes Premium, powered by bolt.gives</span>
          <div className="flex gap-5">
            <Link to="/chat" className="underline decoration-2 underline-offset-4">
              Start building
            </Link>
            <a href="https://github.com/embire2/bolt.gives" className="underline decoration-2 underline-offset-4">
              Open-source core
            </a>
          </div>
        </footer>
      </div>
    </main>
  );
}
