import { beforeEach, describe, expect, it, vi } from 'vitest';

const recordAdminEmailMessageMock = vi.fn(async (input: Record<string, unknown>) => ({
  id: `message-${String(input.profileEmail || 'unknown').replace(/[^a-z0-9]/gi, '-')}`,
  ...input,
}));

const readMergedRuntimeEnvMock = vi.fn(() => ({}));
const sendMailMock = vi.fn(async () => ({}));
const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }));

vi.mock('./admin-db.mjs', () => ({
  recordAdminEmailMessage: recordAdminEmailMessageMock,
}));

vi.mock('./runtime-env-file.mjs', () => ({
  readMergedRuntimeEnv: readMergedRuntimeEnvMock,
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: createTransportMock,
  },
}));

describe('admin-mailer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readMergedRuntimeEnvMock.mockReturnValue({});
    sendMailMock.mockResolvedValue({});
    createTransportMock.mockReturnValue({ sendMail: sendMailMock });
  });

  it('reports when smtp is not configured', async () => {
    const { buildAdminMailSupport } = await import('./admin-mailer.mjs');
    const support = buildAdminMailSupport({});

    expect(support.configured).toBe(false);
    expect(support.reason).toContain('SMTP');
    expect('pass' in support).toBe(false);
  });

  it('detects a configured smtp transport', async () => {
    const { buildAdminMailSupport } = await import('./admin-mailer.mjs');
    const support = buildAdminMailSupport({
      BOLT_ADMIN_SMTP_HOST: 'smtp.example.com',
      BOLT_ADMIN_SMTP_PORT: '587',
      BOLT_ADMIN_SMTP_USER: 'mailer',
      BOLT_ADMIN_SMTP_PASSWORD: 'secret',
      BOLT_ADMIN_SMTP_FROM: 'hello@example.com',
    });

    expect(support.configured).toBe(true);
    expect(support.transportLabel).toContain('smtp.example.com');
    expect(support.host).toBe('smtp.example.com');
    expect(support.hasPassword).toBe(true);
    expect('pass' in support).toBe(false);
  });

  it('records one message per recipient when batching mail', async () => {
    const { sendAdminEmailBatch } = await import('./admin-mailer.mjs');
    const batch = await sendAdminEmailBatch({
      recipients: ['alice@example.com', 'bob@example.com', 'alice@example.com'],
      subject: 'Test',
      body: 'Hello world',
      actor: 'admin',
    } as any);

    expect(batch.total).toBe(2);
    expect(batch.messages).toHaveLength(2);
    expect(batch.messages[0]?.profileEmail).toBe('alice@example.com');
    expect(batch.messages[1]?.profileEmail).toBe('bob@example.com');
  });

  it('returns a draft bug-report notification when smtp is not configured', async () => {
    const { sendBugReportNotification } = await import('./admin-mailer.mjs');
    const result = await sendBugReportNotification({
      fullName: 'Ada Lovelace',
      reporterEmail: 'ada@example.com',
      issue: 'Preview never became available after the install completed.',
    } as any);

    expect(result.status).toBe('draft');
    expect(result.recipient).toBe('wow@openweb.email');
  });

  it('sends a bug-report notification through smtp when configured', async () => {
    readMergedRuntimeEnvMock.mockReturnValue({
      BOLT_ADMIN_SMTP_HOST: 'smtp.example.com',
      BOLT_ADMIN_SMTP_PORT: '587',
      BOLT_ADMIN_SMTP_USER: 'mailer',
      BOLT_ADMIN_SMTP_PASSWORD: 'secret',
      BOLT_ADMIN_SMTP_FROM: 'hello@example.com',
    });

    const { sendBugReportNotification } = await import('./admin-mailer.mjs');
    const result = await sendBugReportNotification({
      fullName: 'Ada Lovelace',
      reporterEmail: 'ada@example.com',
      summary: 'Preview stalled',
      issue: 'Preview never became available after the install completed.',
      provider: 'FREE',
      model: 'deepseek/deepseek-v3.2',
      browser: 'Firefox',
    } as any);

    expect(result.status).toBe('sent');
    expect(sendMailMock).toHaveBeenCalledOnce();
    expect((sendMailMock.mock.calls as Array<Array<Record<string, unknown>>>)[0]?.[0]).toMatchObject({
      to: 'wow@openweb.email',
      replyTo: 'ada@example.com',
      subject: '[Bug Report] Preview stalled',
    });
  });
});
