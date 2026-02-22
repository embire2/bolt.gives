import { inferTemplateFromPrompt } from '~/utils/selectStarterTemplate';

const MUTATING_INTENT_PATTERNS = [
  /\b(create|build|scaffold|generate|spin up|set up|setup)\b[\s\S]{0,80}\b(app|website|project|api|server|frontend|backend)\b/i,
  /\b(install|run|start)\b[\s\S]{0,40}\b(dev|server|preview|dependencies|package|npm|pnpm|vite)\b/i,
  /\b(react|vite|next(?:\.js)?|vue|angular|svelte|node(?:\.js)?)\b[\s\S]{0,40}\b(app|starter|project|website)\b/i,
];
const MUTATING_VERBS = /\b(create|build|scaffold|generate|spin up|set up|setup|install|run|start|bootstrap|ship)\b/i;

export function requestLikelyNeedsMutatingActions(message: string): boolean {
  const normalized = (message || '').trim();

  if (!normalized) {
    return false;
  }

  const inferredTemplate = inferTemplateFromPrompt(normalized);

  if (inferredTemplate?.template && inferredTemplate.template !== 'blank' && MUTATING_VERBS.test(normalized)) {
    return true;
  }

  return MUTATING_INTENT_PATTERNS.some((pattern) => pattern.test(normalized));
}
