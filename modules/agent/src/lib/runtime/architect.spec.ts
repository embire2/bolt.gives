import { describe, expect, it } from 'vitest';
import {
  ARCHITECT_NAME,
  buildArchitectAutoHealPrompt,
  decideArchitectAutoHeal,
  decideStarterContinuationPrecedence,
  diagnoseArchitectIssue,
  shouldUseHostedFreeServerRecovery,
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

  it('detects generic preview runtime exceptions', () => {
    const diagnosis = diagnoseArchitectIssue({
      type: 'preview',
      title: 'Preview Error',
      description: 'PREVIEW_UNCAUGHT_EXCEPTION: Uncaught TypeError: Cannot read properties of undefined',
      content: 'at App (/home/project/src/App.tsx:17:9)',
      source: 'preview',
    });

    expect(diagnosis?.issueId).toBe('preview-runtime-exception');
    expect(diagnosis?.maxAutoAttempts).toBe(2);
  });

  it('detects generic Vite preview compile failures', () => {
    const diagnosis = diagnoseArchitectIssue({
      type: 'preview',
      title: 'Preview Error',
      description: '[plugin:vite:react-babel] /srv/runtime/src/App.tsx: Unexpected token (103:0)',
      content: 'Unexpected token (103:0)',
      source: 'preview',
    });

    expect(diagnosis?.issueId).toBe('vite-preview-compile-error');
    expect(diagnosis?.maxAutoAttempts).toBe(2);
  });

  it('detects pnpm commands polluted with npm-only install flags', () => {
    const diagnosis = diagnoseArchitectIssue({
      type: 'error',
      title: 'Terminal Error',
      description: 'Command Failed',
      content: " ERROR  Unknown option: 'progress'",
      source: 'terminal',
    });

    expect(diagnosis?.issueId).toBe('pnpm-invalid-install-flags');
    expect(diagnosis?.maxAutoAttempts).toBe(2);
  });

  it('detects the fallback starter still being visible in preview', () => {
    const diagnosis = diagnoseArchitectIssue({
      type: 'warning',
      title: 'Starter Placeholder Still Visible',
      description: 'The preview is still showing the built-in fallback starter instead of the requested app.',
      content: 'Vite + React\nYour fallback starter is ready.',
      source: 'preview',
    });

    expect(diagnosis?.issueId).toBe('starter-placeholder-visible');
    expect(diagnosis?.maxAutoAttempts).toBe(3);
  });

  it('detects blocked shell mutations as client-side recoverable terminal errors', () => {
    const diagnosis = diagnoseArchitectIssue({
      type: 'error',
      title: 'Terminal Error',
      description: 'Blocked Shell Mutation',
      content:
        'Shell redirection that writes to files is blocked. Use a file action for writes so changes stay atomic.',
      source: 'terminal',
    });

    expect(diagnosis?.issueId).toBe('blocked-shell-mutation');
    expect(diagnosis?.guidance.join('\n')).toContain('<codyAction type="file"');
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

describe('shouldUseHostedFreeServerRecovery', () => {
  it('does not skip client auto-heal for hosted FREE blocked shell mutations', () => {
    const diagnosis = diagnoseArchitectIssue({
      type: 'error',
      title: 'Terminal Error',
      description: 'Blocked Shell Mutation',
      content: 'Shell-based file mutation (`echo`, `cat >`, `sed -i`) is blocked. Use a file action instead.',
      source: 'terminal',
    })!;

    expect(
      shouldUseHostedFreeServerRecovery({
        hostedRuntimeEnabled: true,
        providerName: 'FREE',
        diagnosis,
      }),
    ).toBe(false);
  });

  it('does not skip client auto-heal when hosted FREE runs shell before project files exist', () => {
    const diagnosis = diagnoseArchitectIssue({
      type: 'error',
      title: 'Dev Server Failed',
      description: 'Command Failed (exit code: 1)',
      content:
        'Hosted runtime refused to run a package-manager command because the session workspace has no project manifest yet. Scaffold or sync the project files first.',
      source: 'terminal',
    })!;

    expect(diagnosis.issueId).toBe('shell-before-project-manifest');
    expect(
      shouldUseHostedFreeServerRecovery({
        hostedRuntimeEnabled: true,
        providerName: 'FREE',
        diagnosis,
      }),
    ).toBe(false);
  });

  it('keeps hosted FREE preview recovery routed to server-side recovery', () => {
    const diagnosis = diagnoseArchitectIssue({
      type: 'preview',
      title: 'Preview Error',
      description: '[plugin:vite:import-analysis] Missing "./index.css" specifier in "@fullcalendar/core" package',
      content: '/home/project/src/main.jsx',
      source: 'preview',
    })!;

    expect(
      shouldUseHostedFreeServerRecovery({
        hostedRuntimeEnabled: true,
        providerName: 'FREE',
        diagnosis,
      }),
    ).toBe(true);
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
      originalRequest: 'Build a doctor appointment scheduling app with reminders.',
    });

    expect(prompt).toContain(`${ARCHITECT_NAME} Auto-Heal`);
    expect(prompt).toContain('vite-fullcalendar-css-export');
    expect(prompt).toContain('/home/project/src/main.jsx');
    expect(prompt).toContain('Build a doctor appointment scheduling app with reminders.');
    expect(prompt).toContain('Safety guardrails');
  });

  it('forbids shell file mutation when repairing blocked shell writes', () => {
    const alert = {
      type: 'error',
      title: 'Terminal Error',
      description: 'Blocked Shell Mutation',
      content:
        'Shell redirection that writes to files is blocked. Use a file action for writes so changes stay atomic.',
      source: 'terminal' as const,
    };
    const diagnosis = diagnoseArchitectIssue(alert)!;
    const prompt = buildArchitectAutoHealPrompt({
      alert,
      diagnosis,
      attemptNumber: 1,
      originalRequest: 'Build a landing page.',
    });

    expect(prompt).toContain('blocked-shell-mutation');
    expect(prompt).toContain('Never mutate project files through shell commands');
    expect(prompt).toContain('file actions with complete file contents');
  });

  it('requires file-action scaffolding before install when the project manifest is missing', () => {
    const alert = {
      type: 'error',
      title: 'Dev Server Failed',
      description: 'Command Failed (exit code: 1)',
      content:
        'Hosted runtime refused to run a package-manager command because the session workspace has no project manifest yet. Scaffold or sync the project files first.',
      source: 'terminal' as const,
    };
    const diagnosis = diagnoseArchitectIssue(alert)!;
    const prompt = buildArchitectAutoHealPrompt({
      alert,
      diagnosis,
      attemptNumber: 1,
      originalRequest: 'Build a tiny Pages smoke app.',
    });

    expect(prompt).toContain('shell-before-project-manifest');
    expect(prompt).toContain('package.json, index.html');
    expect(prompt).toContain('before any install, build, test, or start shell command');
    expect(prompt).toContain('Do not use a shell command as the first executable action');
  });
});

describe('decideStarterContinuationPrecedence', () => {
  it('prefers starter continuation over Architect auto-heal for fallback placeholder runs', () => {
    const diagnosis = diagnoseArchitectIssue({
      type: 'warning',
      title: 'Starter Placeholder Still Visible',
      description: 'The preview is still showing the built-in fallback starter instead of the requested app.',
      content: 'Vite + React\nYour fallback starter is ready.',
      source: 'preview',
    });

    const decision = decideStarterContinuationPrecedence({
      diagnosis,
      hasPendingStarterRequest: true,
      starterContinuationAlreadyTriggered: false,
    });

    expect(decision).toEqual({
      shouldDispatchStarterContinuation: true,
      reason: 'starter-placeholder',
    });
  });

  it('does not dispatch starter continuation once no pending original request remains', () => {
    const diagnosis = diagnoseArchitectIssue({
      type: 'warning',
      title: 'Starter Placeholder Still Visible',
      description: 'The preview is still showing the built-in fallback starter instead of the requested app.',
      content: 'Vite + React\nYour fallback starter is ready.',
      source: 'preview',
    });

    const decision = decideStarterContinuationPrecedence({
      diagnosis,
      hasPendingStarterRequest: false,
      starterContinuationAlreadyTriggered: false,
    });

    expect(decision).toEqual({
      shouldDispatchStarterContinuation: false,
      reason: 'no-pending-request',
    });
  });
});
