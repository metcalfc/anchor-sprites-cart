// The invoices API, without the wiring: `run` gets invoices (or throws) and
// `report` tells the Sprite about a failure. server.js passes the real ones.
//
//   GET  /invoices          the last good result, from memory: milliseconds
//   POST /invoices/refresh  run the task now and return what it got
//
// A run that needed Anchor's AI fallback still returns good data, so it is
// served. But the portal has drifted from the compiled code, so it is
// reported to the Sprite once, as `drift`, until a clean run clears it.

import { timingSafeEqual } from 'node:crypto';
import express from 'express';
import { ContractError } from '../integration/invoices.mjs';
import { TaskRunError } from '../integration/task.mjs';

const sameSecret = (given, expected) => {
  const a = Buffer.from(String(given ?? ''));
  const b = Buffer.from(String(expected));
  return a.length === b.length && timingSafeEqual(a, b);
};

export function failureReport(error, taskId, now = new Date()) {
  return {
    source: 'api',
    kind: error instanceof ContractError ? 'contract' : error instanceof TaskRunError ? 'task' : 'other',
    message: error.message,
    taskId,
    runId: error.run?.run_id,
    sessionId: error.run?.session_id,
    at: now.toISOString(),
  };
}

export function driftReport(taskRun, taskId, now = new Date()) {
  return {
    source: 'api',
    kind: 'drift',
    message: 'The run needed the AI fallback: the compiled steps no longer match the portal.',
    taskId,
    runId: taskRun?.run_id,
    sessionId: taskRun?.session_id,
    at: now.toISOString(),
  };
}

export function createApi({ run, report = async () => {}, taskId = () => undefined, token, log = console }) {
  const state = { invoices: undefined, fetchedAt: undefined, lastError: undefined, drift: undefined, refreshing: undefined };

  const send = (body) =>
    Promise.resolve()
      .then(() => report(body))
      .catch((e) => log.error(`could not report to the Sprite: ${e.message}`));

  // API_TOKEN is optional for a demo, and should be set for anything real.
  const requireToken = (req, res, next) => {
    if (!token || sameSecret(req.get('authorization')?.replace(/^Bearer /, ''), token)) return next();
    res.status(401).json({ error: 'unauthorized' });
  };

  // One refresh at a time. Callers that arrive mid-refresh share it.
  function refresh() {
    state.refreshing ??= Promise.resolve()
      .then(run)
      .then(async ({ invoices, run: taskRun, fallback, ms }) => {
        Object.assign(state, { invoices, fetchedAt: new Date().toISOString(), lastError: undefined });
        log.log(`refreshed: ${invoices.length} invoices in ${ms}ms (run ${taskRun?.run_id})${fallback ? ', with AI fallback' : ''}`);
        if (!fallback) {
          state.drift = undefined;
        } else if (!state.drift) {
          state.drift = { runId: taskRun?.run_id, at: new Date().toISOString() };
          await send(driftReport(taskRun, taskId()));
        }
        return { ok: true };
      })
      .catch(async (error) => {
        state.lastError = { message: error.message, runId: error.run?.run_id, at: new Date().toISOString() };
        log.error(`refresh failed: ${error.message}`);
        await send(failureReport(error, taskId()));
        return { ok: false, error };
      })
      .finally(() => {
        state.refreshing = undefined;
      });
    return state.refreshing;
  }

  const app = express();
  app.disable('x-powered-by');

  app.get('/healthz', (req, res) => res.type('text').send('ok'));

  app.get('/invoices', requireToken, async (req, res) => {
    if (!state.invoices) await refresh();
    if (!state.invoices) return res.status(502).json({ error: state.lastError });
    res.json({
      fetchedAt: state.fetchedAt,
      stale: Boolean(state.lastError),
      ...(state.lastError && { lastError: state.lastError }),
      ...(state.drift && { drift: state.drift }),
      invoices: state.invoices,
    });
  });

  app.post('/invoices/refresh', requireToken, async (req, res) => {
    const result = await refresh();
    if (!result.ok) return res.status(502).json({ error: state.lastError });
    res.json({ fetchedAt: state.fetchedAt, ...(state.drift && { drift: state.drift }), invoices: state.invoices });
  });

  return { app, refresh, state };
}
