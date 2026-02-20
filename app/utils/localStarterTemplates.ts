import type { Template } from '~/types/template';

export type LocalTemplateFile = {
  name: string;
  path: string;
  content: string;
};

type LocalTemplateFallback = {
  scaffoldCommand: string;
  stackLabel: string;
  installCommand?: string;
};

const LOCAL_TEMPLATE_FALLBACKS: Record<string, LocalTemplateFallback> = {
  'Expo App': {
    scaffoldCommand: 'npx --yes create-expo-app@latest . --template blank-typescript',
    stackLabel: 'Expo + TypeScript',
    installCommand: 'ls package.json >/dev/null 2>&1 && npm install',
  },
  'Basic Astro': {
    scaffoldCommand: 'npm create astro@latest . -- --template basics --yes --install',
    stackLabel: 'Astro',
    installCommand: 'ls package.json >/dev/null 2>&1 && npm install',
  },
  'NextJS Shadcn': {
    scaffoldCommand:
      'npx --yes create-next-app@latest . --ts --tailwind --eslint --app --use-npm --yes --no-src-dir --import-alias "@/*"',
    stackLabel: 'Next.js + Tailwind',
    installCommand: 'ls package.json >/dev/null 2>&1 && npm install',
  },
  'Vite Shadcn': {
    scaffoldCommand: 'pnpm dlx create-vite@7.1.0 . --template react-ts',
    stackLabel: 'Vite + React + TypeScript',
    installCommand: 'ls package.json >/dev/null 2>&1 && npm install',
  },
  'Qwik Typescript': {
    scaffoldCommand: 'npm create qwik@latest . -- --yes --typescript',
    stackLabel: 'Qwik + TypeScript',
    installCommand: 'ls package.json >/dev/null 2>&1 && npm install',
  },
  'Remix Typescript': {
    scaffoldCommand: 'npx --yes create-remix@latest . --template remix --no-git --install',
    stackLabel: 'Remix + TypeScript',
    installCommand: 'ls package.json >/dev/null 2>&1 && npm install',
  },
  Slidev: {
    scaffoldCommand: 'npx --yes create-slidev@latest .',
    stackLabel: 'Slidev',
    installCommand: 'ls package.json >/dev/null 2>&1 && npm install',
  },
  Sveltekit: {
    scaffoldCommand: 'npx --yes sv create . --template minimal --types ts --install npm --yes',
    stackLabel: 'SvelteKit + TypeScript',
    installCommand: 'ls package.json >/dev/null 2>&1 && npm install',
  },
  'Vanilla Vite': {
    scaffoldCommand: 'pnpm dlx create-vite@7.1.0 . --template vanilla',
    stackLabel: 'Vite + Vanilla JavaScript',
    installCommand: 'ls package.json >/dev/null 2>&1 && npm install',
  },
  'Vite React': {
    scaffoldCommand: 'pnpm dlx create-vite@7.1.0 . --template react-ts',
    stackLabel: 'Vite + React + TypeScript',
    installCommand: 'ls package.json >/dev/null 2>&1 && npm install',
  },
  'Vite Typescript': {
    scaffoldCommand: 'pnpm dlx create-vite@7.1.0 . --template vanilla-ts',
    stackLabel: 'Vite + TypeScript',
    installCommand: 'ls package.json >/dev/null 2>&1 && npm install',
  },
  Vue: {
    scaffoldCommand: 'pnpm dlx create-vite@7.1.0 . --template vue-ts',
    stackLabel: 'Vue + TypeScript',
    installCommand: 'ls package.json >/dev/null 2>&1 && npm install',
  },
  Angular: {
    scaffoldCommand:
      'npx --yes @angular/cli@17 new starter --defaults --skip-git --routing --style css && cp -r starter/. . && rm -rf starter',
    stackLabel: 'Angular',
    installCommand: 'ls package.json >/dev/null 2>&1 && npm install',
  },
  SolidJS: {
    scaffoldCommand: 'pnpm dlx create-vite@7.1.0 . --template solid-ts',
    stackLabel: 'SolidJS + TypeScript',
    installCommand: 'ls package.json >/dev/null 2>&1 && npm install',
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

export function getLocalStarterTemplateFallback(template: Template): LocalTemplateFallback | null {
  return LOCAL_TEMPLATE_FALLBACKS[template.name] || null;
}
