import { describe, expect, it } from 'vitest';
import { getProjectDatabasePromptContext } from './database-context';

describe('project database prompt context', () => {
  it('tells the agent to use runtime-injected PostgreSQL without revealing a value', () => {
    const prompt = getProjectDatabasePromptContext({ isConnected: true, provider: 'postgresql' });

    expect(prompt).toContain('process.env.DATABASE_URL');
    expect(prompt).toContain('Never write');
    expect(prompt).not.toContain('postgresql://');
  });

  it('does not make a database a prerequisite for ordinary projects', () => {
    const prompt = getProjectDatabasePromptContext({ isConnected: false });

    expect(prompt).toContain('Projects do not require a database');
    expect(prompt).toContain('do not block unrelated work');
  });
});
