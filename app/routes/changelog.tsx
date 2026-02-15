import type { MetaFunction } from '@remix-run/cloudflare';
import ReactMarkdown from 'react-markdown';
import { Header } from '~/components/header/Header';
import BackgroundRays from '~/components/ui/BackgroundRays';
import { rehypePlugins, remarkPlugins, allowedHTMLElements } from '~/utils/markdown';
import { APP_VERSION } from '~/lib/version';

// eslint-disable-next-line no-restricted-imports
import changelog from '../../CHANGELOG.md?raw';

export const meta: MetaFunction = () => {
  return [{ title: `bolt.gives changelog (v${APP_VERSION})` }];
};

export default function ChangelogPage() {
  return (
    <div className="flex flex-col h-full w-full bg-bolt-elements-background-depth-1">
      <BackgroundRays />
      <Header />

      <main className="flex-1 overflow-auto px-4 py-8">
        <div className="mx-auto w-full max-w-3xl">
          <h1 className="text-2xl font-semibold text-bolt-elements-textPrimary mb-2">Changelog</h1>
          <p className="text-sm text-bolt-elements-textSecondary mb-6">
            Current version: <span className="font-mono">v{APP_VERSION}</span>
          </p>

          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown
              allowedElements={allowedHTMLElements}
              remarkPlugins={remarkPlugins(false)}
              rehypePlugins={rehypePlugins(false)}
            >
              {changelog}
            </ReactMarkdown>
          </div>
        </div>
      </main>
    </div>
  );
}
