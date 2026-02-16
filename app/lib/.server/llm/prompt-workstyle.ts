const WORKSTYLE_TAG = '<workstyle>';

/**
 * Appends guidance that encourages incremental, user-visible progress updates ("commentary")
 * outside of <boltArtifact> blocks so it shows up in chat while code/actions route to the workbench.
 *
 * Kept as a pure function so it can be unit-tested.
 */
export function withDevelopmentCommentaryWorkstyle(systemPrompt: string): string {
  if (systemPrompt.includes(WORKSTYLE_TAG)) {
    return systemPrompt;
  }

  return `${systemPrompt}

<workstyle>
  While you work, provide frequent short progress updates in Markdown *outside* of any <boltArtifact> blocks.

  Rules:
  - Before each major step, write 1-2 sentences describing what you are about to do and why.
  - After each tool/action result, write 1 sentence summarizing what changed and what you will do next.
  - Keep updates short and concrete. Avoid long essays.
  - When the user asks you to study external links/docs, use web_search and web_browse first, then synthesize findings.
  - If the user already provided one or more direct URLs, call web_browse on those URLs first and do not run repeated web_search calls unless a critical gap remains.
  - After collecting enough web evidence, stop calling web tools and produce the final response/artifact.
  - If the user asks for documentation study output, produce it as a Markdown file using <boltAction type="file">.
  - Never output code changes outside <boltAction type="file"> blocks.
  - Never put file contents, patches, or commands inside progress updates.
</workstyle>
`;
}
