import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ContractError } from '../integration/invoices.mjs';
import { TaskRunError } from '../integration/task.mjs';
import { createApi, failureReport } from './app.js';

const quiet = { log() {}, error() {} };
const INVOICE = { number: 'HS-10480', issued: '2026-11-02', due: '2026-12-02', description: 'x', amount: '1.00', currency: 'USD', status: 'open' };

async function serve(options) {
  const api = createApi({ log: quiet, ...options });
  const server = api.app.listen(0);
  const base = `http://localhost:${server.address().port}`;
  const call = (path, { method = 'GET', token } = {}) =>
    fetch(`${base}${path}`, { method, headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { ...api, call, close: () => server.close() };
}

test('the first GET runs the task; later GETs answer from memory', async () => {
  let runs = 0;
  const api = await serve({ run: async () => (runs++, { invoices: [INVOICE], run: { run_id: 'r1' }, ms: 5 }) });
  try {
    const first = await (await api.call('/invoices')).json();
    assert.deepEqual(first.invoices, [INVOICE]);
    assert.equal(first.stale, false);
    await api.call('/invoices');
    assert.equal(runs, 1);
  } finally {
    api.close();
  }
});

test('a failed refresh keeps the last good result, marks it stale, and reports once', async () => {
  const reports = [];
  let fail = false;
  const api = await serve({
    run: async () => {
      if (fail) throw new TaskRunError({ status: 'failure', error: 'no table', run_id: 'r2', session_id: 's2' });
      return { invoices: [INVOICE], run: { run_id: 'r1' }, ms: 5 };
    },
    report: async (r) => reports.push(r),
    taskId: () => 'task-1',
  });
  try {
    await api.call('/invoices');
    fail = true;
    const refresh = await api.call('/invoices/refresh', { method: 'POST' });
    assert.equal(refresh.status, 502);
    assert.equal((await refresh.json()).error.runId, 'r2');

    const stale = await (await api.call('/invoices')).json();
    assert.equal(stale.stale, true);
    assert.deepEqual(stale.invoices, [INVOICE]);
    assert.equal(stale.lastError.message, 'no table');

    assert.equal(reports.length, 1);
    assert.deepEqual(
      { kind: reports[0].kind, taskId: reports[0].taskId, runId: reports[0].runId, sessionId: reports[0].sessionId },
      { kind: 'task', taskId: 'task-1', runId: 'r2', sessionId: 's2' },
    );

    fail = false;
    await api.call('/invoices/refresh', { method: 'POST' });
    assert.equal((await (await api.call('/invoices')).json()).stale, false);
  } finally {
    api.close();
  }
});

test('with no good result yet, GET says 502', async () => {
  const api = await serve({ run: async () => { throw new Error('boom'); } });
  try {
    assert.equal((await api.call('/invoices')).status, 502);
  } finally {
    api.close();
  }
});

test('refreshes that overlap share one run', async () => {
  let runs = 0;
  let release;
  const gate = new Promise((r) => (release = r));
  const api = await serve({ run: async () => (runs++, await gate, { invoices: [INVOICE], ms: 1 }) });
  try {
    const calls = [api.call('/invoices'), api.call('/invoices'), api.call('/invoices/refresh', { method: 'POST' })];
    await new Promise((r) => setTimeout(r, 50));
    release();
    const statuses = (await Promise.all(calls)).map((r) => r.status);
    assert.deepEqual(statuses, [200, 200, 200]);
    assert.equal(runs, 1);
  } finally {
    api.close();
  }
});

test('API_TOKEN is enforced when set', async () => {
  const api = await serve({ run: async () => ({ invoices: [INVOICE], ms: 1 }), token: 'sekrit' });
  try {
    assert.equal((await api.call('/invoices')).status, 401);
    assert.equal((await api.call('/invoices', { token: 'wrong!' })).status, 401);
    assert.equal((await api.call('/invoices', { token: 'sekrit' })).status, 200);
    assert.equal((await api.call('/healthz')).status, 200);
  } finally {
    api.close();
  }
});

test('a failure that cannot be reported does not break the API', async () => {
  const api = await serve({ run: async () => { throw new Error('boom'); }, report: async () => { throw new Error('sprite down'); } });
  try {
    assert.equal((await api.call('/invoices/refresh', { method: 'POST' })).status, 502);
  } finally {
    api.close();
  }
});

test('drift is served, flagged, and reported once until a clean run clears it', async () => {
  const reports = [];
  let fallback = true;
  const api = await serve({
    run: async () => ({ invoices: [INVOICE], run: { run_id: `r${reports.length}` }, fallback, ms: 25_000 }),
    report: async (r) => reports.push(r),
    taskId: () => 'task-1',
  });
  try {
    const first = await (await api.call('/invoices')).json();
    assert.deepEqual(first.invoices, [INVOICE]);
    assert.equal(first.stale, false);
    assert.ok(first.drift);
    await api.call('/invoices/refresh', { method: 'POST' });
    await api.call('/invoices/refresh', { method: 'POST' });
    assert.deepEqual(reports.map((r) => [r.kind, r.taskId]), [['drift', 'task-1']]);

    fallback = false;
    await api.call('/invoices/refresh', { method: 'POST' });
    assert.equal((await (await api.call('/invoices')).json()).drift, undefined);

    fallback = true;
    await api.call('/invoices/refresh', { method: 'POST' });
    assert.equal(reports.length, 2);
  } finally {
    api.close();
  }
});

test('reports say what kind of failure it was', () => {
  assert.equal(failureReport(new ContractError('bad date'), 't').kind, 'contract');
  assert.equal(failureReport(new TaskRunError({ status: 'failure' }), 't').kind, 'task');
  assert.equal(failureReport(new Error('network'), 't').kind, 'other');
});
