import { json, type ActionFunctionArgs, type MetaFunction } from '@remix-run/cloudflare';
import { Link } from '@remix-run/react';
import { Header } from '~/components/header/Header';
import BackgroundRays from '~/components/ui/BackgroundRays';
import { APP_VERSION } from '~/lib/version';

type ActionData = {
  success: false;
  error: string;
};

const GITHUB_REPO_URL = 'https://github.com/embire2/bolt.gives';
const GITHUB_ISSUES_URL = `${GITHUB_REPO_URL}/issues`;
const GITHUB_PULLS_URL = `${GITHUB_REPO_URL}/pulls`;

export const meta: MetaFunction = () => [
  { title: `Contribute to bolt.gives | v${APP_VERSION}` },
  {
    name: 'description',
    content:
      'Contribute to bolt.gives through GitHub issues and pull requests. The public application form has been retired.',
  },
];

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json<ActionData>({ success: false, error: 'Method not allowed.' }, { status: 405 });
  }

  return json<ActionData>(
    {
      success: false,
      error:
        'The public contributor application form has been retired. Please contribute through GitHub issues and pull requests.',
    },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  );
}

export default function ContributePage() {
  return (
    <div className="relative flex h-full w-full flex-col bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary">
      <BackgroundRays />
      <Header />
      <main className="modern-scrollbar relative z-1 flex-1 overflow-y-auto overflow-x-hidden px-4 py-8 sm:px-6 lg:px-8">
        <section className="mx-auto grid w-full max-w-6xl gap-6 rounded-[2rem] border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2/90 p-6 shadow-xl backdrop-blur md:grid-cols-[0.9fr_1.1fr] md:p-8">
          <div className="flex flex-col justify-between gap-8 rounded-[1.5rem] bg-gradient-to-br from-teal-950 via-slate-900 to-amber-700 p-7 text-white">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.25em] text-white/70">Open source pathway</div>
              <h1 className="mt-4 max-w-xl text-4xl font-black leading-tight sm:text-5xl">
                Contribute through GitHub.
              </h1>
              <p className="mt-5 text-base leading-7 text-white/82">
                The public contributor application form has been retired to stop automated spam. Contributions now flow
                through public issues, pull requests, and roadmap-aligned discussion on GitHub.
              </p>
            </div>
            <div className="grid gap-3 text-sm text-white/85">
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
                Pick an issue, discuss the change, and open a focused pull request with tests.
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
                Priorities remain prompt-to-preview reliability, runtime transparency, managed deployments, templates,
                self-hosting, and documentation.
              </div>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-5 sm:p-6">
            <div className="rounded-3xl border border-amber-700/25 bg-amber-50 p-6 text-amber-950">
              <div className="text-xs font-bold uppercase tracking-[0.22em] text-amber-800">
                Application form closed
              </div>
              <h2 className="mt-3 text-2xl font-bold">No private application form is available.</h2>
              <p className="mt-3 text-sm leading-6 text-amber-950/75">
                This page no longer collects names, email addresses, GitHub usernames, or contributor applications.
                Please do not send private application details here; use the public GitHub workflow instead.
              </p>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <a
                className="rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 transition hover:border-bolt-elements-borderColorActive"
                href={GITHUB_REPO_URL}
              >
                <div className="text-sm font-black text-bolt-elements-textPrimary">Repository</div>
                <p className="mt-2 text-xs leading-5 text-bolt-elements-textSecondary">
                  Review the codebase, setup notes, and current project direction.
                </p>
              </a>
              <a
                className="rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 transition hover:border-bolt-elements-borderColorActive"
                href={GITHUB_ISSUES_URL}
              >
                <div className="text-sm font-black text-bolt-elements-textPrimary">Issues</div>
                <p className="mt-2 text-xs leading-5 text-bolt-elements-textSecondary">
                  Pick up a bug, propose a feature, or discuss a roadmap-aligned fix.
                </p>
              </a>
              <a
                className="rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 transition hover:border-bolt-elements-borderColorActive"
                href={GITHUB_PULLS_URL}
              >
                <div className="text-sm font-black text-bolt-elements-textPrimary">Pull requests</div>
                <p className="mt-2 text-xs leading-5 text-bolt-elements-textSecondary">
                  Submit a small, tested PR and include clear evidence of the behavior change.
                </p>
              </a>
            </div>

            <div className="mt-6 rounded-3xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6">
              <div className="text-xs font-bold uppercase tracking-[0.22em] text-bolt-elements-textTertiary">
                Good first paths
              </div>
              <ul className="mt-4 grid gap-3 text-sm leading-6 text-bolt-elements-textSecondary">
                <li>Fix reproducible prompt-to-preview failures with a regression test.</li>
                <li>Improve first-party template packs and smoke coverage.</li>
                <li>Reduce browser bundle weight or move runtime reconciliation server-side.</li>
                <li>Strengthen self-host installer recovery and documentation.</li>
              </ul>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <a
                className="inline-flex rounded-full bg-bolt-elements-button-primary-background px-4 py-2 text-sm font-semibold text-bolt-elements-button-primary-text transition hover:bg-bolt-elements-button-primary-backgroundHover"
                href={GITHUB_REPO_URL}
              >
                Open GitHub
              </a>
              <Link
                className="inline-flex rounded-full border border-bolt-elements-borderColor px-4 py-2 text-sm font-semibold text-bolt-elements-textPrimary transition hover:bg-bolt-elements-background-depth-3"
                to="/"
              >
                Back to bolt.gives
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
