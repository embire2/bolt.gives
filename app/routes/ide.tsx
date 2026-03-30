import type { LinksFunction, MetaFunction } from '@remix-run/cloudflare';
import ideStylesUrl from '../styles/ide.scss?url';

export const meta: MetaFunction = () => ({
  title: 'Bolt.gives IDE',
  description: 'Run the VS Code–style Colab web IDE inside bolt.gives.',
});

export const links: LinksFunction = () => [
  {
    rel: 'stylesheet',
    href: ideStylesUrl,
  },
];

const COLAB_URL = 'https://blackboard.sh/colab/';

export default function ExternalIDERoute() {
  return (
    <main className="ide-panel">
      <section className="ide-panel__header">
        <div>
          <p className="ide-panel__eyebrow">bolt.gives · external IDE</p>
          <h1 className="ide-panel__title">IVDE-powered workspace</h1>
          <p className="ide-panel__description">
            The open-source Colab renderer (Solid + Monaco) powers this VS Code–style environment. It lives in a
            secure iframe so you keep working inside bolt.gives while the hybrid browser/editor experience runs in
            parallel.
          </p>
        </div>
      </section>
      <div className="ide-panel__frame">
        <iframe
          title="Colab VS Code Web IDE"
          src={COLAB_URL}
          loading="lazy"
          allow="clipboard-read; clipboard-write; camera; microphone; geolocation"
          sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
        />
      </div>
    </main>
  );
}
