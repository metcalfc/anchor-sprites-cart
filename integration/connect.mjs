// Signs the browser profile in to Hangar Supply, once.
//
//   npm run connect
//
// The first time, it registers a throwaway portal account (a made-up
// lab-…@example.com address and a random password), saves both to .env, and
// signs the profile in with them, reading the one-time code from Hangar Mail.
// After that it signs in with the account in .env. No agent sees the password:
// it goes from .env to the browser at Anchor. It also makes API_TOKEN and
// HEAL_TOKEN, for later steps, if .env has none.
//
//   npm run connect -- --live
//
// Prints a live view URL instead, so you can sign in yourself: the way it works
// for a real portal, where nobody hands a script the password.

import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { openBrowser } from './anchor.mjs';
import { profile, requireSiteUrl, siteUrl } from './config.mjs';
import { ENV_FILE, saveEnv } from './env.mjs';

const WAIT_MS = 5 * 60 * 1000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const { values } = parseArgs({ options: { live: { type: 'boolean' } } });
requireSiteUrl();

const tokens = Object.fromEntries(
  ['API_TOKEN', 'HEAL_TOKEN'].filter((name) => !process.env[name]).map((name) => [name, randomBytes(16).toString('hex')]),
);
if (Object.keys(tokens).length) {
  saveEnv(tokens);
  console.log(`Made ${Object.keys(tokens).join(' and ')}, saved to ${ENV_FILE}.`);
}

let email = process.env.SITE_EMAIL;
let password = process.env.SITE_PASSWORD;
const register = !values.live && !(email && password);
if (register) {
  email = `lab-${randomBytes(4).toString('hex')}@example.com`;
  password = randomBytes(12).toString('base64url');
}

const { page, liveViewUrl, close } = await openBrowser({ profile, persist: true, headed: values.live });

const signedIn = async () =>
  (await page.context().cookies(siteUrl)).some((cookie) => cookie.name === 'hs_session');

async function waitForSignIn(timeout) {
  const deadline = Date.now() + timeout;
  while (!(await signedIn())) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for the sign-in.');
    await sleep(1000);
  }
}

// Everything below goes by labels, which both designs have.
async function registerAccount() {
  await page.goto(`${siteUrl}/signup`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel(/contact name/i).fill('Lab Pilot');
  await page.getByLabel(/company/i).fill('Ridge Air');
  await page.getByLabel(/e-?mail/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /register/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/signup'), { timeout: 15_000 }).catch(() => {
    throw new Error('Registration did not go through. Try again, or use --live.');
  });
  saveEnv({ SITE_EMAIL: email, SITE_PASSWORD: password });
  console.log(`Registered ${email} on Hangar Supply, saved to ${ENV_FILE}.`);
}

async function enterCodeFromMail() {
  const mail = await page.context().newPage();
  await mail.goto(`${siteUrl}/mail`);
  const code = /sign-in code is (\d{6})/.exec(await mail.locator('body').innerText())?.[1];
  await mail.close();
  if (!code) throw new Error('No code in Hangar Mail.');
  await page.getByLabel(/code/i).fill(code);
  await page.getByLabel(/code/i).press('Enter');
}

async function signInUnattended() {
  if (!/\/verify/.test(page.url())) {
    await page.goto(`${siteUrl}/login`, { waitUntil: 'domcontentloaded' });
    if (await signedIn()) return;
    await page.getByLabel(/e-?mail/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByLabel(/password/i).press('Enter');
    await page.waitForURL(/\/verify/);
  }
  await enterCodeFromMail();
}

let exitCode = 0;
try {
  await page.goto(`${siteUrl}/login`, { waitUntil: 'domcontentloaded' });
  if (await signedIn()) {
    console.log(`Profile "${profile}" is already signed in.`);
  } else if (values.live) {
    console.log('Open this URL, sign in to Hangar Supply, and enter the code from Hangar Mail:');
    console.log(`\n  ${liveViewUrl ?? '(the Chrome window that just opened)'}\n`);
    console.log('Waiting up to five minutes...');
    await waitForSignIn(WAIT_MS);
    console.log('Signed in.');
  } else {
    if (register) await registerAccount();
    if (!(await signedIn())) await signInUnattended();
    await waitForSignIn(15_000);
    console.log(`Signed in as ${email}.`);
  }
} catch (error) {
  exitCode = 1;
  console.error(`connect failed: ${error.message}`);
} finally {
  await close().catch((error) => console.error(`could not close the browser: ${error.message}`));
}
if (exitCode === 0) console.log(`Profile "${profile}" saved.`);
process.exit(exitCode);
