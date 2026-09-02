import type { MetaFunction } from '@remix-run/cloudflare';
import { Link, useSearchParams } from '@remix-run/react';
import { APP_VERSION } from '@bolt/core/lib/version';
import { BillingUpgradeButton } from '~/components/billing/BillingUpgradeButton.client';

export const meta: MetaFunction = () => [
  { title: `Custom Domain Pricing | bolt.gives v${APP_VERSION}` },
  {
    name: 'description',
    content:
      'Compare bolt.gives FREE with Custom Domain: 100 free Agent tokens daily or 10,000 Agent tokens, Deep Build orchestration, verified previews, and custom-domain hosting at the $5/month launch price.',
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
    title: '10,000 real Agent tokens',
    copy: 'The balance uses token usage reported by the coding model, not an arbitrary complexity score. It resets after each successful monthly payment.',
  },
  {
    marker: '03',
    title: 'Production-aware recovery',
    copy: 'Build output, browser errors, runtime health, Preview ownership, and deployment checks become working context so repair loops converge instead of flashing forever.',
  },
  {
    marker: '04',
    title: 'Ship without leaving the workspace',
    copy: 'Publish free to a durable *.instances.bolt.gives Cloudflare Pages Worker, or attach your own domain to the project.',
  },
];

const WORKFLOW = [
  'Describe the outcome in plain English.',
  'See the live token balance before and after each run.',
  'Watch implementation and verification events.',
  'Open the working Preview.',
  'Deploy to Cloudflare Pages or your own domain.',
];

export default function PricingPage() {
  const [searchParams] = useSearchParams();
  const billingResult = searchParams.get('billing');

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
          <Link
            to="/chat"
            className="border border-[#11130f] bg-[#11130f] px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.16em] text-[#d9ff43] transition hover:bg-[#d9ff43] hover:text-[#11130f]"
          >
            Start building
          </Link>
        </header>

        {billingResult === 'success' ? (
          <div className="border-x border-b border-[#11130f] bg-[#d9ff43] px-5 py-4 font-mono text-sm font-bold">
            Payment received. Stripe is confirming the signed webhook now; your 10,000-token account balance will appear
            automatically when activation completes.
          </div>
        ) : billingResult === 'cancelled' ? (
          <div className="border-x border-b border-[#11130f] bg-[#f2efe6] px-5 py-4 font-mono text-sm font-bold">
            Checkout was cancelled. Your current plan and token balance were not changed.
          </div>
        ) : null}

        <section className="grid min-h-[650px] items-end gap-10 border-b border-[#11130f] py-16 lg:grid-cols-[1.25fr_0.75fr] lg:py-24">
          <div>
            <p className="mb-8 font-mono text-xs font-bold uppercase tracking-[0.28em] text-[#406100]">
              Custom Domain plan
            </p>
            <h1 className="max-w-5xl font-serif text-[clamp(4rem,10vw,9.5rem)] leading-[0.78] tracking-[-0.07em]">
              Build deep.
              <br />
              Ship clean.
            </h1>
            <p className="mt-10 max-w-2xl text-lg leading-7 sm:text-xl">
              Custom Domain gives each project a real domain, deeper agentic engineering, and a larger monthly Agent
              token balance without hiding how usage is measured.
            </p>
          </div>

          <aside className="border border-[#11130f] bg-[#d9ff43] p-6 shadow-[10px_10px_0_#11130f] sm:p-8">
            <div className="font-mono text-xs font-bold uppercase tracking-[0.2em]">Per project / per site</div>
            <div className="mt-6 inline-flex border border-[#11130f] bg-[#f2efe6] px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.16em]">
              Launch promotion
            </div>
            <div className="mt-8 flex items-end gap-3">
              <span className="font-serif text-7xl leading-none">$5</span>
              <span className="pb-2 font-mono text-xs font-bold uppercase">per month</span>
            </div>
            <div className="mt-2 font-mono text-xs">
              Regular value <span className="line-through">$20/month</span>
            </div>
            <div className="my-7 h-px bg-[#11130f]" />
            <p className="font-mono text-sm leading-6">
              10,000 Agent tokens, Deep Build orchestration, custom-domain hosting, and deployment health verification.
            </p>
            <BillingUpgradeButton className="mt-8 flex w-full items-center justify-between border border-[#11130f] bg-[#11130f] px-5 py-4 font-mono text-sm font-bold uppercase tracking-[0.12em] text-white transition hover:-translate-y-1">
              Upgrade securely
              <span aria-hidden="true">→</span>
            </BillingUpgradeButton>
            <p className="mt-4 text-xs leading-5">
              Stripe activates the account only after a signed payment webhook. Attach the included Custom Domain to a
              published project from Preview.
            </p>
          </aside>
        </section>

        <section className="grid border-b border-[#11130f] lg:grid-cols-2">
          <article className="border-b border-[#11130f] p-8 lg:border-b-0 lg:border-r sm:p-12">
            <div className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#406100]">FREE</div>
            <h2 className="mt-5 font-serif text-5xl leading-none">At least 30 coding minutes daily</h2>
            <p className="mt-5 max-w-xl leading-7 text-[#34382f]">
              The 100 Agent-token allowance is calibrated to active generation time so it covers at least 30 minutes of
              coding. Build, preview, iterate, and publish to a shareable <code>*.instances.bolt.gives</code> Cloudflare
              Worker; the balance resets every day at 00:00 GMT+2, or use your own provider key without this hosted
              allowance.
            </p>
          </article>
          <article className="bg-[#11130f] p-8 text-white sm:p-12">
            <div className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#d9ff43]">Custom Domain</div>
            <h2 className="mt-5 font-serif text-5xl leading-none">10,000 Agent tokens monthly</h2>
            <p className="mt-5 max-w-xl leading-7 text-white/75">
              Add your own domain, unlock Deep Build orchestration, priority recovery, production preview verification,
              and deployment health checks for one project.
            </p>
          </article>
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
          <span>Custom Domain, powered by bolt.gives</span>
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
