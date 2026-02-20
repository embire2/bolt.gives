import type { Template } from '~/types/template';

export type LocalTemplateFile = {
  name: string;
  path: string;
  content: string;
};

type LocalTemplateFallback = {
  scaffoldCommand: string;
  stackLabel: string;
};

const LOCAL_TEMPLATE_FALLBACKS: Record<string, LocalTemplateFallback> = {
  'Expo App': {
    scaffoldCommand: 'npx --yes create-expo-app@latest . --template blank-typescript',
    stackLabel: 'Expo + TypeScript',
  },
  'Basic Astro': {
    scaffoldCommand: 'npm create astro@latest . -- --template basics --yes --install',
    stackLabel: 'Astro',
  },
  'NextJS Shadcn': {
    scaffoldCommand:
      'npx --yes create-next-app@latest . --ts --tailwind --eslint --app --use-npm --yes --no-src-dir --import-alias "@/*"',
    stackLabel: 'Next.js + Tailwind',
  },
  'Vite Shadcn': {
    scaffoldCommand: 'pnpm dlx create-vite@7.1.0 . --template react-ts',
    stackLabel: 'Vite + React + TypeScript',
  },
  'Qwik Typescript': {
    scaffoldCommand: 'npm create qwik@latest . -- --yes --typescript',
    stackLabel: 'Qwik + TypeScript',
  },
  'Remix Typescript': {
    scaffoldCommand: 'npx --yes create-remix@latest . --template remix --no-git --install',
    stackLabel: 'Remix + TypeScript',
  },
  Slidev: {
    scaffoldCommand: 'npx --yes create-slidev@latest .',
    stackLabel: 'Slidev',
  },
  Sveltekit: {
    scaffoldCommand: 'npx --yes sv create . --template minimal --types ts --install npm',
    stackLabel: 'SvelteKit + TypeScript',
  },
  'Vanilla Vite': {
    scaffoldCommand: 'pnpm dlx create-vite@7.1.0 . --template vanilla',
    stackLabel: 'Vite + Vanilla JavaScript',
  },
  'Vite React': {
    scaffoldCommand: 'pnpm dlx create-vite@7.1.0 . --template react-ts',
    stackLabel: 'Vite + React + TypeScript',
  },
  'Vite Typescript': {
    scaffoldCommand: 'pnpm dlx create-vite@7.1.0 . --template vanilla-ts',
    stackLabel: 'Vite + TypeScript',
  },
  Vue: {
    scaffoldCommand: 'pnpm dlx create-vite@7.1.0 . --template vue-ts',
    stackLabel: 'Vue + TypeScript',
  },
  Angular: {
    scaffoldCommand:
      'npx --yes @angular/cli@17 new starter --defaults --skip-git --routing --style css && cp -r starter/. . && rm -rf starter',
    stackLabel: 'Angular',
  },
  SolidJS: {
    scaffoldCommand: 'pnpm dlx create-vite@7.1.0 . --template solid-ts',
    stackLabel: 'SolidJS + TypeScript',
  },
};

function toReadme(template: Template, fallback: LocalTemplateFallback): string {
  return `# ${template.label} fallback template

This project used the built-in fallback starter because the remote template source was unavailable.

Target stack: ${fallback.stackLabel}
Scaffold command: \`${fallback.scaffoldCommand}\`
`;
}

function toPrompt(template: Template, fallback: LocalTemplateFallback): string {
  return `The remote starter template for "${template.name}" is temporarily unavailable.
Use the built-in fallback flow below and continue automatically in plain English.

Required execution steps:
1) Scaffold the project with:
\`${fallback.scaffoldCommand}\`
2) Install dependencies if needed.
3) Start the dev server.
4) If any command fails, recover automatically by retrying with safe defaults.
5) Keep commentary simple and user-friendly. Avoid technical jargon unless explicitly requested.

Success criteria:
- A runnable starter app is created.
- The preview starts successfully.
- The user receives concise status updates while work is in progress.
`;
}

export function getLocalStarterTemplateFiles(template: Template): LocalTemplateFile[] {
  const fallback = LOCAL_TEMPLATE_FALLBACKS[template.name];

  if (!fallback) {
    return [];
  }

  return [
    {
      name: 'README.md',
      path: 'README.md',
      content: toReadme(template, fallback),
    },
    {
      name: 'prompt',
      path: '.bolt/prompt',
      content: toPrompt(template, fallback),
    },
  ];
}
