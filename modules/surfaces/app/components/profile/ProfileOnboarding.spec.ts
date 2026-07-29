import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('first-visit profile onboarding', () => {
  it('requires the three PostgreSQL profile fields and offers secure login', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'modules/surfaces/app/components/profile/ProfileOnboarding.tsx'),
      'utf8',
    );

    expect(source).toContain('Name and Surname');
    expect(source).toContain('name="email"');
    expect(source).toContain('name="country"');
    expect(source).toContain('action="/profile/register"');
    expect(source).toContain('Login securely');
  });

  it('greets a signed-in user by first name on a new chat', () => {
    const source = readFileSync(resolve(process.cwd(), 'modules/surfaces/app/components/chat/BaseChat.tsx'), 'utf8');

    expect(source).toContain('Hi ${firstName}, what are we creating today?');
  });
});
