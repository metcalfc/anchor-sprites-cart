// The compiled flow. The agent writes a spec (tasks/invoices.json), Anchor
// compiles it into a task of deterministic Playwright steps, and the code of
// that task is mirrored into tasks/invoices.workflow.json so it can be read,
// reviewed and diffed like any other code in this repo.

import { readFileSync, writeFileSync } from 'node:fs';
import { anchor, startSession } from './anchor.mjs';
import { parseInvoices } from './invoices.mjs';

export const SPEC_FILE = 'tasks/invoices.json';
export const WORKFLOW_FILE = 'tasks/invoices.workflow.json';

export const loadSpec = (file = SPEC_FILE) => JSON.parse(readFileSync(file, 'utf8'));
export const saveSpec = (spec, file = SPEC_FILE) =>
  writeFileSync(file, `${JSON.stringify(spec, null, 2)}\n`);

export function requireTask(spec) {
  if (!spec.taskId) throw new Error(`No task yet. Run \`npm run compile\` to compile ${SPEC_FILE}.`);
  return spec.taskId;
}

// A task version's code is base64 JSON: segments, each with the prompt it came
// from and the Playwright function that does it.
export function decodeWorkflow(version) {
  return JSON.parse(Buffer.from(version.code, 'base64').toString('utf8'));
}

export function writeWorkflow(version, file = WORKFLOW_FILE) {
  const mirror = {
    taskId: version.taskId,
    version: version.version,
    isDraft: version.isDraft,
    workflow: decodeWorkflow(version),
  };
  writeFileSync(file, `${JSON.stringify(mirror, null, 2)}\n`);
  return mirror;
}

export class TaskRunError extends Error {
  constructor(run) {
    super(run.error || `Task run ended with status ${run.status}`);
    this.name = 'TaskRunError';
    this.run = run;
  }
}

// Anchor tags a run "AI Fallback" when a compiled step no longer matched the
// page and a model finished the job. The data is fine; the page has drifted
// away from the code, and every run will be slow and use a model until the
// task is recompiled.
export const FALLBACK_TAG = 'AI Fallback';

// Was this run rescued by the AI fallback? undefined if Anchor would not say.
async function usedFallback(TasksLegacy, taskId, run) {
  try {
    const execution = await TasksLegacy.getTaskExecution({
      path: { taskId, executionId: run.execution_result_id ?? run.run_id },
    });
    return (execution.tags ?? []).includes(FALLBACK_TAG);
  } catch {
    return undefined;
  }
}

// Runs the task once, in a session signed in through the profile, and returns
// invoices that meet the contract, and whether the AI fallback was needed.
// Throws TaskRunError if Anchor could not run it, or ContractError if it ran
// and the output is wrong.
//
// `sdk` and `start` are the anchorbrowser SDK and startSession; tests pass fakes.
export async function runInvoices({ spec = loadSpec(), siteUrl, profile, sdk, start = startSession }) {
  const taskId = requireTask(spec);
  const { Tasks, TasksLegacy } = sdk ?? anchor();
  const started = Date.now();
  const session = await start({ profile });
  let run;
  try {
    run = await Tasks.runTask({
      path: { taskId },
      body: {
        input_params: { portal_url: siteUrl },
        session_id: session.id,
        cleanup_sessions: false,
        sync: true,
      },
    });
  } finally {
    await session.stop().catch(() => {});
  }
  if (run.status !== 'success') throw new TaskRunError({ ...run, session_id: run.session_id ?? session.id });
  const invoices = parseInvoices(run.result);
  const fallback = await usedFallback(TasksLegacy, taskId, run);
  return { invoices, run, fallback, ms: Date.now() - started };
}
