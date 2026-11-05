// Publishes the draft in tasks/invoices.workflow.json, so the API runs it.
//
//   npm run promote
//
// Runs on merge (see .github/workflows/promote.yml): merging the heal PR is
// what puts the healed flow into production.

import { anchor } from './anchor.mjs';
import { WORKFLOW_FILE, loadSpec, requireTask, saveSpec, writeWorkflow } from './task.mjs';
import { readFileSync } from 'node:fs';

const spec = loadSpec();
const taskId = requireTask(spec);
const mirror = JSON.parse(readFileSync(WORKFLOW_FILE, 'utf8'));
if (!mirror.isDraft) {
  console.log(`Nothing to promote: ${WORKFLOW_FILE} is published version ${mirror.version}.`);
  process.exit(0);
}

const { TasksLegacy } = anchor();
const code = Buffer.from(JSON.stringify(mirror.workflow)).toString('base64');
await TasksLegacy.deployTask({
  path: { taskId },
  body: { code, description: `Promoted from draft ${mirror.version}` },
});
const published = await TasksLegacy.getLatestTaskVersion({ path: { taskId } });
writeWorkflow(published);
saveSpec({ ...spec, version: published.version });
console.log(`promoted: task ${taskId} is now version ${published.version}`);
