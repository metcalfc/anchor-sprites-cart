// Runs the compiled task once and checks its output against the contract. This
// is the check that matters.
//
//   npm run call
//   npm run call -- --json
//
// It fails if the run needed Anchor's AI fallback: the data came back, but the
// compiled steps no longer match the portal. Exit code 3 for that.

import { parseArgs } from 'node:util';
import { profile, requireSiteUrl, siteUrl } from './config.mjs';
import { ContractError } from './invoices.mjs';
import { TaskRunError, runInvoices } from './task.mjs';

const { values } = parseArgs({ options: { json: { type: 'boolean' } } });
requireSiteUrl();

try {
  const { invoices, run, fallback, ms } = await runInvoices({ siteUrl, profile });
  if (values.json) {
    console.log(JSON.stringify(invoices, null, 2));
  } else {
    console.table(invoices.map(({ description, ...rest }) => rest));
    console.log(`${invoices.length} invoices in ${(ms / 1000).toFixed(1)}s (run ${run.run_id})`);
  }
  if (fallback) {
    console.error('call drifted: the run needed the AI fallback. The compiled steps no longer match the portal; recompile.');
    process.exit(3);
  }
  if (fallback === undefined) console.error('note: could not tell whether the run needed the AI fallback.');
} catch (error) {
  console.error(`call failed: ${error.message}`);
  if (error instanceof TaskRunError) {
    console.error(`  run:     ${error.run.run_id}`);
    console.error(`  session: ${error.run.session_id}  (the recording is in the Anchor dashboard)`);
  }
  if (error instanceof ContractError) {
    console.error('  The task ran, but its output broke the contract in integration/invoices.mjs.');
  }
  process.exit(1);
}
