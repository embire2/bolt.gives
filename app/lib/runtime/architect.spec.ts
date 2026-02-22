import { describe, expect, it } from 'vitest';
import {
  ARCHITECT_NAME,
  buildArchitectAutoHealPrompt,
  decideArchitectAutoHeal,
  diagnoseArchitectIssue,
} from './architect';

describe('diagnoseArchitectIssue', () => {
  it('detects known FullCalendar CSS export mismatch', () => {
    const diagnosis = diagnoseArchitectIssue({
      type: 'preview',
      title: 'Preview Error',
      description: '[plugin:vite:import-analysis] Missing "./index.css" specifier in "@fullcalendar/core" package',
      content: '/home/project/src/main.jsx',
      source: 'preview',
    });

    expect(diagnosis?.issueId).toBe('vite-fullcalendar-css-export');
    expect(diagnosis?.maxAutoAttempts).toBe(2);
  });

  it('returns null for unknown alerts', () => {
    const diagnosis = diagnoseArchitectIssue({
      type: 'info',
      title: 'Info',
      description: 'Everything is okay',
      content: '',
      source: 'terminal',
    });

    expect(diagnosis).toBeNull();
  });

  it('detects escaped shell separator failures from terminal output', () => {
    const diagnosis = diagnoseArchitectIssue({
      type: 'error',
      title: 'Dev Server Failed',
      description: 'Command Failed',
      content: 'jsh: ;& can only be used in a case clause',
      source: 'terminal',
    });

    expect(diagnosis?.issueId).toBe('escaped-shell-separators');
  });

  it('detects JSON-wrapped shell command failures', () => {
    const diagnosis = diagnoseArchitectIssue({
      type: 'error',
      title: 'Dev Server Failed',
      description: 'Command Failed',
      content: 'jsh: no such file or directory: {command:cd /home/project && pnpm install}',
      source: 'terminal',
    });

    expect(diagnosis?.issueId).toBe('json-command-envelope');
  });

  it('detects invalid Bedrock configuration errors', () => {
    const diagnosis = diagnoseArchitectIssue({
      type: 'error',
      title: 'Planner Error',
      description:
        'Invalid AWS Bedrock configuration format. Please provide a valid JSON string containing region, accessKeyId, and secretAccessKey.',
      content: '',
      source: 'terminal',
    });

    expect(diagnosis?.issueId).toBe('bedrock-config-invalid');
  });

  it('detects web browse URL validation failures', () => {
    const diagnosis = diagnoseArchitectIssue({
      type: 'error',
      title: 'Tool Error',
      description: 'Error executing tool web_browse: URL is not allowed. Only public HTTP/HTTPS URLs are accepted.',
      content: '',
      source: 'terminal',
    });

    expect(diagnosis?.issueId).toBe('web-browse-url-validation');
  });

  it('detects npm spawn ENOENT failures and routes to pnpm fallback', () => {
    const diagnosis = diagnoseArchitectIssue({
      type: 'error',
      title: 'Scaffold Error',
      description: 'Command failed',
      content: 'jsh: spawn npm ENOENT',
      source: 'terminal',
    });

    expect(diagnosis?.issueId).toBe('npm-spawn-enoent');
  });

  it('detects autonomy read-only blocks for mutating actions', () => {
    const diagnosis = diagnoseArchitectIssue({
      type: 'warning',
      title: 'Action blocked by autonomy mode',
      description:
        'Read-Only mode prevented this project action. Switch to Safe Auto or Full Auto to scaffold/install/run apps.',
      content: 'Blocked action type: shell.',
      source: 'terminal',
    });

    expect(diagnosis?.issueId).toBe('autonomy-read-only-block');
  });

  it('detects unenv fs runtime limitations for update actions', () => {
    const diagnosis = diagnoseArchitectIssue({
      type: 'error',
      title: 'Update Error',
      description: 'Update manager: [unenv] fs.readFile is not implemented yet!',
      content: '',
      source: 'terminal',
    });

    expect(diagnosis?.issueId).toBe('update-runtime-unenv-fs');
  });
});

describe('decideArchitectAutoHeal', () => {
  const diagnosis = diagnoseArchitectIssue({
    type: 'preview',
    title: 'Preview Error',
    description: '[plugin:vite:import-analysis] Missing "./index.css" specifier in "@fullcalendar/core" package',
    content: '/home/project/src/main.jsx',
    source: 'preview',
  })!;

  it('blocks auto-heal in read-only autonomy mode', () => {
    const decision = decideArchitectAutoHeal({
      autonomyMode: 'read-only',
      diagnosis,
      attemptsForFingerprint: 0,
    });

    expect(decision.shouldAutoHeal).toBe(false);
    expect(decision.reason).toBe('autonomy-blocked');
  });

  it('blocks auto-heal after max attempts', () => {
    const decision = decideArchitectAutoHeal({
      autonomyMode: 'full-auto',
      diagnosis,
      attemptsForFingerprint: diagnosis.maxAutoAttempts,
    });

    expect(decision.shouldAutoHeal).toBe(false);
    expect(decision.reason).toBe('attempt-limit');
  });

  it('allows auto-heal when within guardrails', () => {
    const decision = decideArchitectAutoHeal({
      autonomyMode: 'auto-apply-safe',
      diagnosis,
      attemptsForFingerprint: 0,
    });

    expect(decision.shouldAutoHeal).toBe(true);
    expect(decision.reason).toBe('allowed');
  });
});

describe('buildArchitectAutoHealPrompt', () => {
  it('builds a guarded prompt that references Architect and issue details', () => {
    const alert = {
      type: 'preview',
      title: 'Preview Error',
      description: '[plugin:vite:import-analysis] Missing "./index.css" specifier in "@fullcalendar/core" package',
      content: '/home/project/src/main.jsx',
      source: 'preview' as const,
    };
    const diagnosis = diagnoseArchitectIssue(alert)!;
    const prompt = buildArchitectAutoHealPrompt({
      alert,
      diagnosis,
      attemptNumber: 1,
    });

    expect(prompt).toContain(`${ARCHITECT_NAME} Auto-Heal`);
    expect(prompt).toContain('vite-fullcalendar-css-export');
    expect(prompt).toContain('/home/project/src/main.jsx');
    expect(prompt).toContain('Safety guardrails');
  });
});
