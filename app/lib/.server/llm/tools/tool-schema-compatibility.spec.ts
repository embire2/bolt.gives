import { describe, expect, it } from 'vitest';
import { createWebBrowsingTools } from './web-tools';
import { buildToolSchemaCompatibilityResults, TOOL_SCHEMA_COMPATIBILITY_MATRIX } from './tool-schema-compatibility';

describe('tool-schema-compatibility', () => {
  it('validates built-in web tool schemas against strict and standard provider profiles', () => {
    const tools = createWebBrowsingTools();
    const results = buildToolSchemaCompatibilityResults(tools);

    expect(results).toHaveLength(TOOL_SCHEMA_COMPATIBILITY_MATRIX.length);
    expect(results.every((result) => result.webSearchSchemaOk)).toBe(true);
    expect(results.every((result) => result.webBrowseSchemaOk)).toBe(true);
  });

  it('includes OpenAI strict profile in compatibility matrix', () => {
    const profile = TOOL_SCHEMA_COMPATIBILITY_MATRIX.find((item) => item.provider === 'OpenAI');
    expect(profile).toBeTruthy();
    expect(profile?.strictToolSchema).toBe(true);
    expect(profile?.models.some((model) => model.includes('codex'))).toBe(true);
  });
});
