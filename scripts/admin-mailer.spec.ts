import { describe, expect, it, vi } from 'vitest';
import { buildAdminMailSupport, sendAdminEmailBatch } from './admin-mailer.mjs';

vi.mock('./admin-db.mjs', () => ({
  recordAdminEmailMessage: vi.fn(async (input) => ({
    id: `message-${String(input.profileEmail).replace(/[^a-z0-9]/gi, '-')}`,
    ...input,
  })),
}));

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

  it('records one message per recipient when batching mail', async () => {
    const batch = await sendAdminEmailBatch(
      {
        recipients: ['alice@example.com', 'bob@example.com', 'alice@example.com'],
        subject: 'Test',
        body: 'Hello world',
        actor: 'admin',
      } as any,
    );

    expect(batch.total).toBe(2);
    expect(batch.messages).toHaveLength(2);
    expect(batch.messages[0]?.profileEmail).toBe('alice@example.com');
    expect(batch.messages[1]?.profileEmail).toBe('bob@example.com');
  });
});
