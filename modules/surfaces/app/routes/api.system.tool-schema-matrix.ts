import { json } from '@remix-run/cloudflare';
import { createWebBrowsingTools } from '@bolt/agent/lib/.server/llm/tools/web-tools';
import {
  buildToolSchemaCompatibilityResults,
  TOOL_SCHEMA_COMPATIBILITY_MATRIX,
} from '@bolt/agent/lib/.server/llm/tools/tool-schema-compatibility';

export async function loader() {
  const tools = createWebBrowsingTools();
  const results = buildToolSchemaCompatibilityResults(tools);

  return json({
    matrix: TOOL_SCHEMA_COMPATIBILITY_MATRIX,
    results,
  });
}
