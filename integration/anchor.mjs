import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Sessions, Tasks, TasksLegacy, client, createBrowser } from 'anchorbrowser';
import { chromium } from 'playwright-core';

// Everything here goes through the anchorbrowser SDK. Nothing is installed on
// this machine: the browser is a session at Anchor, signed in through a saved
// profile, and the Hangar Supply password never comes near it.

// Short timeouts so a crashed run cannot leave a session billing.
const TIMEOUT = { max_duration: 10, idle_timeout: 2 };

let configured = false;
export function anchor() {
  if (!process.env.ANCHOR_API_KEY) throw new Error('Set ANCHOR_API_KEY.');
  if (!configured) {
    client.setConfig({ auth: () => process.env.ANCHOR_API_KEY });
    configured = true;
  }
  return { Sessions, Tasks, TasksLegacy };
}

// Starts a session signed in as `profile`. `persist` saves the profile when the
// session ends, which is what `connect` wants and nothing else does.
export async function startSession({ profile, persist = false, recording = true }) {
  const { Sessions } = anchor();
  const created = await Sessions.createSession({
    body: {
      session: { timeout: TIMEOUT, recording: { active: recording } },
      browser: { profile: { name: profile, persist } },
    },
  });
  const { id, live_view_url: liveViewUrl } = created.data;
  return { id, liveViewUrl, stop: () => Sessions.deleteSession({ path: { session_id: id } }) };
}

// Opens a Playwright page in a session signed in as `profile`.
//
// BROWSER_MODE=local uses a local Chrome with a profile directory instead, for
// working on the site without spending Anchor credits. Tasks still run at Anchor.
export async function openBrowser({ profile, persist = false, headed = false }) {
  if (process.env.BROWSER_MODE === 'local') {
    const dir = join('data', 'local-profiles', profile);
    mkdirSync(dir, { recursive: true });
    const context = await chromium.launchPersistentContext(dir, { channel: 'chrome', headless: !headed });
    const page = context.pages()[0] ?? (await context.newPage());
    return { page, sessionId: undefined, liveViewUrl: undefined, close: () => context.close() };
  }

  const { Sessions } = anchor();
  const { browser, session } = await createBrowser({
    sessionOptions: {
      session: { timeout: TIMEOUT, recording: { active: true } },
      browser: { profile: { name: profile, persist } },
    },
  });
  const { id, live_view_url: liveViewUrl } = session.data;
  const page = browser.contexts()[0]?.pages()[0] ?? (await browser.newPage());
  return {
    page,
    sessionId: id,
    liveViewUrl,
    // Ending the session is what saves a persisted profile.
    close: async () => {
      await browser.close().catch(() => {});
      await Sessions.deleteSession({ path: { session_id: id } });
    },
  };
}
