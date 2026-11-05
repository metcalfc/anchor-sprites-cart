import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createApp, designFor } from '../src/app.js';

test('each account has its own design, and SITE_DESIGN pins it', () => {
  assert.equal(designFor({ design: 'new' }, undefined), 'new');
  assert.equal(designFor({ design: 'classic' }, undefined), 'classic');
  assert.equal(designFor(undefined, undefined), 'classic');
  assert.equal(designFor({ design: 'classic' }, 'new'), 'new');
});

// Signs up, signs in with the emailed code, reads invoices, flips the design.
test('sign-in needs the code from Hangar Mail, and the redesign moves the invoices', async () => {
  const app = createApp({ dataDir: mkdtempSync(join(tmpdir(), 'hangar-')) });
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}`;
  const jar = new Map();
  const send = async (path, form) => {
    const res = await fetch(`${base}${path}`, {
      method: form ? 'POST' : 'GET',
      redirect: 'manual',
      headers: {
        cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
        ...(form && { 'content-type': 'application/x-www-form-urlencoded' }),
      },
      body: form && new URLSearchParams(form),
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const [k, v] = pair.split('=');
      if (v) jar.set(k, v);
      else jar.delete(k);
    }
    return res;
  };
  try {
    const account = { name: 'Ada Pilot', company: 'Ridge Air', email: 'ada@example.com', password: 'correct horse' };
    assert.equal((await send('/signup', account)).status, 303);
    await send('/logout');
    assert.equal((await send('/invoices')).headers.get('location'), '/login');

    assert.equal((await send('/login', { email: account.email, password: account.password })).headers.get('location'), '/verify');
    const mail = await (await send('/mail')).text();
    const code = /sign-in code is (\d{6})/.exec(mail)[1];
    assert.equal((await send('/verify', { code: '000000' === code ? '111111' : '000000' })).status, 401);
    assert.equal((await send('/verify', { code })).headers.get('location'), '/dashboard');

    const classic = await (await send('/invoices')).text();
    assert.match(classic, /Invoice #/);
    assert.match(classic, /\d{2}\/\d{2}\/\d{4}/);
    assert.equal((await send('/billing/documents')).status, 404);

    await send('/settings/design', { design: 'new' });
    assert.match(await (await send('/invoices')).text(), /Invoices have a new home/);
    const fresh = await (await send('/billing/documents')).text();
    assert.match(fresh, /Billing documents/);
    assert.match(fresh, /Issued \d{1,2} [A-Z][a-z]{2} \d{4}/);
    assert.match(fresh, /Past due/);
  } finally {
    server.close();
  }
});
