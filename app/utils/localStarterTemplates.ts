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
  startCommand?: string;
};

const LOCAL_TEMPLATE_FALLBACKS: Record<string, LocalTemplateFallback> = {
  'Expo App': {
    scaffoldCommand: 'npx --yes create-expo-app@latest . --template blank-typescript',
    stackLabel: 'Expo + TypeScript',
    installCommand: 'pnpm install',
  },
  'Basic Astro': {
    scaffoldCommand: 'npm create astro@latest . -- --template basics --yes --install',
    stackLabel: 'Astro',
    installCommand: 'pnpm install',
  },
  'NextJS Shadcn': {
    scaffoldCommand:
      'npx --yes create-next-app@latest . --ts --tailwind --eslint --app --use-npm --yes --no-src-dir --import-alias "@/*"',
    stackLabel: 'Next.js + Tailwind',
    installCommand: 'pnpm install',
  },
  NextJS: {
    scaffoldCommand:
      'npx --yes create-next-app@latest . --ts --eslint --app --use-npm --yes --no-tailwind --no-src-dir --import-alias "@/*"',
    stackLabel: 'Next.js + TypeScript',
    installCommand: 'pnpm install',
  },
  'Vite Shadcn': {
    scaffoldCommand: 'pnpm dlx create-vite@7.1.0 . --template react-ts',
    stackLabel: 'Vite + React + TypeScript',
    installCommand: 'pnpm install',
  },
  'Qwik Typescript': {
    scaffoldCommand: 'npm create qwik@latest . -- --yes --typescript',
    stackLabel: 'Qwik + TypeScript',
    installCommand: 'pnpm install',
  },
  'Remix Typescript': {
    scaffoldCommand: 'npx --yes create-remix@latest . --template remix --no-git --install',
    stackLabel: 'Remix + TypeScript',
    installCommand: 'pnpm install',
  },
  Slidev: {
    scaffoldCommand: 'npx --yes create-slidev@latest .',
    stackLabel: 'Slidev',
    installCommand: 'pnpm install',
  },
  Sveltekit: {
    scaffoldCommand: 'npx --yes sv create . --template minimal --types ts --install npm --yes',
    stackLabel: 'SvelteKit + TypeScript',
    installCommand: 'pnpm install',
  },
  'Vanilla Vite': {
    scaffoldCommand: 'pnpm dlx create-vite@7.1.0 . --template vanilla',
    stackLabel: 'Vite + Vanilla JavaScript',
    installCommand: 'pnpm install',
  },
  'Vite React': {
    scaffoldCommand: 'echo "Using built-in Vite React starter files"',
    stackLabel: 'Vite + React + TypeScript',
    installCommand: 'pnpm install',
    startCommand: 'pnpm run dev',
  },
  'Node Express API': {
    scaffoldCommand:
      "npm init -y && npm pkg set type=module scripts.start=\"node index.js\" && npm install express cors && printf \"import express from 'express';\\nimport cors from 'cors';\\nconst app = express();\\napp.use(cors());\\napp.get('/api/health', (_req, res) => res.json({ ok: true }));\\nconst port = Number(process.env.PORT || 5173);\\napp.listen(port, '0.0.0.0', () => console.log('Server running on ' + port));\\n\" > index.js",
    stackLabel: 'Node.js + Express',
    installCommand: 'pnpm install',
  },
  'Vite Typescript': {
    scaffoldCommand: 'pnpm dlx create-vite@7.1.0 . --template vanilla-ts',
    stackLabel: 'Vite + TypeScript',
    installCommand: 'pnpm install',
  },
  Vue: {
    scaffoldCommand: 'pnpm dlx create-vite@7.1.0 . --template vue-ts',
    stackLabel: 'Vue + TypeScript',
    installCommand: 'pnpm install',
  },
  Angular: {
    scaffoldCommand:
      'npx --yes @angular/cli@17 new starter --defaults --skip-git --routing --style css && cp -r starter/. . && rm -rf starter',
    stackLabel: 'Angular',
    installCommand: 'pnpm install',
  },
  SolidJS: {
    scaffoldCommand: 'pnpm dlx create-vite@7.1.0 . --template solid-ts',
    stackLabel: 'SolidJS + TypeScript',
    installCommand: 'pnpm install',
  },
};

const VITE_REACT_FALLBACK_FILES: LocalTemplateFile[] = [
  {
    name: 'package.json',
    path: 'package.json',
    content: `{
  "name": "vite-react-app",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 5173",
    "build": "tsc -b && vite build",
    "preview": "vite preview --host 0.0.0.0 --port 4173"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.23",
    "@types/react-dom": "^18.3.7",
    "@vitejs/plugin-react": "^4.7.0",
    "typescript": "^5.8.3",
    "vite": "^5.4.19"
  }
}
`,
  },
  {
    name: 'index.html',
    path: 'index.html',
    content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite React App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
  },
  {
    name: 'tsconfig.json',
    path: 'tsconfig.json',
    content: `{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
`,
  },
  {
    name: 'tsconfig.app.json',
    path: 'tsconfig.app.json',
    content: `{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true
  },
  "include": ["src"]
}
`,
  },
  {
    name: 'tsconfig.node.json',
    path: 'tsconfig.node.json',
    content: `{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowSyntheticDefaultImports": true,
    "types": ["node"]
  },
  "include": ["vite.config.ts"]
}
`,
  },
  {
    name: 'vite.config.ts',
    path: 'vite.config.ts',
    content: `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
`,
  },
  {
    name: 'src/main.tsx',
    path: 'src/main.tsx',
    content: `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`,
  },
  {
    name: 'src/App.tsx',
    path: 'src/App.tsx',
    content: `import './App.css';

export default function App() {
  return (
    <main className="app">
      <h1>Vite + React</h1>
      <p>Your fallback starter is ready.</p>
    </main>
  );
}
`,
  },
  {
    name: 'src/index.css',
    path: 'src/index.css',
    content: `:root {
  font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: #0f172a;
  background-color: #f8fafc;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
}
`,
  },
  {
    name: 'src/App.css',
    path: 'src/App.css',
    content: `.app {
  min-height: 100vh;
  display: grid;
  place-content: center;
  text-align: center;
  gap: 0.5rem;
}

h1 {
  margin: 0;
  font-size: 2rem;
}

p {
  margin: 0;
  color: #334155;
}
`,
  },
];

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

  const builtInStarterFiles = template.name === 'Vite React' ? VITE_REACT_FALLBACK_FILES : [];

  return [
    ...builtInStarterFiles,
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
