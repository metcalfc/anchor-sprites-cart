// Mirrors a task version's code into tasks/invoices.workflow.json.
//
//   npm run pull             # the published version
//   npm run pull -- --draft  # the draft, e.g. one Anchor's self-heal just made
//
// Then `git diff tasks/` shows exactly what changed.

import { parseArgs } from 'node:util';
import { anchor } from './anchor.mjs';
import { WORKFLOW_FILE, loadSpec, requireTask, writeWorkflow } from './task.mjs';

const { values } = parseArgs({ options: { draft: { type: 'boolean' } } });
const taskId = requireTask(loadSpec());
const { TasksLegacy } = anchor();

const version = values.draft
  ? await TasksLegacy.getTaskDraft({ path: { taskId } })
  : await TasksLegacy.getLatestTaskVersion({ path: { taskId } });
const mirror = writeWorkflow(version);
console.log(`pulled task ${taskId} version ${mirror.version}${mirror.isDraft ? ' (draft)' : ''} into ${WORKFLOW_FILE}`);
