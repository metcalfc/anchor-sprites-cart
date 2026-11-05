// Compiles tasks/invoices.json into an Anchor task: explore once, then
// deterministic code from then on.
//
//   npm run compile
//   npm run compile -- --from <session id>   # learn from a session you drove, e.g. a `look`
//
// Each compile makes a new task and points the spec at it. The task's code is
// mirrored into tasks/invoices.workflow.json.

import { parseArgs } from 'node:util';
import { anchor } from './anchor.mjs';
import { profile } from './config.mjs';
import { SPEC_FILE, WORKFLOW_FILE, loadSpec, saveSpec, writeWorkflow } from './task.mjs';

const POLL_MS = 5000;
const WAIT_MS = 10 * 60 * 1000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const { values } = parseArgs({ options: { from: { type: 'string' } } });
const spec = loadSpec();
const { Tasks, TasksLegacy } = anchor();
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

const started = await Tasks.generateTask({
  body: {
    taskName: `${spec.name}-${stamp}`,
    taskPrompt: spec.prompt,
    description: spec.description,
    input_schema: spec.input_schema,
    output_schema: spec.output_schema,
    async: true,
    ...(values.from && { browser_session_id: values.from }),
    // Runs and generation both start signed in, from the saved profile.
    task_browser_default_configuration: { browser: { profile: { name: profile } } },
  },
});
const taskId = started.taskId ?? started.id;
console.log(`compiling ${SPEC_FILE} into task ${taskId}`);

let status;
const deadline = Date.now() + WAIT_MS;
let last;
do {
  await sleep(POLL_MS);
  status = await Tasks.getTaskGenerationStatus({ path: { taskId: started.id } });
  if (status.status !== last) console.log(`  ${status.status}${status.project_state ? ` (${status.project_state})` : ''}`);
  last = status.status;
} while (['generating', 'waiting-for-session'].includes(status.status) && Date.now() < deadline);

if (status.status !== 'ready') {
  console.error(`compile failed: ${status.error ?? status.status}`);
  process.exit(1);
}

const version = await TasksLegacy.getLatestTaskVersion({ path: { taskId } });
const mirror = writeWorkflow(version);
saveSpec({ ...spec, taskId, version: version.version });

console.log(`\ncompiled: task ${taskId}, version ${version.version}`);
for (const segment of mirror.workflow.segments) console.log(`  ${segment.name}: ${segment.prompt}`);
console.log(`\ncode: ${WORKFLOW_FILE}\nNow run: npm run call`);
