import { describe, expect, it } from 'vitest';
import { resolveContinuationFiles } from '~/routes/api.chat';

describe('resolveContinuationFiles', () => {
  it('prefers the hosted runtime snapshot when it exists', () => {
    const requestFiles = {
      'src/App.tsx': {
        type: 'file' as const,
        content: 'export default function App(){return <div>request-state</div>}',
        isBinary: false,
      },
    };
    const hostedRuntimeSnapshot = {
      '/home/project/src/App.tsx': {
        type: 'file' as const,
        content: 'export default function App(){return <div>runtime-state</div>}',
        isBinary: false,
      },
    };

    expect(
      resolveContinuationFiles({
        requestFiles,
        hostedRuntimeSnapshot,
      }),
    ).toEqual(hostedRuntimeSnapshot);
  });

  it('falls back to request files when no hosted snapshot is available', () => {
    const requestFiles = {
      'src/App.tsx': {
        type: 'file' as const,
        content: 'export default function App(){return <div>request-state</div>}',
        isBinary: false,
      },
    };

    expect(
      resolveContinuationFiles({
        requestFiles,
        hostedRuntimeSnapshot: null,
      }),
    ).toEqual(requestFiles);
  });
});
