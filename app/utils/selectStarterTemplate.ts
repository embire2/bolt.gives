import ignore from 'ignore';
import type { ProviderInfo } from '~/types/model';
import type { Template } from '~/types/template';
import { STARTER_TEMPLATES } from './constants';
import { getLocalStarterTemplateFallback, getLocalStarterTemplateFiles } from './localStarterTemplates';

const starterTemplateSelectionPrompt = (templates: Template[]) => `
You are an experienced developer who helps people choose the best starter template for their projects.
IMPORTANT: Vite is preferred
IMPORTANT: Only choose shadcn templates if the user explicitly asks for shadcn.

Available templates:
<template>
  <name>blank</name>
  <description>Empty starter for simple scripts and trivial tasks that don't require a full template setup</description>
  <tags>basic, script</tags>
</template>
${templates
  .map(
    (template) => `
<template>
  <name>${template.name}</name>
  <description>${template.description}</description>
  ${template.tags ? `<tags>${template.tags.join(', ')}</tags>` : ''}
</template>
`,
  )
  .join('\n')}

Response Format:
<selection>
  <templateName>{selected template name}</templateName>
  <title>{a proper title for the project}</title>
</selection>

Examples:

<example>
User: I need to build a todo app
Response:
<selection>
  <templateName>react-basic-starter</templateName>
  <title>Simple React todo application</title>
</selection>
</example>

<example>
User: Write a script to generate numbers from 1 to 100
Response:
<selection>
  <templateName>blank</templateName>
  <title>script to generate numbers from 1 to 100</title>
</selection>
</example>

Instructions:
1. For trivial tasks and simple scripts, always recommend the blank template
2. For more complex projects, recommend templates from the provided list
3. Follow the exact XML format
4. Consider both technical requirements and tags
5. If no perfect match exists, recommend the closest option

Important: Provide only the selection tags in your response, no additional text.
MOST IMPORTANT: YOU DONT HAVE TIME TO THINK JUST START RESPONDING BASED ON HUNCH 
`;

const templates: Template[] = STARTER_TEMPLATES.filter((t) => !t.name.includes('shadcn'));

type HeuristicTemplateRule = {
  template: string;
  patterns: RegExp[];
  title: string;
  match?: 'any' | 'all';
};

const HEURISTIC_TEMPLATE_RULES: HeuristicTemplateRule[] = [
  {
    template: 'Expo App',
    patterns: [/react\s+native/i, /\bexpo\b/i, /\bmobile app\b/i],
    title: 'Expo mobile application starter',
  },
  {
    template: 'NextJS Shadcn',
    patterns: [/\bnext(\.js|js)?\b/i, /\bshadcn\b/i],
    title: 'Next.js with shadcn starter',
    match: 'all',
  },
  {
    template: 'NextJS',
    patterns: [/\bnext(\.js|js)?\b/i],
    title: 'Next.js application starter',
  },
  {
    template: 'Vite Shadcn',
    patterns: [/\breact\b/i, /\bshadcn\b/i],
    title: 'Vite React with shadcn starter',
    match: 'all',
  },
  {
    template: 'Node Express API',
    patterns: [/\bnode\b/i, /\bexpress\b/i, /\bapi\b/i],
    title: 'Node Express API starter',
    match: 'all',
  },
  {
    template: 'Vite React',
    patterns: [/\breact\b/i, /\bjsx\b/i, /\btsx\b/i, /\bwebsite\b/i],
    title: 'React website starter',
  },
  {
    template: 'Vue',
    patterns: [/\bvue\b/i, /\bnuxt\b/i],
    title: 'Vue starter',
  },
  {
    template: 'Angular',
    patterns: [/\bangular\b/i],
    title: 'Angular starter',
  },
  {
    template: 'Sveltekit',
    patterns: [/\bsvelte\b/i, /\bsveltekit\b/i],
    title: 'SvelteKit starter',
  },
  {
    template: 'SolidJS',
    patterns: [/\bsolid\b/i, /\bsolidjs\b/i],
    title: 'SolidJS starter',
  },
  {
    template: 'Basic Astro',
    patterns: [/\bastro\b/i],
    title: 'Astro starter',
  },
  {
    template: 'Remix Typescript',
    patterns: [/\bremix\b/i],
    title: 'Remix starter',
  },
  {
    template: 'Qwik Typescript',
    patterns: [/\bqwik\b/i],
    title: 'Qwik starter',
  },
  {
    template: 'Slidev',
    patterns: [/\bslidev\b/i, /\bpresentation\b/i, /\bslides\b/i],
    title: 'Slidev presentation starter',
  },
  {
    template: 'Vite Typescript',
    patterns: [/\btypescript\b/i, /\btype-safe\b/i],
    title: 'TypeScript starter',
  },
  {
    template: 'Vanilla Vite',
    patterns: [/\bvanilla\b/i, /\bjavascript\b/i, /\bhtml\b/i, /\bcss\b/i],
    title: 'Vanilla Vite starter',
  },
];

function templateExists(templateName: string): boolean {
  return STARTER_TEMPLATES.some((template) => template.name === templateName);
}

export function inferTemplateFromPrompt(message: string): { template: string; title: string } | null {
  const normalizedMessage = (message || '').trim();

  if (!normalizedMessage) {
    return null;
  }

  for (const rule of HEURISTIC_TEMPLATE_RULES) {
    if (!templateExists(rule.template)) {
      continue;
    }

    const isMatch =
      rule.match === 'all'
        ? rule.patterns.every((pattern) => pattern.test(normalizedMessage))
        : rule.patterns.some((pattern) => pattern.test(normalizedMessage));

    if (isMatch) {
      return {
        template: rule.template,
        title: rule.title,
      };
    }
  }

  return null;
}

const parseSelectedTemplate = (llmOutput: string): { template: string; title: string } | null => {
  if (typeof llmOutput !== 'string' || llmOutput.length === 0) {
    return null;
  }

  // Extract content between <templateName> tags
  const templateNameMatch = llmOutput.match(/<templateName>(.*?)<\/templateName>/);
  const titleMatch = llmOutput.match(/<title>(.*?)<\/title>/);

  if (!templateNameMatch) {
    return null;
  }

  return { template: templateNameMatch[1].trim(), title: titleMatch?.[1].trim() || 'Untitled Project' };
};

export const selectStarterTemplate = async (options: { message: string; model: string; provider: ProviderInfo }) => {
  const { message, model, provider } = options;
  const heuristicSelection = inferTemplateFromPrompt(message);

  if (heuristicSelection) {
    return heuristicSelection;
  }

  const requestBody = {
    message,
    model,
    provider,
    system: starterTemplateSelectionPrompt(templates),
  };
  const response = await fetch('/api/llmcall', {
    method: 'POST',
    body: JSON.stringify(requestBody),
  });
  const respJson: { text: string } = await response.json();

  const { text } = respJson;
  const selectedTemplate = parseSelectedTemplate(text);

  if (selectedTemplate && templateExists(selectedTemplate.template)) {
    return selectedTemplate;
  }

  if (selectedTemplate && !templateExists(selectedTemplate.template)) {
    const fallbackFromPrompt = inferTemplateFromPrompt(message);

    if (fallbackFromPrompt) {
      return fallbackFromPrompt;
    }
  }

  return {
    template: 'blank',
    title: '',
  };
};

const getGitHubRepoContent = async (repoName: string): Promise<{ name: string; path: string; content: string }[]> => {
  try {
    // Instead of directly fetching from GitHub, use our own API endpoint as a proxy
    const response = await fetch(`/api/github-template?repo=${encodeURIComponent(repoName)}`);

    if (!response.ok) {
      return [];
    }

    // Our API will return the files in the format we need
    const files = (await response.json()) as any;

    return files;
  } catch {
    return [];
  }
};

export async function getTemplates(templateName: string, title?: string) {
  const template = STARTER_TEMPLATES.find((t) => t.name == templateName);

  if (!template) {
    return null;
  }

  const githubRepo = template.githubRepo;
  const remoteFiles = await getGitHubRepoContent(githubRepo);
  const localFallbackFiles = getLocalStarterTemplateFiles(template);
  const usingLocalFallback = remoteFiles.length === 0 && localFallbackFiles.length > 0;
  const localFallback = usingLocalFallback ? getLocalStarterTemplateFallback(template) : null;
  const files = usingLocalFallback ? localFallbackFiles : remoteFiles;

  if (files.length === 0) {
    return null;
  }

  let filteredFiles = files;

  /*
   * ignoring common unwanted files
   * exclude    .git
   */
  filteredFiles = filteredFiles.filter((x) => x.path.startsWith('.git') == false);

  /*
   * exclude    lock files
   * WE NOW INCLUDE LOCK FILES FOR IMPROVED INSTALL TIMES
   */
  {
    /*
     *const comminLockFiles = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];
     *filteredFiles = filteredFiles.filter((x) => comminLockFiles.includes(x.name) == false);
     */
  }

  // exclude    .bolt
  filteredFiles = filteredFiles.filter((x) => x.path.startsWith('.bolt') == false);

  // check for ignore file in .bolt folder
  const templateIgnoreFile = files.find((x) => x.path.startsWith('.bolt') && x.name == 'ignore');

  const filesToImport = {
    files: filteredFiles,
    ignoreFile: [] as typeof filteredFiles,
  };

  if (templateIgnoreFile) {
    // redacting files specified in ignore file
    const ignorepatterns = templateIgnoreFile.content.split('\n').map((x) => x.trim());
    const ig = ignore().add(ignorepatterns);

    // filteredFiles = filteredFiles.filter(x => !ig.ignores(x.path))
    const ignoredFiles = filteredFiles.filter((x) => ig.ignores(x.path));

    filesToImport.files = filteredFiles;
    filesToImport.ignoreFile = ignoredFiles;
  }

  const fallbackBootstrapActions = localFallback
    ? `
<boltAction type="shell">
${localFallback.scaffoldCommand}
</boltAction>
${localFallback.installCommand ? `<boltAction type="shell">\n${localFallback.installCommand}\n</boltAction>` : ''}
`
    : '';

  const assistantMessage = `
Bolt is initializing your project with the required files using the ${template.name} template.
<boltArtifact id="imported-files" title="${title || 'Create initial files'}" type="bundled">
${fallbackBootstrapActions}
${filesToImport.files
  .map(
    (file) =>
      `<boltAction type="file" filePath="${file.path}">
${file.content}
</boltAction>`,
  )
  .join('\n')}
</boltArtifact>
`;
  let userMessage = ``;
  const templatePromptFile = files.filter((x) => x.path.startsWith('.bolt')).find((x) => x.name == 'prompt');

  if (templatePromptFile) {
    userMessage = `
TEMPLATE INSTRUCTIONS:
${templatePromptFile.content}

---
`;
  }

  if (usingLocalFallback) {
    userMessage += `Fallback starter note:
Remote template download was unavailable, so a built-in ${template.label} starter fallback has been loaded.
The initial scaffold and dependency install actions were queued automatically.
Continue from the generated starter. Only re-run scaffolding if recovery is needed.
---
`;
  }

  if (filesToImport.ignoreFile.length > 0) {
    userMessage =
      userMessage +
      `
STRICT FILE ACCESS RULES - READ CAREFULLY:

The following files are READ-ONLY and must never be modified:
${filesToImport.ignoreFile.map((file) => `- ${file.path}`).join('\n')}

Permitted actions:
✓ Import these files as dependencies
✓ Read from these files
✓ Reference these files

Strictly forbidden actions:
❌ Modify any content within these files
❌ Delete these files
❌ Rename these files
❌ Move these files
❌ Create new versions of these files
❌ Suggest changes to these files

Any attempt to modify these protected files will result in immediate termination of the operation.

If you need to make changes to functionality, create new files instead of modifying the protected ones listed above.
---
`;
  }

  userMessage += `
---
template import is done, and you can now use the imported files,
edit only the files that need to be changed, and you can create new files as needed.
NO NOT EDIT/WRITE ANY FILES THAT ALREADY EXIST IN THE PROJECT AND DOES NOT NEED TO BE MODIFIED
---
Now that the Template is imported please continue with my original request

IMPORTANT: Dont Forget to install the dependencies before running the app by using \`npm install && npm run dev\`
`;

  return {
    assistantMessage,
    userMessage,
  };
}
