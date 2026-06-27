import { inferTemplateFromPrompt } from '~/utils/selectStarterTemplate';

const MUTATING_INTENT_PATTERNS = [
  /\b(create|build|scaffold|generate|spin up|set up|setup)\b[\s\S]{0,80}\b(app|website|project|api|server|frontend|backend)\b/i,
  /\b(install|run|start)\b[\s\S]{0,40}\b(dev|server|preview|dependencies|package|npm|pnpm|vite)\b/i,
  /\b(react|vite|next(?:\.js)?|vue|angular|svelte|node(?:\.js)?)\b[\s\S]{0,40}\b(app|starter|project|website)\b/i,
];
const MUTATING_VERBS = /\b(create|build|scaffold|generate|spin up|set up|setup|install|run|start|bootstrap|ship)\b/i;
const FILE_CHANGE_VERBS =
  /\b(add|change|update|modify|improve|enhance|fix|repair|refactor|redesign|replace|remove|delete|implement|wire|connect|make|show|hide)\b/i;
const PROJECT_TARGET =
  /\b(app|project|site|website|page|screen|component|ui|calendar|dashboard|feature|label|button|sidebar|form|layout|style|copy|text)\b/i;
const FOLLOW_UP_PROJECT_QUALIFIER = /\b(current|existing|this|the|already created|same)\b/i;
const READ_ONLY_CHANGE_CUE =
  /\b(?:explain|describe|tell me|what is|how does|why|summari[sz]e|suggest|recommend|ideas?)\b[\s\S]{0,80}\b(?:improve|change|update|fix|enhance|refactor)\b/i;
const EXPLICIT_NO_WRITE_CUE =
  /\b(?:without|do not|don't)\s+(?:changing|editing|modifying|writing|touching|updating)\b/i;

export function requestLikelyNeedsProjectFileChanges(message: string): boolean {
  const normalized = (message || '').trim();

  if (!normalized || EXPLICIT_NO_WRITE_CUE.test(normalized)) {
    return false;
  }

  if (
    READ_ONLY_CHANGE_CUE.test(normalized) &&
    !/\b(?:in|inside|on|to)\s+(?:the\s+)?(?:current|existing|this)\b/i.test(normalized)
  ) {
    return false;
  }

  const changeBeforeTarget = new RegExp(`${FILE_CHANGE_VERBS.source}[\\s\\S]{0,140}${PROJECT_TARGET.source}`, 'i');
  const targetBeforeChange = new RegExp(
    `${FOLLOW_UP_PROJECT_QUALIFIER.source}[\\s\\S]{0,40}${PROJECT_TARGET.source}[\\s\\S]{0,140}${FILE_CHANGE_VERBS.source}`,
    'i',
  );
  const visibleUiChange =
    /\b(add|show|make|change|update)\b[\s\S]{0,120}\b(visible|label|button|sidebar|heading|text|copy|section|panel)\b/i;

  return changeBeforeTarget.test(normalized) || targetBeforeChange.test(normalized) || visibleUiChange.test(normalized);
}

export function requestLikelyNeedsMutatingActions(message: string): boolean {
  const normalized = (message || '').trim();

  if (!normalized) {
    return false;
  }

  const inferredTemplate = inferTemplateFromPrompt(normalized);

  if (inferredTemplate?.template && inferredTemplate.template !== 'blank' && MUTATING_VERBS.test(normalized)) {
    return true;
  }

  return (
    requestLikelyNeedsProjectFileChanges(normalized) ||
    MUTATING_INTENT_PATTERNS.some((pattern) => pattern.test(normalized))
  );
}
