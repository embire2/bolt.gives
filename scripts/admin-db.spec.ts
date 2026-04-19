import { describe, expect, it } from 'vitest';
import { buildAdminDatabaseConfig, normalizeBugReportInput, normalizeClientProfileInput } from './admin-db.mjs';

describe('admin-db', () => {
  it('treats discrete postgres settings as an enabled configuration', () => {
    const config = buildAdminDatabaseConfig({
      BOLT_ADMIN_DATABASE_HOST: 'db.example.com',
      BOLT_ADMIN_DATABASE_NAME: 'bolt',
      BOLT_ADMIN_DATABASE_USER: 'bolt_user',
      BOLT_ADMIN_DATABASE_PASSWORD: 'secret',
      BOLT_ADMIN_DATABASE_SSL: 'require',
    });

    expect(config.enabled).toBe(true);
    expect(config.poolOptions).toMatchObject({
      host: 'db.example.com',
      database: 'bolt',
      user: 'bolt_user',
    });
  });

  it('normalizes client profile input consistently', () => {
    expect(
      normalizeClientProfileInput({
        name: '  Ada Lovelace ',
        email: ' ADA@Example.COM ',
        company: ' Open Web ',
        requestedSubdomain: ' Clinic-Portal ',
      }),
    ).toEqual({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      company: 'Open Web',
      role: null,
      phone: null,
      country: null,
      useCase: null,
      requestedSubdomain: 'clinic-portal',
      registrationSource: null,
    });
  });

  it('normalizes bug report input consistently', () => {
    expect(
      normalizeBugReportInput({
        fullName: '  Ada Lovelace ',
        reporterEmail: ' ADA@Example.COM ',
        summary: '  Preview stalled  ',
        issue: '  The preview never recovered.  ',
        provider: ' FREE ',
        model: ' deepseek/deepseek-v3.2 ',
      }),
    ).toMatchObject({
      fullName: 'Ada Lovelace',
      reporterEmail: 'ada@example.com',
      summary: 'Preview stalled',
      issue: 'The preview never recovered.',
      provider: 'FREE',
      model: 'deepseek/deepseek-v3.2',
      status: 'new',
      notificationStatus: 'draft',
    });
  });
});
