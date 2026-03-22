import { describe, expect, it } from 'vitest';
import { analyzeRunContinuation, shouldForceRunContinuation } from './run-continuation';

describe('shouldForceRunContinuation', () => {
  it('continues when a build request ends with scaffold-only output', () => {
    const shouldContinue = shouldForceRunContinuation({
      chatMode: 'build',
      alreadyAttempted: false,
      lastUserContent: 'Create an appointment scheduling website for a doctor office.',
      assistantContent: '<boltAction type="shell">pnpm dlx create-vite@latest . --template react</boltAction>',
    });

    expect(shouldContinue).toBe(true);
  });

  it('continues when starter bootstrap text is present but no start action exists', () => {
    const shouldContinue = shouldForceRunContinuation({
      chatMode: 'build',
      alreadyAttempted: false,
      lastUserContent: 'Build a dashboard with forms and validation.',
      assistantContent: 'Bolt is initializing your project with the required files using the Vite React template.',
    });

    expect(shouldContinue).toBe(true);
  });

  it('does not continue when the assistant already emitted a start action', () => {
    const shouldContinue = shouldForceRunContinuation({
      chatMode: 'build',
      alreadyAttempted: false,
      lastUserContent: 'Run the app and keep preview open.',
      assistantContent: '<boltAction type="start">pnpm run dev</boltAction>',
    });

    expect(shouldContinue).toBe(false);
  });

  it('continues when output is bootstrap-only even if start action exists', () => {
    const decision = analyzeRunContinuation({
      chatMode: 'build',
      alreadyAttempted: false,
      lastUserContent: "Create an appointment scheduling website for a doctor's office in React.",
      assistantContent: `
<boltAction type="shell">echo "Using built-in Vite React starter files"</boltAction>
<boltAction type="shell">pnpm install</boltAction>
<boltAction type="start">pnpm run dev</boltAction>
`,
    });

    expect(decision.shouldContinue).toBe(true);
    expect(decision.reason).toBe('bootstrap-only-shell-actions');
  });

  it('continues when only non-implementation files were written', () => {
    const decision = analyzeRunContinuation({
      chatMode: 'build',
      alreadyAttempted: false,
      lastUserContent: "Create an appointment scheduling website for a doctor's office in React.",
      assistantContent: `
<boltAction type="file" filePath="README.md"># React + Vite + typescript fallback template</boltAction>
<boltAction type="shell">pnpm install</boltAction>
<boltAction type="start">pnpm run dev</boltAction>
`,
    });

    expect(decision.shouldContinue).toBe(true);
    expect(decision.reason).toBe('bootstrap-only-shell-actions');
  });

  it('does not continue when implementation files are already present', () => {
    const decision = analyzeRunContinuation({
      chatMode: 'build',
      alreadyAttempted: false,
      lastUserContent: "Create an appointment scheduling website for a doctor's office in React.",
      assistantContent: `
<boltAction type="file" filePath="src/App.tsx">export default function App(){return <div>appointments</div>;}</boltAction>
<boltAction type="shell">pnpm install</boltAction>
<boltAction type="start">pnpm run dev</boltAction>
`,
    });

    expect(decision.shouldContinue).toBe(false);
    expect(decision.reason).toBe('continuation-not-required');
  });

  it('does not classify scaffold output as incomplete when implementation files are already present', () => {
    const decision = analyzeRunContinuation({
      chatMode: 'build',
      alreadyAttempted: false,
      lastUserContent: 'Build a React scheduler and run it.',
      assistantContent: `
<boltAction type="file" filePath="src/App.tsx">export default function App(){return <div>ready</div>;}</boltAction>
<boltAction type="shell">pnpm dlx create-vite@latest . --template react</boltAction>
`,
    });

    expect(decision.shouldContinue).toBe(true);
    expect(decision.reason).toBe('run-intent-without-start');
  });

  it('continues when only inspection shell commands were emitted', () => {
    const decision = analyzeRunContinuation({
      chatMode: 'build',
      alreadyAttempted: false,
      lastUserContent: 'Build a patient intake app and run it.',
      assistantContent: '<boltAction type="shell">ls -la && pwd && cat README.md</boltAction>',
    });

    expect(decision.shouldContinue).toBe(true);
    expect(decision.reason).toBe('inspection-only-shell-actions');
  });

  it('returns reason when continuation is skipped due prior attempt', () => {
    const decision = analyzeRunContinuation({
      chatMode: 'build',
      alreadyAttempted: true,
      lastUserContent: 'Build a React scheduler app.',
      assistantContent: '<boltAction type="shell">pnpm install</boltAction>',
    });

    expect(decision.shouldContinue).toBe(false);
    expect(decision.reason).toBe('already-attempted');
  });
});
