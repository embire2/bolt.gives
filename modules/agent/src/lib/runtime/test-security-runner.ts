import type { FileMap } from '@bolt/core/types/files';
import type { InteractiveStepRunnerEvent } from '@bolt/agent/lib/runtime/interactive-step-runner';
import { getMissingJestStubs, createTestAndSecuritySteps } from '@bolt/agent/lib/runtime/test-security';
import { InteractiveStepRunner } from '@bolt/agent/lib/runtime/interactive-step-runner';

export async function runWorkspaceTestAndSecurityScan(options: {
  files: FileMap;
  changedPaths: string[];
  shell: {
    ready: () => Promise<void>;
    executeCommand: (
      commandId: string,
      command: string,
      abort?: () => void,
      onData?: (chunk: string) => void,
    ) => Promise<{ exitCode?: number; output?: string } | undefined>;
  };
  createFile: (filePath: string, content: string | Uint8Array) => Promise<boolean>;
  onEvent: (event: InteractiveStepRunnerEvent) => void;
  collaborationServerUrl?: string;
}) {
  const missingStubs = getMissingJestStubs(options.files, options.changedPaths);

  for (const stub of missingStubs) {
    await options.createFile(stub.path, stub.content);
  }

  await options.shell.ready();

  let eventSocket: WebSocket | undefined;

  try {
    if (typeof window !== 'undefined' && options.collaborationServerUrl) {
      const base = options.collaborationServerUrl;
      eventSocket = new WebSocket(`${base.replace(/\/$/, '')}/events`);
    }
  } catch {
    eventSocket = undefined;
  }

  const steps = createTestAndSecuritySteps();
  const runner = new InteractiveStepRunner(
    {
      executeStep: async (step, context) => {
        const commandText =
          step.command[0] === 'bash' && step.command[1] === '-lc' && step.command[2]
            ? `bash -lc ${JSON.stringify(step.command[2])}`
            : step.command.join(' ');
        const resp = await options.shell.executeCommand(`quality-${Date.now()}`, commandText, undefined, (chunk) =>
          context.onStdout(chunk),
        );

        return {
          exitCode: resp?.exitCode ?? 1,
          stdout: resp?.output || '',
          stderr: resp?.exitCode === 0 ? '' : resp?.output || '',
        };
      },
    },
    eventSocket,
  );

  runner.addEventListener('event', (event) => {
    const detail = (event as CustomEvent<InteractiveStepRunnerEvent>).detail;
    options.onEvent(detail);
  });

  await runner.run(steps);

  if (eventSocket && (eventSocket.readyState === WebSocket.OPEN || eventSocket.readyState === WebSocket.CONNECTING)) {
    eventSocket.close();
  }
}
