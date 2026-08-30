import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('hosted Preview reconciliation', () => {
  it('uses the event stream for fast updates without five-second idle polling', () => {
    const source = readFileSync(resolve(__dirname, 'Preview.tsx'), 'utf8');

    expect(source).toContain('const HOSTED_PREVIEW_RECONCILE_INTERVAL_MS = 30_000;');
    expect(source).toContain('const HOSTED_PREVIEW_RECONCILE_GRACE_MS = 60_000;');
    expect(source).toMatch(/onError:\s*\(\) => \{[\s\S]*void inspectHostedPreview\(\);/);
  });
});
