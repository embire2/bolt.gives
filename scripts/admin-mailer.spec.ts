import { describe, expect, it } from 'vitest';
import { buildAdminMailSupport } from './admin-mailer.mjs';

describe('admin-mailer', () => {
  it('reports when smtp is not configured', () => {
    const support = buildAdminMailSupport({});

    expect(support.configured).toBe(false);
    expect(support.reason).toContain('SMTP');
  });

  it('detects a configured smtp transport', () => {
    const support = buildAdminMailSupport({
      BOLT_ADMIN_SMTP_HOST: 'smtp.example.com',
      BOLT_ADMIN_SMTP_PORT: '587',
      BOLT_ADMIN_SMTP_USER: 'mailer',
      BOLT_ADMIN_SMTP_PASSWORD: 'secret',
      BOLT_ADMIN_SMTP_FROM: 'hello@example.com',
    });

    expect(support.configured).toBe(true);
    expect(support.transportLabel).toContain('smtp.example.com');
  });
});
