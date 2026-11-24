// End to end in a real browser, against a local Hangar Supply, with no Anchor:
// BROWSER_MODE=local uses the Chrome on this machine. Skipped if there is none.
//
// It checks the parts that can only break in a browser: that `connect` and
// `look` work on both designs, that the spec in tasks/invoices.json describes
// the classic portal accurately, that the redesign really breaks a flow written
// for classic, and that the contract can still be met after it.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { promisify } from 'node:util';
import { chromium } from 'playwright-core';
import { createApp } from '../site/src/app.js';
import { invoicesFor } from '../site/src/invoices.js';
import { parseInvoices } from './invoices.mjs';
import { loadSpec } from './task.mjs';

const run = promisify(execFile);
const CHROME = '/Applications/Google Chrome.app';
const hasChrome = process.env.CHROME_TESTS !== '0' && (existsSync(CHROME) || existsSync('/usr/bin/google-chrome'));
const PROFILE = `test-${process.pid}`;
const ACCOUNT = { name: 'Ada Pilot', company: 'Ridge Air', email: `ada-${process.pid}@example.com`, password: 'correct horse battery' };

let server;
let siteUrl;
// Scripts write to their own .env here, never to the repo's.
const ENV_DIR = mkdtempSync(join(tmpdir(), 'hangar-env-'));
const env = () => ({
  ...process.env,
  ENV_FILE: join(ENV_DIR, '.env'),
  SITE_URL: siteUrl,
  BROWSER_MODE: 'local',
  BROWSER_PROFILE: PROFILE,
  SITE_EMAIL: ACCOUNT.email,
  SITE_PASSWORD: ACCOUNT.password,
});
const script = (name, ...args) => run(process.execPath, [join('integration', name), ...args], { env: env(), timeout: 60_000 });

before(async () => {
  if (!hasChrome) return;
  server = createApp({ dataDir: mkdtempSync(join(tmpdir(), 'hangar-')) }).listen(0);
  siteUrl = `http://localhost:${server.address().port}`;
  const res = await fetch(`${siteUrl}/signup`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(ACCOUNT),
  });
  assert.equal(res.status, 303);
});

after(() => {
  server?.close();
  rmSync(ENV_DIR, { recursive: true, force: true });
  rmSync(join('data', 'local-profiles', PROFILE), { recursive: true, force: true });
});

// A page in the signed-in profile, as the task would see it.
async function withPage(fn) {
  const context = await chromium.launchPersistentContext(join('data', 'local-profiles', PROFILE), { channel: 'chrome', headless: true });
  try {
    return await fn(context.pages()[0] ?? (await context.newPage()));
  } finally {
    await context.close();
  }
}

async function setDesign(design) {
  await withPage(async (page) => {
    await page.goto(`${siteUrl}/`);
    await page.request.post(`${siteUrl}/settings/design`, { form: { design } });
  });
}

// What tasks/invoices.json tells Anchor to do, done literally, by role and text.
async function classicFlow(page) {
  await page.goto(`${siteUrl}/invoices`);
  const table = page.getByRole('table').filter({ has: page.getByRole('columnheader', { name: 'Invoice #' }) });
  await table.waitFor({ timeout: 5000 });
  const rows = await table.getByRole('row').all();
  const toIso = (us) => `${us.slice(6, 10)}-${us.slice(0, 2)}-${us.slice(3, 5)}`;
  const invoices = [];
  for (const row of rows.slice(1)) {
    const [number, issued, due, description, amount, status] = await row.getByRole('cell').allInnerTexts();
    invoices.push({ number, issued: toIso(issued), due: toIso(due), description, amount: amount.replace(/[$,]/g, ''), currency: 'USD', status: status.toLowerCase() });
  }
  return invoices;
}

// The same job on the redesign, by what the page shows: what a heal has to reach.
async function newFlow(page) {
  await page.goto(`${siteUrl}/home`);
  await page.getByRole('link', { name: 'Documents', exact: true }).click();
  const items = await page.getByRole('list', { name: 'Billing documents' }).getByRole('listitem').all();
  const MONTHS = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
  const toIso = (d) => {
    const [day, mon, year] = d.split(' ');
    return `${year}-${MONTHS[mon]}-${day.padStart(2, '0')}`;
  };
  const STATUS = { Settled: 'paid', Due: 'open', 'Past due': 'overdue' };
  const invoices = [];
  for (const item of items) {
    const text = await item.innerText();
    const [number, amount] = text.split('\n');
    const meta = /^(.*) · Issued (.+) · Due (.+)$/m.exec(text);
    const status = Object.keys(STATUS).find((s) => text.trim().endsWith(s));
    invoices.push({ number, amount: amount.replace(/^USD |,/g, ''), description: meta[1], issued: toIso(meta[2]), due: toIso(meta[3]), currency: 'USD', status: STATUS[status] });
  }
  return invoices;
}

const expected = () => parseInvoices(invoicesFor());

test('connect signs the profile in unattended, code from Hangar Mail and all', { skip: !hasChrome }, async () => {
  const { stdout } = await script('connect.mjs');
  assert.match(stdout, /Signed in as/);
  const again = await script('connect.mjs');
  assert.match(again.stdout, /already signed in/);
});

test('look prints the invoices page as an outline', { skip: !hasChrome }, async () => {
  const { stdout } = await script('look.mjs', '/invoices');
  assert.match(stdout, /columnheader "Invoice #"/);
  assert.match(stdout, /HS-10480/);
});

test('the spec describes the classic portal: following it meets the contract', { skip: !hasChrome }, async () => {
  const spec = loadSpec();
  for (const column of ['Invoice #', 'Invoice Date', 'Due Date', 'Description', 'Amount', 'Status']) {
    assert.ok(spec.prompt.includes(column), `spec names the column ${column}`);
  }
  const invoices = await withPage(classicFlow);
  assert.deepEqual(parseInvoices(invoices), expected());
});

test('the redesign breaks the classic flow, and the contract can still be met', { skip: !hasChrome }, async () => {
  await setDesign('new');
  try {
    await assert.rejects(withPage(classicFlow), /Timeout|waiting/);
    const outline = (await script('look.mjs', '/invoices')).stdout;
    assert.match(outline, /Invoices have a new home/);
    assert.deepEqual(parseInvoices(await withPage(newFlow)), expected());
  } finally {
    await setDesign('classic');
  }
});

test('connect works on the redesigned sign-in too', { skip: !hasChrome }, async () => {
  await setDesign('new');
  rmSync(join('data', 'local-profiles', PROFILE), { recursive: true, force: true });
  const { stdout } = await script('connect.mjs');
  assert.match(stdout, /Signed in as/);
  await setDesign('classic');
});

test('connect registers a throwaway account when .env has none, and saves it', { skip: !hasChrome }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hangar-env-'));
  const envFile = join(dir, '.env');
  writeFileSync(envFile, 'ANCHOR_API_KEY=kept\n');
  const fresh = `${PROFILE}-fresh`;
  const { SITE_EMAIL, SITE_PASSWORD, ...rest } = env();
  try {
    const { stdout } = await run(process.execPath, [join('integration', 'connect.mjs')], {
      env: { ...rest, BROWSER_PROFILE: fresh, ENV_FILE: envFile },
      timeout: 60_000,
    });
    assert.match(stdout, /Registered lab-[0-9a-f]{8}@example\.com/);
    assert.match(stdout, /Signed in as lab-/);
    const saved = readFileSync(envFile, 'utf8');
    assert.match(saved, /^ANCHOR_API_KEY=kept$/m);
    assert.match(saved, /^SITE_EMAIL=lab-[0-9a-f]{8}@example\.com$/m);
    assert.match(saved, /^SITE_PASSWORD=.{12,}$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(join('data', 'local-profiles', fresh), { recursive: true, force: true });
  }
});
