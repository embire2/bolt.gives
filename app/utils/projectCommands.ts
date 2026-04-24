import type { Message } from 'ai';
import { generateId } from './fileUtils';

export interface ProjectCommands {
  type: string;
  setupCommand?: string;
  startCommand?: string;
  followupMessage: string;
}

interface FileContent {
  content: string;
  path: string;
}

type SupportedPackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

interface PackageScripts {
  dev?: string;
  start?: string;
  preview?: string;
  build?: string;
}

const IRRELEVANT_PROJECT_PATH_RE = /(^|\/)(node_modules|\.pnpm|\.vite|coverage|\.turbo|\.cache)(\/|$)/i;

// Helper function to make any command non-interactive
function makeNonInteractive(command: string): string {
  // Set environment variables for non-interactive mode
  const envVars = 'CI=true DEBIAN_FRONTEND=noninteractive FORCE_COLOR=0';

  // Common interactive packages and their non-interactive flags
  const interactivePackages = [
    { pattern: /npx\s+([^@\s]+@?[^\s]*)\s+init/g, replacement: 'echo "y" | npx --yes $1 init --defaults --yes' },
    { pattern: /npx\s+create-([^\s]+)/g, replacement: 'npx --yes create-$1 --template default' },
    { pattern: /npx\s+([^@\s]+@?[^\s]*)\s+add/g, replacement: 'npx --yes $1 add --defaults --yes' },
    { pattern: /npm\s+install(?!\s+--)/g, replacement: 'npm install --yes --no-audit --no-fund --silent' },
    { pattern: /yarn\s+add(?!\s+--)/g, replacement: 'yarn add --non-interactive' },
    { pattern: /pnpm\s+add(?!\s+--)/g, replacement: 'pnpm add --yes' },
  ];

  let processedCommand = command;

  // Apply replacements for known interactive patterns
  interactivePackages.forEach(({ pattern, replacement }) => {
    processedCommand = processedCommand.replace(pattern, replacement);
  });

  return `${envVars} ${processedCommand}`;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

function isProjectOwnedPath(path: string): boolean {
  return !IRRELEVANT_PROJECT_PATH_RE.test(normalizePath(path));
}

function getProjectFiles(files: FileContent[]): FileContent[] {
  return files.filter((file) => isProjectOwnedPath(file.path));
}

function getPreferredPackageJsonFile(files: FileContent[]): FileContent | undefined {
  return getProjectFiles(files)
    .filter((file) => normalizePath(file.path).endsWith('package.json'))
    .sort((left, right) => {
      const leftDepth = normalizePath(left.path).split('/').filter(Boolean).length;
      const rightDepth = normalizePath(right.path).split('/').filter(Boolean).length;

      if (leftDepth !== rightDepth) {
        return leftDepth - rightDepth;
      }

      return normalizePath(left.path).localeCompare(normalizePath(right.path));
    })[0];
}

function hasPathMatch(files: FileContent[], pattern: RegExp) {
  return getProjectFiles(files).some((file) => pattern.test(normalizePath(file.path)));
}

function detectPackageManager(files: FileContent[], packageJsonContent: string): SupportedPackageManager {
  const packageManagerMatch = packageJsonContent.match(/"packageManager"\s*:\s*"(pnpm|yarn|bun|npm)@/i);

  if (packageManagerMatch) {
    return packageManagerMatch[1].toLowerCase() as SupportedPackageManager;
  }

  if (hasPathMatch(files, /(^|\/)pnpm-lock\.ya?ml$/i)) {
    return 'pnpm';
  }

  if (hasPathMatch(files, /(^|\/)yarn\.lock$/i)) {
    return 'yarn';
  }

  if (hasPathMatch(files, /(^|\/)bun\.lockb?$/i)) {
    return 'bun';
  }

  return 'npm';
}

function createSetupCommand(packageManager: SupportedPackageManager, isShadcnProject: boolean) {
  let baseSetupCommand: string;

  switch (packageManager) {
    case 'pnpm':
      baseSetupCommand = 'pnpm install --no-frozen-lockfile';
      break;
    case 'yarn':
      baseSetupCommand = 'yarn install --non-interactive';
      break;
    case 'bun':
      baseSetupCommand = 'bun install';
      break;
    case 'npm':
    default:
      baseSetupCommand = 'npm install';
      break;
  }

  if (isShadcnProject) {
    baseSetupCommand += ' && npx shadcn@latest init';
  }

  return makeNonInteractive(baseSetupCommand);
}

function createStartCommand(packageManager: SupportedPackageManager, scriptName: 'dev' | 'start' | 'preview') {
  switch (packageManager) {
    case 'yarn':
      return `yarn ${scriptName}`;
    case 'bun':
      return `bun run ${scriptName}`;
    case 'pnpm':
      return `pnpm run ${scriptName}`;
    case 'npm':
    default:
      return `npm run ${scriptName}`;
  }
}

function extractScriptsFromPackageJson(content: string): PackageScripts {
  try {
    const parsed = JSON.parse(content);
    return parsed?.scripts && typeof parsed.scripts === 'object' ? parsed.scripts : {};
  } catch {
    const extracted: PackageScripts = {};
    const scriptRegex = /"(dev|start|preview|build)"\s*:\s*"([^"]+)"/g;
    let match: RegExpExecArray | null;

    while ((match = scriptRegex.exec(content)) !== null) {
      const [, key, value] = match;
      extracted[key as keyof PackageScripts] = value;
    }

    return extracted;
  }
}

function inferProjectKind(files: FileContent[]) {
  if (hasPathMatch(files, /(^|\/)vite\.config\.(t|j)sx?$/i) || hasPathMatch(files, /(^|\/)src\/main\.(t|j)sx?$/i)) {
    return 'vite';
  }

  if (
    hasPathMatch(files, /(^|\/)next\.config\.(mjs|js|ts)$/i) ||
    hasPathMatch(files, /(^|\/)app\/page\.(t|j)sx?$/i) ||
    hasPathMatch(files, /(^|\/)pages\/index\.(t|j)sx?$/i)
  ) {
    return 'next';
  }

  if (hasPathMatch(files, /(^|\/)angular\.json$/i)) {
    return 'angular';
  }

  return null;
}

function looksLikeReactWorkspace(files: FileContent[]) {
  return getProjectFiles(files).some((file) => {
    const normalizedPath = normalizePath(file.path);

    if (!/\.(?:[jt]sx?|mjs|mts|cts)$/.test(normalizedPath)) {
      return false;
    }

    return (
      /\bfrom\s+['"]react['"]/.test(file.content) ||
      /\bfrom\s+['"]react-dom(?:\/client)?['"]/.test(file.content) ||
      /\bReactDOM\.createRoot\b/.test(file.content) ||
      /\buse(?:State|Effect|Memo|Callback|Reducer|Ref)\b/.test(file.content)
    );
  });
}

export async function detectProjectCommands(files: FileContent[]): Promise<ProjectCommands> {
  const projectFiles = getProjectFiles(files);
  const hasFile = (name: string) => files.some((f) => f.path.endsWith(name));
  const hasFileContent = (name: string, content: string) =>
    files.some((f) => f.path.endsWith(name) && f.content.includes(content));
  const hasBuiltOutput = () =>
    projectFiles.some((f) => /(^|\/)(dist|build|out)\/index\.html$/i.test(f.path) || /(^|\/)\.next\//i.test(f.path));

  if (hasFile('package.json')) {
    const packageJsonFile = getPreferredPackageJsonFile(files);

    if (!packageJsonFile) {
      return { type: '', setupCommand: '', followupMessage: '' };
    }

    try {
      const packageJson = JSON.parse(packageJsonFile.content);
      const scripts = packageJson?.scripts || {};
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
      const packageManager = detectPackageManager(projectFiles, packageJsonFile.content);

      // Check if this is a shadcn project
      const isShadcnProject =
        hasFileContent('components.json', 'shadcn') ||
        Object.keys(dependencies).some((dep) => dep.includes('shadcn')) ||
        hasFile('components.json');

      /*
       * Prefer commands that produce a live application preview on first run.
       * `preview` often points at a static port such as 4173 and is only valid after a build exists.
       */
      const primaryCommand = ['dev', 'start'].find((cmd) => scripts[cmd]);
      const previewCommand = scripts.preview && hasBuiltOutput() ? 'preview' : undefined;
      const availableCommand = primaryCommand || previewCommand;

      const setupCommand = createSetupCommand(packageManager, isShadcnProject);

      if (availableCommand) {
        return {
          type: 'Node.js',
          setupCommand,
          startCommand: createStartCommand(packageManager, availableCommand as 'dev' | 'start' | 'preview'),
          followupMessage:
            availableCommand === 'preview'
              ? `Found a built preview script in package.json. Running "${createStartCommand(packageManager, 'preview')}" because a production build already exists.`
              : `Found "${availableCommand}" script in package.json. Running "${createStartCommand(packageManager, availableCommand as 'dev' | 'start')}" after installation.`,
        };
      }

      return {
        type: 'Node.js',
        setupCommand,
        followupMessage:
          'Would you like me to inspect package.json to determine the available scripts for running this project?',
      };
    } catch (error) {
      console.error('Error parsing package.json:', error);
    }

    const fallbackScripts = extractScriptsFromPackageJson(packageJsonFile.content);
    const fallbackPackageManager = detectPackageManager(projectFiles, packageJsonFile.content);
    const inferredProjectKind = inferProjectKind(projectFiles);
    const fallbackCommand =
      (['dev', 'start'] as const).find((cmd) => Boolean(fallbackScripts[cmd])) ||
      (fallbackScripts.preview && hasBuiltOutput() ? 'preview' : undefined) ||
      (inferredProjectKind === 'vite' || inferredProjectKind === 'next'
        ? 'dev'
        : inferredProjectKind === 'angular'
          ? 'start'
          : undefined);

    if (fallbackCommand) {
      const setupCommand = createSetupCommand(fallbackPackageManager, hasFile('components.json'));

      return {
        type: inferredProjectKind === 'next' ? 'Next.js' : inferredProjectKind === 'angular' ? 'Angular' : 'Node.js',
        setupCommand,
        startCommand: createStartCommand(fallbackPackageManager, fallbackCommand),
        followupMessage: fallbackScripts[fallbackCommand]
          ? `Inferred the "${fallbackCommand}" runtime command from the generated package manifest. Running "${createStartCommand(fallbackPackageManager, fallbackCommand)}" after installation.`
          : `The generated project matches a ${inferredProjectKind || 'Node.js'} app. Running "${createStartCommand(fallbackPackageManager, fallbackCommand)}" after installation.`,
      };
    }

    return { type: '', setupCommand: '', followupMessage: '' };
  }

  const inferredProjectKind = inferProjectKind(projectFiles);

  if (inferredProjectKind === 'vite' && looksLikeReactWorkspace(projectFiles)) {
    return {
      type: 'Node.js',
      setupCommand: createSetupCommand('pnpm', false),
      startCommand: 'pnpm run dev',
      followupMessage:
        'Detected a generated Vite React workspace without package.json. Bootstrapping a minimal package manifest and running "pnpm run dev".',
    };
  }

  if (hasFile('index.html')) {
    return {
      type: 'Static',
      startCommand: 'npx --yes serve',
      followupMessage: '',
    };
  }

  return { type: '', setupCommand: '', followupMessage: '' };
}

export function createCommandsMessage(commands: ProjectCommands): Message | null {
  if (!commands.setupCommand && !commands.startCommand) {
    return null;
  }

  let commandString = '';

  if (commands.setupCommand) {
    commandString += `
<boltAction type="shell">${commands.setupCommand}</boltAction>`;
  }

  if (commands.startCommand) {
    commandString += `
<boltAction type="start">${commands.startCommand}</boltAction>
`;
  }

  return {
    role: 'assistant',
    content: `
${commands.followupMessage ? `\n\n${commands.followupMessage}` : ''}
<boltArtifact id="project-setup" title="Project Setup">
${commandString}
</boltArtifact>`,
    id: generateId(),
    createdAt: new Date(),
  };
}

export function escapeBoltArtifactTags(input: string) {
  // Regular expression to match boltArtifact tags and their content
  const regex = /(<boltArtifact[^>]*>)([\s\S]*?)(<\/boltArtifact>)/g;

  return input.replace(regex, (match, openTag, content, closeTag) => {
    // Escape the opening tag
    const escapedOpenTag = openTag.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Escape the closing tag
    const escapedCloseTag = closeTag.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Return the escaped version
    return `${escapedOpenTag}${content}${escapedCloseTag}`;
  });
}

export function escapeBoltAActionTags(input: string) {
  // Regular expression to match boltArtifact tags and their content
  const regex = /(<boltAction[^>]*>)([\s\S]*?)(<\/boltAction>)/g;

  return input.replace(regex, (match, openTag, content, closeTag) => {
    // Escape the opening tag
    const escapedOpenTag = openTag.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Escape the closing tag
    const escapedCloseTag = closeTag.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Return the escaped version
    return `${escapedOpenTag}${content}${escapedCloseTag}`;
  });
}

export function escapeBoltTags(input: string) {
  return escapeBoltArtifactTags(escapeBoltAActionTags(input));
}

// We have this seperate function to simplify the restore snapshot process in to one single artifact.
export function createCommandActionsString(commands: ProjectCommands): string {
  if (!commands.setupCommand && !commands.startCommand) {
    // Return empty string if no commands
    return '';
  }

  let commandString = '';

  if (commands.setupCommand) {
    commandString += `
<boltAction type="shell">${commands.setupCommand}</boltAction>`;
  }

  if (commands.startCommand) {
    commandString += `
<boltAction type="start">${commands.startCommand}</boltAction>
`;
  }

  return commandString;
}
