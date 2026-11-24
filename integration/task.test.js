import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ContractError } from './invoices.mjs';
import { TaskRunError, decodeWorkflow, loadSpec, runInvoices, writeWorkflow } from './task.mjs';

const INVOICE = { number: 'HS-10480', issued: '2026-11-02', due: '2026-12-02', description: 'x', amount: '1840.00', currency: 'USD', status: 'open' };
const spec = { ...loadSpec(), taskId: 'task-1' };

// A fake SDK and session starter that record what they were asked to do.
function fakes(runResult, { tags = [], executionError } = {}) {
  const calls = { runs: [], stopped: 0, started: [], executions: [] };
  const sdk = {
    TasksLegacy: {
      getTaskExecution: async (options) => {
        calls.executions.push(options);
        if (executionError) throw executionError;
        return { status: 'success', tags };
      },
    },
    Tasks: {
      runTask: async (options) => {
        calls.runs.push(options);
        if (runResult instanceof Error) throw runResult;
        return runResult;
      },
    },
  };
  const start = async (options) => {
    calls.started.push(options);
    return { id: 'sess-1', stop: async () => calls.stopped++ };
  };
  return { sdk, start, calls };
}

test('runs the task in a profile session, with the portal URL, and returns valid invoices', async () => {
  const { sdk, start, calls } = fakes({ run_id: 'r1', status: 'success', result: { invoices_json: JSON.stringify([INVOICE]) } });
  const { invoices, run, fallback } = await runInvoices({ spec, siteUrl: 'https://hs.example', profile: 'hangar', sdk, start });
  assert.deepEqual(invoices, [INVOICE]);
  assert.equal(run.run_id, 'r1');
  assert.equal(fallback, false);
  assert.deepEqual(calls.executions, [{ path: { taskId: 'task-1', executionId: 'r1' } }]);
  assert.deepEqual(calls.started, [{ profile: 'hangar' }]);
  assert.deepEqual(calls.runs[0], {
    path: { taskId: 'task-1' },
    body: { input_params: { portal_url: 'https://hs.example' }, session_id: 'sess-1', cleanup_sessions: false, sync: true },
  });
  assert.equal(calls.stopped, 1);
});

test('a run the AI fallback rescued is flagged, and its data still returned', async () => {
  const ok = { run_id: 'r4', execution_result_id: 'x4', status: 'success', result: { invoices_json: JSON.stringify([INVOICE]) } };
  const { sdk, start, calls } = fakes(ok, { tags: ['AI Fallback'] });
  const { invoices, fallback } = await runInvoices({ spec, siteUrl: 'u', profile: 'p', sdk, start });
  assert.deepEqual(invoices, [INVOICE]);
  assert.equal(fallback, true);
  assert.equal(calls.executions[0].path.executionId, 'x4');

  const unknown = fakes(ok, { executionError: new Error('404') });
  assert.equal((await runInvoices({ spec, siteUrl: 'u', profile: 'p', sdk: unknown.sdk, start: unknown.start })).fallback, undefined);
});

test('a failed run is a TaskRunError that keeps the run and session ids', async () => {
  const { sdk, start, calls } = fakes({ run_id: 'r2', status: 'failure', error: 'no table', result: {} });
  await assert.rejects(runInvoices({ spec, siteUrl: 'u', profile: 'p', sdk, start }), (error) => {
    assert.ok(error instanceof TaskRunError);
    assert.equal(error.message, 'no table');
    assert.equal(error.run.run_id, 'r2');
    assert.equal(error.run.session_id, 'sess-1');
    return true;
  });
  assert.equal(calls.stopped, 1);
});

test('a run that "succeeds" with the wrong output is a ContractError', async () => {
  const { sdk, start } = fakes({ run_id: 'r3', status: 'success', result: { invoices_json: JSON.stringify([{ ...INVOICE, issued: '2 Nov 2026' }]) } });
  await assert.rejects(runInvoices({ spec, siteUrl: 'u', profile: 'p', sdk, start }), ContractError);
});

test('the session is stopped even when the API call throws', async () => {
  const { sdk, start, calls } = fakes(new Error('network'));
  await assert.rejects(runInvoices({ spec, siteUrl: 'u', profile: 'p', sdk, start }), /network/);
  assert.equal(calls.stopped, 1);
});

test('no task yet says to compile', async () => {
  const { sdk, start } = fakes({});
  await assert.rejects(runInvoices({ spec: { ...spec, taskId: null }, siteUrl: 'u', profile: 'p', sdk, start }), /npm run compile/);
});

// The shape Anchor returned for a real task on 5 Nov 2026.
test('task code mirrors into the repo and encodes back to the same thing', () => {
  const workflow = {
    name: 'extract',
    segments: [{ name: 'nav', type: 'ui', prompt: 'Go', deterministic: 'async (page) => { await page.goto("x"); return {}; }', next: null }],
    startSegmentName: 'nav',
  };
  const code = Buffer.from(JSON.stringify(workflow, null, 2)).toString('base64');
  assert.deepEqual(decodeWorkflow({ code }), workflow);

  const file = join(mkdtempSync(join(tmpdir(), 'wf-')), 'w.json');
  writeWorkflow({ taskId: 't', version: '2', isDraft: true, code }, file);
  const mirror = JSON.parse(readFileSync(file, 'utf8'));
  assert.deepEqual(mirror, { taskId: 't', version: '2', isDraft: true, workflow });
  // promote.mjs sends this back to Anchor
  assert.deepEqual(decodeWorkflow({ code: Buffer.from(JSON.stringify(mirror.workflow)).toString('base64') }), workflow);
});

test('the checked-in spec matches the contract the API enforces', () => {
  const spec = loadSpec();
  assert.deepEqual(spec.input_schema.map((p) => p.name), ['portal_url']);
  assert.deepEqual(spec.output_schema.map((p) => p.name), ['invoices_json']);
  assert.match(spec.prompt, /\{\{portal_url\}\}/);
  for (const field of ['number', 'issued', 'due', 'description', 'amount', 'currency', 'status']) {
    assert.match(spec.prompt, new RegExp(`- ${field}:`));
  }
});
