import { Suspense, lazy, memo, useMemo } from 'react';
import type { Message } from 'ai';
import type { ProviderInfo } from '~/types/model';

const LazyMarkdownRenderer = lazy(() =>
  import('./MarkdownRenderer').then((module) => ({ default: module.MarkdownRenderer })),
);

interface MarkdownProps {
  children: string;
  html?: boolean;
  limitedMarkdown?: boolean;
  append?: (message: Message) => void;
  chatMode?: 'discuss' | 'build';
  setChatMode?: (mode: 'discuss' | 'build') => void;
  model?: string;
  provider?: ProviderInfo;
}

function MarkdownFallback() {
  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-3 text-xs text-bolt-elements-textSecondary">
      Rendering response...
    </div>
  );
}

export const Markdown = memo(
  ({ children, html = false, limitedMarkdown = false, append, setChatMode, model, provider }: MarkdownProps) => {
    const normalizedContent = useMemo(() => stripCodeFenceFromArtifact(children), [children]);

    return (
      <Suspense fallback={<MarkdownFallback />}>
        <LazyMarkdownRenderer
          content={normalizedContent}
          html={html}
          limitedMarkdown={limitedMarkdown}
          append={append}
          setChatMode={setChatMode}
          model={model}
          provider={provider}
        />
      </Suspense>
    );
  },
);

export const stripCodeFenceFromArtifact = (content: string) => {
  if (!content || !content.includes('__boltArtifact__')) {
    return content;
  }

  const lines = content.split('\n');
  const artifactLineIndex = lines.findIndex((line) => line.includes('__boltArtifact__'));

  if (artifactLineIndex === -1) {
    return content;
  }

  if (artifactLineIndex > 0 && lines[artifactLineIndex - 1]?.trim().match(/^```\w*$/)) {
    lines[artifactLineIndex - 1] = '';
  }

  if (artifactLineIndex < lines.length - 1 && lines[artifactLineIndex + 1]?.trim().match(/^```$/)) {
    lines[artifactLineIndex + 1] = '';
  }

  return lines.join('\n');
};
