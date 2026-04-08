import { json, redirect, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/cloudflare';
import { ClientOnly } from 'remix-utils/client-only';
import { Chat } from '~/components/chat/Chat.client';
import { Header } from '~/components/header/Header';
import { FREE_HOSTED_MODEL_LABEL, FREE_PROVIDER_NAME } from '~/lib/modules/llm/free-provider-config';
import { getCreateRedirectHost, getPublicUrlConfig } from '~/lib/public-urls';
import BackgroundRays from '~/components/ui/BackgroundRays';
import { APP_VERSION } from '~/lib/version';

export const meta: MetaFunction = () => {
  return [
    { title: `bolt.gives v${APP_VERSION}` },
    { name: 'description', content: 'Talk with bolt.gives, a collaborative AI coding assistant' },
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

/**
 * Landing page component for Bolt
 * Note: Settings functionality should ONLY be accessed through the sidebar menu.
 * Do not add settings button/panel to this landing page as it was intentionally removed
 * to keep the UI clean and consistent with the design system.
 */
export default function Index() {
  return (
    <div className="flex flex-col h-full w-full bg-bolt-elements-background-depth-1">
      <BackgroundRays />
      <Header />
      <ClientOnly fallback={<HomeShellFallback />}>{() => <Chat />}</ClientOnly>
    </div>
  );
}
