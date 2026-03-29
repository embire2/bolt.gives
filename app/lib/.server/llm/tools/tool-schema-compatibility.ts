import type { ToolSet } from 'ai';

export type ToolSchemaCompatibilityProfile = {
  provider: string;
  strictToolSchema: boolean;
  models: string[];
  notes: string;
};

export type ToolSchemaCompatibilityResult = {
  provider: string;
  strictToolSchema: boolean;
  webSearchSchemaOk: boolean;
  webBrowseSchemaOk: boolean;
};

export const TOOL_SCHEMA_COMPATIBILITY_MATRIX: ToolSchemaCompatibilityProfile[] = [
  {
    provider: 'OpenAI',
    strictToolSchema: true,
    models: ['gpt-5-codex', 'codex-mini-latest', 'gpt-4o'],
    notes: 'Requires every property key to be present in required[] for function schemas.',
  },
  {
    provider: 'Anthropic',
    strictToolSchema: false,
    models: ['claude-3-5-sonnet-latest'],
    notes: 'Supports optional arguments, but strict-compatible schemas are accepted.',
  },
  {
    provider: 'OpenRouter',
    strictToolSchema: false,
    models: ['openrouter/auto'],
    notes: 'OpenAI-compatible bridge; strict-compatible schemas remain safe.',
  },
  {
    provider: 'Together',
    strictToolSchema: false,
    models: ['meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo'],
    notes: 'Tool invocation supports optional keys but strict-compatible schemas are portable.',
  },
];

function canParseToolArgs(schema: { safeParse: (value: unknown) => { success: boolean } }, args: unknown): boolean {
  return schema.safeParse(args).success;
}

function validateWebSearchSchema(tools: ToolSet, strictToolSchema: boolean): boolean {
  const webSearch = tools.web_search as { parameters?: { safeParse: (value: unknown) => { success: boolean } } };

  if (!webSearch?.parameters) {
    return false;
  }

  const withAllKeys = canParseToolArgs(webSearch.parameters, { query: 'vite docs', maxResults: null });

  if (!withAllKeys) {
    return false;
  }

  if (!strictToolSchema) {
    return true;
  }

  const missingKeyFails = !canParseToolArgs(webSearch.parameters, { query: 'vite docs' });

  return missingKeyFails;
}

function validateWebBrowseSchema(tools: ToolSet, strictToolSchema: boolean): boolean {
  const webBrowse = tools.web_browse as { parameters?: { safeParse: (value: unknown) => { success: boolean } } };

  if (!webBrowse?.parameters) {
    return false;
  }

  const withAllKeys = canParseToolArgs(webBrowse.parameters, { url: 'https://example.com/docs', maxChars: null });

  if (!withAllKeys) {
    return false;
  }

  if (!strictToolSchema) {
    return true;
  }

  const missingKeyFails = !canParseToolArgs(webBrowse.parameters, { url: 'https://example.com/docs' });

  return missingKeyFails;
}

export function buildToolSchemaCompatibilityResults(tools: ToolSet): ToolSchemaCompatibilityResult[] {
  return TOOL_SCHEMA_COMPATIBILITY_MATRIX.map((profile) => ({
    provider: profile.provider,
    strictToolSchema: profile.strictToolSchema,
    webSearchSchemaOk: validateWebSearchSchema(tools, profile.strictToolSchema),
    webBrowseSchemaOk: validateWebBrowseSchema(tools, profile.strictToolSchema),
  }));
}
