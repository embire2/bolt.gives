#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const rootDir = path.resolve(new URL('..', import.meta.url).pathname);
const outputMarkdownPath = path.join(rootDir, 'commentary.md');
const outputTsPath = path.join(rootDir, 'app/lib/runtime/commentary-pool.generated.ts');
const phaseSize = 60;

/** @type {Array<{phase: 'plan'|'action'|'verification'|'next-step'|'recovery', title: string, starts: string[], actions: string[], intents: string[]}>} */
const phaseConfigs = [
  {
    phase: 'plan',
    title: 'Plan Phase',
    starts: [
      'I am mapping your request',
      'I am organizing the task',
      'I am outlining the approach',
      'I am reviewing your goal',
      'I am framing the implementation path',
      'I am translating your request into a work plan',
      'I am setting up the next sequence of steps',
      'I am identifying the safest path forward',
      'I am structuring the execution order',
      'I am preparing a clear workflow',
      'I am breaking this into manageable pieces',
      'I am planning the shortest safe route',
      'I am defining the first milestones',
      'I am sequencing the work to avoid regressions',
      'I am prioritizing what to tackle first',
    ],
    actions: [
      'into clear milestones',
      'with practical checkpoints',
      'with visible progress points',
      'with low-risk ordering',
      'with explicit deliverables',
      'with rollback-safe decisions',
      'with test-first verification points',
      'with dependency awareness',
      'with failure recovery in mind',
      'with user-visible updates',
    ],
    intents: [
      'so you can see exactly what happens next.',
      'so we keep momentum without losing control.',
      'so each step has a clear purpose.',
      'so the next action is predictable and safe.',
      'so we avoid hidden changes.',
      'so the plan stays easy to follow.',
    ],
  },
  {
    phase: 'action',
    title: 'Action Phase',
    starts: [
      'I am executing the current step',
      'I am applying the planned change',
      'I am running the next action',
      'I am implementing the active task',
      'I am carrying out the coded update',
      'I am moving through the implementation',
      'I am completing this build action',
      'I am handling the active operation',
      'I am advancing the workstream',
      'I am processing the live task',
      'I am applying the selected fix',
      'I am progressing through the execution phase',
      'I am shipping this incremental change',
      'I am running the step in sequence',
      'I am operating on the current scope',
    ],
    actions: [
      'while preserving existing behavior',
      'and tracking each output in real time',
      'with runtime safety checks enabled',
      'while keeping the timeline updated',
      'and capturing intermediate results',
      'with guardrails around risky operations',
      'while minimizing unnecessary edits',
      'and validating assumptions as I go',
      'with clear change boundaries',
      'while keeping your workspace stable',
    ],
    intents: [
      'you will see the next visible result shortly.',
      'I will report the next checkpoint as soon as it lands.',
      'I will keep this step transparent and traceable.',
      'I will surface any blocker immediately.',
      'I will continue with the next safe action after this.',
      'I will post the outcome before moving forward.',
    ],
  },
  {
    phase: 'verification',
    title: 'Verification Phase',
    starts: [
      'I am validating the latest output',
      'I am checking the recent result',
      'I am verifying this step before continuing',
      'I am testing the current change set',
      'I am reviewing command outcomes',
      'I am confirming the implementation result',
      'I am inspecting the latest artifacts',
      'I am validating the active fix',
      'I am cross-checking expected behavior',
      'I am running sanity checks on this update',
      'I am ensuring this output is reliable',
      'I am confirming nothing regressed',
      'I am reviewing this checkpoint for accuracy',
      'I am checking that the result matches the goal',
      'I am confirming readiness for the next step',
    ],
    actions: [
      'against expected behavior',
      'with strict pass/fail checks',
      'before unlocking the next action',
      'and confirming no silent failures',
      'with attention to edge cases',
      'and documenting the outcome',
      'using repeatable validation',
      'to ensure stable progression',
      'with reproducibility in mind',
      'so we only advance on success',
    ],
    intents: [
      'I will move forward only after this clears.',
      'I will share a clear pass/fail summary next.',
      'I will call out any issue before continuing.',
      'I will keep this verification concise and transparent.',
      'I will report what changed and why it is safe.',
      'I will proceed once this checkpoint is confirmed.',
    ],
  },
  {
    phase: 'next-step',
    title: 'Next-Step Phase',
    starts: [
      'I am preparing the next visible step',
      'I am queuing the next action',
      'I am setting up the follow-up task',
      'I am lining up the next execution unit',
      'I am transitioning to the next checkpoint',
      'I am moving to the next planned milestone',
      'I am readying the following change',
      'I am arranging the next operation',
      'I am staging the next incremental update',
      'I am positioning the next action safely',
      'I am building the bridge to the next phase',
      'I am preparing the handoff to the next task',
      'I am setting up the next practical move',
      'I am organizing the immediate next activity',
      'I am mapping the next checkpoint in sequence',
    ],
    actions: [
      'from the current results',
      'based on the latest verification',
      'with clear success criteria',
      'while keeping the timeline readable',
      'without losing execution context',
      'with dependencies already accounted for',
      'with rollback awareness',
      'with priority on user impact',
      'using the current state as baseline',
      'with minimal disruption',
    ],
    intents: [
      'I will start it immediately after this update.',
      'I will confirm when the next step begins.',
      'I will keep the transition explicit and clear.',
      'I will post the next status as soon as it starts.',
      'I will continue with the safest available move.',
      'I will maintain continuity and report progress.',
    ],
  },
  {
    phase: 'recovery',
    title: 'Recovery Phase',
    starts: [
      'I am recovering from an interruption',
      'I am correcting a failed attempt',
      'I am applying the fallback path',
      'I am stabilizing the run after an error',
      'I am repairing the execution flow',
      'I am handling a temporary blocker',
      'I am retrying with safer settings',
      'I am resolving the detected failure',
      'I am restoring a stable path forward',
      'I am containing the issue before continuing',
      'I am switching to a safer recovery strategy',
      'I am re-establishing progress after the fault',
      'I am troubleshooting the failed step',
      'I am moving through the recovery sequence',
      'I am remediating the current execution issue',
    ],
    actions: [
      'without dropping your context',
      'with explicit retry controls',
      'while preserving completed work',
      'with diagnostics captured',
      'and protective backoff enabled',
      'with clear guardrails applied',
      'while avoiding repeat failures',
      'and preparing a stable continuation',
      'with safety-first decision rules',
      'and full visibility in the timeline',
    ],
    intents: [
      'I will continue once stability is restored.',
      'I will report the recovery outcome next.',
      'I will stop and surface details if this repeats.',
      'I will keep recovery transparent and controlled.',
      'I will confirm when normal execution resumes.',
      'I will proceed with the safest validated option.',
    ],
  },
];

/**
 * @param {string[]} starts
 * @param {string[]} actions
 * @param {string[]} intents
 * @param {number} count
 */
function createMessageSet(starts, actions, intents, count) {
  const messages = [];
  const used = new Set();

  for (const start of starts) {
    for (const action of actions) {
      for (const intent of intents) {
        const sentence = `${start} ${action}; ${intent}`;

        if (!used.has(sentence)) {
          used.add(sentence);
          messages.push(sentence);
        }

        if (messages.length === count) {
          return messages;
        }
      }
    }
  }

  throw new Error(`Unable to generate ${count} unique messages.`);
}

const poolByPhase = {};
const markdownSections = [];
let globalIndex = 1;

for (const config of phaseConfigs) {
  const messages = createMessageSet(config.starts, config.actions, config.intents, phaseSize);
  poolByPhase[config.phase] = messages;

  const lines = [];
  lines.push(`## ${config.title} (${config.phase})`);
  lines.push('');

  for (const message of messages) {
    const id = `${config.phase}-${String(globalIndex).padStart(3, '0')}`;
    lines.push(`${globalIndex}. [${id}] ${message}`);
    globalIndex += 1;
  }

  lines.push('');
  markdownSections.push(lines.join('\n'));
}

const totalMessages = Object.values(poolByPhase).reduce((acc, items) => acc + items.length, 0);

if (totalMessages !== 300) {
  throw new Error(`Expected 300 messages, generated ${totalMessages}.`);
}

const markdown = [
  '# Commentary Message Pool (v1.0.4 Seed)',
  '',
  'This pool contains 300 human-readable commentary messages used by bolt.gives to keep users updated even when model-generated commentary is sparse or inconsistent.',
  '',
  '- Total messages: 300',
  '- Messages per phase: 60',
  '- Phases: `plan`, `action`, `verification`, `next-step`, `recovery`',
  '',
  ...markdownSections,
].join('\n');

const tsObject = JSON.stringify(poolByPhase, null, 2);

const tsFile = `import type { AgentCommentaryPhase } from '~/types/context';

export const COMMENTARY_POOL_BY_PHASE: Record<AgentCommentaryPhase, readonly string[]> = ${tsObject} as const;

export const COMMENTARY_POOL_SIZE = ${totalMessages};

export function getCommentaryPoolMessage(phase: AgentCommentaryPhase, seed: number, fallback: string): string {
  const pool = COMMENTARY_POOL_BY_PHASE[phase];

  if (!pool || pool.length === 0) {
    return fallback;
  }

  if (!Number.isFinite(seed)) {
    return pool[0] || fallback;
  }

  const normalizedSeed = Math.abs(Math.trunc(seed));
  const index = normalizedSeed % pool.length;

  return pool[index] || fallback;
}
`;

await fs.writeFile(outputMarkdownPath, markdown, 'utf8');
await fs.writeFile(outputTsPath, tsFile, 'utf8');

const prettierResult = spawnSync('pnpm', ['exec', 'prettier', outputTsPath, '--write'], {
  cwd: rootDir,
  stdio: 'inherit',
});

if (prettierResult.status !== 0) {
  throw new Error('Failed to format generated TypeScript commentary pool file.');
}

console.log(`Generated ${totalMessages} commentary messages.`);
console.log(`- ${path.relative(rootDir, outputMarkdownPath)}`);
console.log(`- ${path.relative(rootDir, outputTsPath)}`);
