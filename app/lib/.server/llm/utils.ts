import { type Message } from 'ai';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, MODEL_REGEX, PROVIDER_REGEX } from '~/utils/constants';
import { IGNORE_PATTERNS, type FileMap } from './constants';
import ignore from 'ignore';
import type { ContextAnnotation } from '~/types/context';

const DETERMINISTIC_CONTEXT_MAX_FILES = 8;

function toRelativeFilePath(path: string) {
  return path.replace('/home/project/', '');
}

function extractGoalTokens(goal: string | undefined) {
  return new Set(
    String(goal || '')
      .toLowerCase()
      .match(/[a-z0-9][a-z0-9._-]{2,}/g) || [],
  );
}

function scoreDeterministicContextFile(path: string, goalTokens: Set<string>) {
  const relativePath = toRelativeFilePath(path);
  const normalizedPath = relativePath.toLowerCase();
  const fileName = normalizedPath.split('/').pop() || normalizedPath;
  let score = 0;

  if (normalizedPath === 'package.json') {
    score += 180;
  }

  if (normalizedPath === 'index.html') {
    score += 150;
  }

  if (/^vite\.config\./.test(fileName)) {
    score += 145;
  }

  if (/^src\/app\.(tsx|jsx|ts|js)$/.test(normalizedPath)) {
    score += 170;
  }

  if (/^src\/main\.(tsx|jsx|ts|js)$/.test(normalizedPath)) {
    score += 160;
  }

  if (/^src\/(index|app)\.css$/.test(normalizedPath)) {
    score += 120;
  }

  if (/^(tailwind|postcss|uno)\.config\./.test(fileName)) {
    score += 115;
  }

  if (/^tsconfig/.test(fileName)) {
    score += 105;
  }

  if (/^app\/root\./.test(normalizedPath)) {
    score += 165;
  }

  if (/^app\/routes\//.test(normalizedPath)) {
    score += 155;
  }

  if (/^(src|app)\/components\//.test(normalizedPath)) {
    score += 100;
  }

  if (/readme/i.test(fileName)) {
    score += 30;
  }

  if (/^(public|assets)\//.test(normalizedPath)) {
    score -= 20;
  }

  if (/^(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb)$/.test(fileName)) {
    score -= 80;
  }

  let goalMatchCount = 0;

  for (const token of goalTokens) {
    if (normalizedPath.includes(token)) {
      goalMatchCount += 1;
    }
  }

  score += Math.min(goalMatchCount, 3) * 24;

  return score;
}

export function extractPropertiesFromMessage(message: Omit<Message, 'id'>): {
  model: string;
  provider: string;
  content: string;
} {
  const textContent = Array.isArray(message.content)
    ? message.content.find((item) => item.type === 'text')?.text || ''
    : message.content;

  const modelMatch = textContent.match(MODEL_REGEX);
  const providerMatch = textContent.match(PROVIDER_REGEX);

  /*
   * Extract model
   * const modelMatch = message.content.match(MODEL_REGEX);
   */
  const model = modelMatch ? modelMatch[1] : DEFAULT_MODEL;

  /*
   * Extract provider
   * const providerMatch = message.content.match(PROVIDER_REGEX);
   */
  const provider = providerMatch ? providerMatch[1] : DEFAULT_PROVIDER.name;

  const cleanedContent = Array.isArray(message.content)
    ? message.content.map((item) => {
        if (item.type === 'text') {
          return {
            type: 'text',
            text: item.text?.replace(MODEL_REGEX, '').replace(PROVIDER_REGEX, ''),
          };
        }

        return item; // Preserve image_url and other types as is
      })
    : textContent.replace(MODEL_REGEX, '').replace(PROVIDER_REGEX, '');

  return { model, provider, content: cleanedContent };
}

export function simplifyBoltActions(input: string): string {
  // Using regex to match boltAction tags that have type="file"
  const regex = /(<boltAction[^>]*type="file"[^>]*>)([\s\S]*?)(<\/boltAction>)/g;

  // Replace each matching occurrence
  return input.replace(regex, (_0, openingTag, _2, closingTag) => {
    return `${openingTag}\n          ...\n        ${closingTag}`;
  });
}

export function createFilesContext(files: FileMap, useRelativePath?: boolean) {
  const ig = ignore().add(IGNORE_PATTERNS);
  let filePaths = Object.keys(files);
  filePaths = filePaths.filter((x) => {
    const relPath = toRelativeFilePath(x);
    return !ig.ignores(relPath);
  });

  const fileContexts = filePaths
    .filter((x) => files[x] && files[x].type == 'file')
    .map((path) => {
      const dirent = files[path];

      if (!dirent || dirent.type == 'folder') {
        return '';
      }

      const codeWithLinesNumbers = dirent.content
        .split('\n')
        // .map((v, i) => `${i + 1}|${v}`)
        .join('\n');

      let filePath = path;

      if (useRelativePath) {
        filePath = toRelativeFilePath(path);
      }

      return `<boltAction type="file" filePath="${filePath}">${codeWithLinesNumbers}</boltAction>`;
    });

  return `<boltArtifact id="code-content" title="Code Content" >\n${fileContexts.join('\n')}\n</boltArtifact>`;
}

export function selectDeterministicContextFiles(
  files: FileMap,
  options?: {
    latestGoal?: string;
    maxFiles?: number;
  },
) {
  const ig = ignore().add(IGNORE_PATTERNS);
  const maxFiles = options?.maxFiles || DETERMINISTIC_CONTEXT_MAX_FILES;
  const goalTokens = extractGoalTokens(options?.latestGoal);
  const candidates = Object.entries(files)
    .filter(([path, dirent]) => {
      const relPath = toRelativeFilePath(path);

      return dirent?.type === 'file' && !dirent.isBinary && !ig.ignores(relPath);
    })
    .map(([path, dirent]) => ({
      path,
      dirent,
      score: scoreDeterministicContextFile(path, goalTokens),
    }));

  if (candidates.length === 0) {
    return undefined;
  }

  const rankedCandidates = [...candidates].sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const positiveCandidates = rankedCandidates.filter((candidate) => candidate.score > 0);
  const selectedCandidates = (positiveCandidates.length > 0 ? positiveCandidates : rankedCandidates).slice(0, maxFiles);
  const selectedFiles: FileMap = {};

  for (const candidate of selectedCandidates) {
    selectedFiles[toRelativeFilePath(candidate.path)] = candidate.dirent;
  }

  return selectedFiles;
}

export function extractCurrentContext(messages: Message[]) {
  const lastAssistantMessage = messages.filter((x) => x.role == 'assistant').slice(-1)[0];

  if (!lastAssistantMessage) {
    return { summary: undefined, codeContext: undefined };
  }

  let summary: ContextAnnotation | undefined;
  let codeContext: ContextAnnotation | undefined;

  if (!lastAssistantMessage.annotations?.length) {
    return { summary: undefined, codeContext: undefined };
  }

  for (let i = 0; i < lastAssistantMessage.annotations.length; i++) {
    const annotation = lastAssistantMessage.annotations[i];

    if (!annotation || typeof annotation !== 'object') {
      continue;
    }

    if (!(annotation as any).type) {
      continue;
    }

    const annotationObject = annotation as any;

    if (annotationObject.type === 'codeContext') {
      codeContext = annotationObject;
      break;
    } else if (annotationObject.type === 'chatSummary') {
      summary = annotationObject;
      break;
    }
  }

  return { summary, codeContext };
}
