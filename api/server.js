// Hangar Supply, as an API. Runs on a Fly Machine.
//
// A refresh runs the compiled task at Anchor: deterministic Playwright steps in
// a browser signed in through the profile, with no model in the loop unless
// the page has changed. It refreshes on a timer, so GET never waits for it.
//
// When a refresh fails, the Machine tells the Sprite (HEAL_URL), which wakes up
// and works out what changed. Anchor tells it too, through its own webhook.

import { profile, siteUrl } from '../integration/config.mjs';
import { loadSpec, runInvoices } from '../integration/task.mjs';
import { createApi } from './app.js';

const port = Number(process.env.PORT ?? 8080);
const REFRESH_MS = Number(process.env.REFRESH_MINUTES ?? 30) * 60 * 1000;

async function report(failure) {
  if (!process.env.HEAL_URL) return;
  const res = await fetch(`${process.env.HEAL_URL.replace(/\/+$/, '')}/report`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.HEAL_TOKEN}` },
    body: JSON.stringify(failure),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`the Sprite answered ${res.status}`);
}

const { app, refresh } = createApi({
  run: () => runInvoices({ siteUrl, profile }),
  report,
  taskId: () => loadSpec().taskId,
  token: process.env.API_TOKEN,
});

app.listen(port, () => {
  console.log(`invoices api listening on :${port}`);
  if (!siteUrl) console.error('SITE_URL is not set');
  setInterval(refresh, REFRESH_MS).unref();
});
