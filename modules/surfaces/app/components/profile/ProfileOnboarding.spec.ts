import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));

describe('first-visit profile onboarding', () => {
  it('requires the three PostgreSQL profile fields and offers secure login', () => {
    const source = readFileSync(resolve(TEST_DIR, 'ProfileOnboarding.tsx'), 'utf8');

    expect(source).toContain('Name and Surname');
    expect(source).toContain('name="email"');
    expect(source).toContain('name="country"');
    expect(source).toContain('action="/profile/register"');
    expect(source).toContain('Login securely');
  });

  it('greets a signed-in user by first name on a new chat', () => {
    const source = readFileSync(resolve(TEST_DIR, '../chat/BaseChat.tsx'), 'utf8');

    expect(source).toContain('Hi ${firstName}, what are we creating today?');
  });
});
