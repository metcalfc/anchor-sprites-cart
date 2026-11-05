// The heal service, without the wiring: what to do with each event. server.mjs
// passes in the real `startAgent` (Claude Code in a worktree) and `askForSignIn`
// (a GitHub issue).
//
//   POST /anchor  Anchor's webhook: task.failed and task.healed, signed
//   POST /report  the API on the Fly Machine: "my refresh failed"
//   GET  /        what it has done lately
//
// A failure waits `graceMs` for Anchor's self-heal. A heal cancels the wait. A
// contract failure does not wait: Anchor thought the run went fine, so no heal
// is coming. Nor does drift (a run Anchor's AI fallback rescued): nothing
// failed, so Anchor will not heal it. Sign-in failures go to a person, never to
// the agent.

import { timingSafeEqual } from 'node:crypto';
import express from 'express';
import { verifyAnchorSignature } from './signature.mjs';

export function createHealApp({
  taskId,
  startAgent,
  askForSignIn,
  graceMs = 180_000,
  webhookSecrets = [],
  healToken,
  log = console,
}) {
  const history = []; // newest first, for GET /
  const seen = new Set(); // Anchor delivers at least once
  const waiting = new Map(); // taskId -> timer, failures waiting for a heal
  let running;
  let queued;

  const note = (entry) => {
    history.unshift({ at: new Date().toISOString(), ...entry });
    history.length = Math.min(history.length, 50);
    log.log(`${entry.what}: ${entry.detail ?? ''}`);
  };

  const ourTask = (id) => !id || id === taskId();

  // One agent at a time. If something else breaks meanwhile, the newest event
  // goes next; older ones are covered by it.
  function enqueue(event) {
    if (running) {
      queued = event;
      return note({ what: 'queued', detail: event.kind });
    }
    note({ what: 'agent started', detail: event.kind });
    running = Promise.resolve()
      .then(() => startAgent(event))
      .then((detail) => note({ what: 'agent finished', detail }))
      .catch((error) => note({ what: 'agent crashed', detail: error.message }))
      .finally(() => {
        running = undefined;
        if (queued) {
          const next = queued;
          queued = undefined;
          enqueue(next);
        }
      });
  }

  function failed(id, details, { wait }) {
    if (!wait) return enqueue({ kind: 'failed', details });
    if (waiting.has(id)) return;
    note({ what: 'waiting for self-heal', detail: `${graceMs / 1000}s` });
    waiting.set(
      id,
      setTimeout(() => {
        waiting.delete(id);
        enqueue({ kind: 'failed', details });
      }, graceMs),
    );
  }

  function healed(id, details) {
    clearTimeout(waiting.get(id));
    waiting.delete(id);
    enqueue({ kind: 'healed', details });
  }

  function signedOut(detail) {
    note({ what: 'needs a person', detail: `signed out (${detail}). Run \`npm run connect\`.` });
    return Promise.resolve()
      .then(() => askForSignIn(detail))
      .catch((error) => log.error(`could not ask for a sign-in: ${error.message}`));
  }

  const app = express();
  app.disable('x-powered-by');

  app.get('/', (req, res) =>
    res.json({ running: Boolean(running), queued: queued?.kind, waiting: [...waiting.keys()], history }),
  );
  app.get('/healthz', (req, res) => res.type('text').send('ok'));

  app.post('/anchor', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
    const ok = verifyAnchorSignature({
      header: req.get('anchor-signature'),
      rawBody: req.body,
      secrets: webhookSecrets,
    });
    if (!ok) return res.status(401).send('bad signature');
    let event;
    try {
      event = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('not json');
    }
    res.sendStatus(200);
    if (seen.has(event.id)) return;
    seen.add(event.id);

    const data = event.data ?? {};
    if (!ourTask(data.task_id)) return;
    if (event.type === 'task.healed') {
      return healed(data.task_id, {
        source: 'anchor',
        task_id: data.task_id,
        healed_task_version_id: data.healed_task_version_id,
        run_id: data.run_id,
        error_explanation: data.error_explanation,
        fix_suggestion: data.fix_suggestion,
        confidence_score: data.confidence_score,
      });
    }
    if (event.type === 'task.failed') {
      if (data.error?.type === 'invalid_credentials') return signedOut(data.error.message);
      return failed(
        data.task_id,
        {
          source: 'anchor',
          task_id: data.task_id,
          run_id: data.run_id,
          session_id: data.session_id,
          error: data.error,
          session_dashboard_url: data.session_dashboard_url,
          recording_url: data.recording_url,
        },
        { wait: true },
      );
    }
  });

  app.post('/report', express.json(), (req, res) => {
    const given = Buffer.from(req.get('authorization')?.replace(/^Bearer /, '') ?? '');
    const expected = Buffer.from(healToken ?? '');
    if (!expected.length || given.length !== expected.length || !timingSafeEqual(given, expected)) {
      return res.status(401).send('unauthorized');
    }
    res.sendStatus(202);
    const report = req.body ?? {};
    if (!ourTask(report.taskId)) return;
    if (/signed out/i.test(report.message ?? '')) return signedOut(report.message);
    if (report.kind === 'drift') return enqueue({ kind: 'drift', details: report });
    failed(report.taskId, report, { wait: report.kind !== 'contract' });
  });

  return { app, history, idle: () => running ?? Promise.resolve() };
}
