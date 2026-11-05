// Signs the browser profile in to Hangar Supply, once.
//
//   npm run connect
//
// It prints a live view URL. Open it, sign in, and type the code from Hangar
// Mail. The password goes from your keyboard to the browser at Anchor. It is
// never typed, stored or logged on this machine, and no agent here sees it.
//
// For unattended setup, set SITE_EMAIL and SITE_PASSWORD and the script signs
// in by itself, code and all.

import { openBrowser } from './anchor.mjs';
import { profile, requireSiteUrl, siteUrl } from './config.mjs';

const WAIT_MS = 5 * 60 * 1000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

requireSiteUrl();
const unattended = Boolean(process.env.SITE_EMAIL && process.env.SITE_PASSWORD);
const { page, liveViewUrl, close } = await openBrowser({ profile, persist: true, headed: !unattended });

const signedIn = async () =>
  (await page.context().cookies(siteUrl)).some((cookie) => cookie.name === 'hs_session');

async function waitForSignIn(timeout) {
  const deadline = Date.now() + timeout;
  while (!(await signedIn())) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for the sign-in.');
    await sleep(1000);
  }
}

// Works on either design: it goes by the labels, which both designs have.
async function signInUnattended(email, password) {
  await page.getByLabel(/e-?mail/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByLabel(/password/i).press('Enter');
  await page.waitForURL(/\/verify/);
  const mail = await page.context().newPage();
  await mail.goto(`${siteUrl}/mail`);
  const code = /sign-in code is (\d{6})/.exec(await mail.locator('body').innerText())?.[1];
  await mail.close();
  if (!code) throw new Error('No code in Hangar Mail.');
  await page.getByLabel(/code/i).fill(code);
  await page.getByLabel(/code/i).press('Enter');
}

let exitCode = 0;
try {
  await page.goto(`${siteUrl}/login`, { waitUntil: 'domcontentloaded' });
  if (await signedIn()) {
    console.log(`Profile "${profile}" is already signed in.`);
  } else if (unattended) {
    await signInUnattended(process.env.SITE_EMAIL, process.env.SITE_PASSWORD);
    await waitForSignIn(15_000);
    console.log(`Signed in as ${process.env.SITE_EMAIL}.`);
  } else {
    console.log('Open this URL, sign in to Hangar Supply, and enter the code from Hangar Mail:');
    console.log(`\n  ${liveViewUrl ?? '(the Chrome window that just opened)'}\n`);
    console.log('Waiting up to five minutes...');
    await waitForSignIn(WAIT_MS);
    console.log('Signed in.');
  }
} catch (error) {
  exitCode = 1;
  console.error(`connect failed: ${error.message}`);
} finally {
  await close().catch((error) => console.error(`could not close the browser: ${error.message}`));
}
if (exitCode === 0) console.log(`Profile "${profile}" saved.`);
process.exit(exitCode);
