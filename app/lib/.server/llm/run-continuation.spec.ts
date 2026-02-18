import { describe, expect, it } from 'vitest';
import { shouldForceRunContinuation } from './run-continuation';

describe('shouldForceRunContinuation', () => {
  it('returns true when user requests running app but assistant only scaffolded', () => {
    const shouldForce = shouldForceRunContinuation({
      chatMode: 'build',
      lastUserContent: 'Create and run a mini React app, then show preview.',
      assistantContent:
        '<boltArtifact id="a1" title="Scaffold"><boltAction type="shell">pnpm dlx create-vite@latest mini-react-app --template react --no-interactive</boltAction></boltArtifact>',
      alreadyAttempted: false,
    });

    expect(shouldForce).toBe(true);
  });

  it('returns false when a start action already exists', () => {
    const shouldForce = shouldForceRunContinuation({
      chatMode: 'build',
      lastUserContent: 'Create and run a mini React app.',
      assistantContent:
        '<boltArtifact id="a1" title="Run"><boltAction type="shell">pnpm dlx create-vite@latest mini-react-app --template react --no-interactive</boltAction><boltAction type="start">cd mini-react-app && pnpm run dev -- --host 0.0.0.0 --port 5173</boltAction></boltArtifact>',
      alreadyAttempted: false,
    });

    expect(shouldForce).toBe(false);
  });

  it('returns false outside build mode or after one continuation attempt', () => {
    expect(
      shouldForceRunContinuation({
        chatMode: 'discuss',
        lastUserContent: 'Run this app.',
        assistantContent: 'pnpm dlx create-vite@latest mini-react-app --template react --no-interactive',
        alreadyAttempted: false,
      }),
    ).toBe(false);

    expect(
      shouldForceRunContinuation({
        chatMode: 'build',
        lastUserContent: 'Run this app.',
        assistantContent: 'pnpm dlx create-vite@latest mini-react-app --template react --no-interactive',
        alreadyAttempted: true,
      }),
    ).toBe(false);
  });
});
