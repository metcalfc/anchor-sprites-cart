import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { createHealApp } from './app.mjs';

const SECRET = 'whsec';
const TOKEN = 'heal-token';
const GRACE = 80;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const quiet = { log() {}, error() {} };

async function serve(overrides = {}) {
  const agents = [];
  const asks = [];
  const heal = createHealApp({
    taskId: () => 'task-1',
    startAgent: async (event) => {
      agents.push(event);
      if (overrides.slowAgent) await overrides.slowAgent;
      return 'done';
    },
    askForSignIn: async (detail) => asks.push(detail),
    graceMs: overrides.graceMs ?? GRACE,
    webhookSecrets: [SECRET],
    healToken: TOKEN,
    log: quiet,
  });
  const server = heal.app.listen(0);
  const base = `http://localhost:${server.address().port}`;
  const anchor = (event, { secret = SECRET, t = Math.floor(Date.now() / 1000) } = {}) => {
    const body = JSON.stringify(event);
    const sig = createHmac('sha256', secret).update(`v0:${t}:${body}`).digest('hex');
    return fetch(`${base}/anchor`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'anchor-signature': `t=${t},v1=${sig}` },
      body,
    });
  };
  const report = (body, token = TOKEN) =>
    fetch(`${base}/report`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  return { ...heal, agents, asks, anchor, report, close: () => server.close() };
}

const failedEvent = (id, extra = {}) => ({
  id,
  type: 'task.failed',
  data: { task_id: 'task-1', run_id: 'r1', session_id: 's1', error: { type: 'automation_failure', message: 'no table' }, ...extra },
});
const healedEvent = (id) => ({
  id,
  type: 'task.healed',
  data: { task_id: 'task-1', healed_task_version_id: 'tv2', error_explanation: 'moved', fix_suggestion: 'use Documents', confidence_score: 0.8 },
});

test('a failure waits for self-heal, and a heal in time cancels the re-explore', async () => {
  // A long grace here, so the heal lands inside it however busy the machine is.
  const graceMs = 1500;
  const h = await serve({ graceMs });
  try {
    assert.equal((await h.anchor(failedEvent('evt_1'))).status, 200);
    await sleep(50);
    assert.equal(h.agents.length, 0);
    await h.anchor(healedEvent('evt_2'));
    await sleep(graceMs + 200);
    await h.idle();
    assert.deepEqual(h.agents.map((e) => e.kind), ['healed']);
    assert.equal(h.agents[0].details.fix_suggestion, 'use Documents');
  } finally {
    h.close();
  }
});

test('with no heal in the grace period, the agent re-explores', async () => {
  const h = await serve();
  try {
    await h.anchor(failedEvent('evt_1'));
    await sleep(GRACE * 2);
    await h.idle();
    assert.deepEqual(h.agents.map((e) => e.kind), ['failed']);
    assert.equal(h.agents[0].details.run_id, 'r1');
  } finally {
    h.close();
  }
});

test('the Machine and Anchor reporting the same failure start one agent', async () => {
  const h = await serve();
  try {
    await h.anchor(failedEvent('evt_1'));
    await h.report({ kind: 'task', taskId: 'task-1', message: 'no table' });
    await sleep(GRACE * 2);
    await h.idle();
    assert.equal(h.agents.length, 1);
  } finally {
    h.close();
  }
});

test('a contract failure goes straight to the agent', async () => {
  const h = await serve();
  try {
    assert.equal((await h.report({ kind: 'contract', taskId: 'task-1', message: 'issued must be YYYY-MM-DD' })).status, 202);
    await sleep(10);
    await h.idle();
    assert.deepEqual(h.agents.map((e) => e.kind), ['failed']);
  } finally {
    h.close();
  }
});

test('drift goes straight to the agent, as drift', async () => {
  const h = await serve();
  try {
    await h.report({ kind: 'drift', taskId: 'task-1', runId: 'r9', message: 'needed the AI fallback' });
    await sleep(10);
    await h.idle();
    assert.deepEqual(h.agents.map((e) => e.kind), ['drift']);
    assert.equal(h.agents[0].details.runId, 'r9');
  } finally {
    h.close();
  }
});

test('duplicate deliveries are ignored', async () => {
  const h = await serve();
  try {
    await h.anchor(healedEvent('evt_9'));
    await h.anchor(healedEvent('evt_9'));
    await sleep(10);
    await h.idle();
    assert.equal(h.agents.length, 1);
  } finally {
    h.close();
  }
});

test('sign-in failures go to a person, never to the agent', async () => {
  const h = await serve();
  try {
    await h.anchor(failedEvent('evt_1', { error: { type: 'invalid_credentials', message: 'login page' } }));
    await h.report({ kind: 'task', taskId: 'task-1', message: 'signed out' });
    await sleep(GRACE * 2);
    assert.equal(h.agents.length, 0);
    assert.deepEqual(h.asks, ['login page', 'signed out']);
  } finally {
    h.close();
  }
});

test('events for other tasks are ignored', async () => {
  const h = await serve();
  try {
    await h.anchor({ ...healedEvent('evt_1'), data: { task_id: 'someone-elses' } });
    await h.report({ kind: 'contract', taskId: 'someone-elses', message: 'x' });
    await sleep(10);
    assert.equal(h.agents.length, 0);
  } finally {
    h.close();
  }
});

test('unsigned, mis-signed, stale and unauthorised requests are refused', async () => {
  const h = await serve();
  try {
    assert.equal((await h.anchor(healedEvent('evt_1'), { secret: 'wrong' })).status, 401);
    assert.equal((await h.anchor(healedEvent('evt_1'), { t: Math.floor(Date.now() / 1000) - 600 })).status, 401);
    assert.equal((await h.report({ kind: 'contract', taskId: 'task-1' }, 'nope')).status, 401);
    await sleep(10);
    assert.equal(h.agents.length, 0);
  } finally {
    h.close();
  }
});

test('one agent at a time; what breaks meanwhile goes next', async () => {
  let release;
  const slowAgent = new Promise((r) => (release = r));
  const h = await serve({ slowAgent });
  try {
    await h.report({ kind: 'contract', taskId: 'task-1', message: 'a' });
    await sleep(10);
    await h.anchor(healedEvent('evt_2'));
    await sleep(10);
    assert.equal(h.agents.length, 1);
    release();
    await sleep(20);
    await h.idle();
    assert.deepEqual(h.agents.map((e) => e.kind), ['failed', 'healed']);
  } finally {
    h.close();
  }
});
