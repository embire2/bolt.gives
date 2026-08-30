export type PreviewStartCommand = {
  command: string;
  discardedVerification: boolean;
  isPreviewStart: boolean;
};

const PACKAGE_PREVIEW_START_RE = /^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:dev|start|preview)\b/i;
const DIRECT_PREVIEW_START_RE = /^(?:vite(?:\s|$)|next\s+(?:dev|start)\b|astro\s+(?:dev|preview)\b|ng\s+serve\b)/i;
const SHELL_CONTROL_RE = /[;&|\r\n]/;
const BACKGROUND_VERIFICATION_RE = /^(.*?)\s+&\s+((?:sleep|curl|wget|wait|until|while|for)\b[\s\S]*)$/i;
const TRAILING_BACKGROUND_RE = /^(.*?)\s+&\s*$/;
const HOSTED_PROJECT_CD_PREFIX_RE = /^cd\s+(?:\/home\/project\/?|"\/home\/project\/?"|'\/home\/project\/?')\s*&&\s*/i;

function isStandalonePreviewStart(command: string): boolean {
  return (
    !SHELL_CONTROL_RE.test(command) && (PACKAGE_PREVIEW_START_RE.test(command) || DIRECT_PREVIEW_START_RE.test(command))
  );
}

export function normalizePreviewStartCommand(command: string): PreviewStartCommand {
  const trimmed = command.trim();
  const projectCommand = trimmed.replace(HOSTED_PROJECT_CD_PREFIX_RE, '').trim();
  const backgroundMatch =
    projectCommand.match(BACKGROUND_VERIFICATION_RE) || projectCommand.match(TRAILING_BACKGROUND_RE);

  if (backgroundMatch) {
    const startCommand = backgroundMatch[1].trim();

    if (isStandalonePreviewStart(startCommand)) {
      return {
        command: startCommand,
        discardedVerification: Boolean(backgroundMatch[2]),
        isPreviewStart: true,
      };
    }
  }

  const isPreviewStart = isStandalonePreviewStart(projectCommand);

  return {
    command: isPreviewStart ? projectCommand : trimmed,
    discardedVerification: false,
    isPreviewStart,
  };
}
