import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { healPrompt } from './prompt.mjs';
import { verifyAnchorSignature } from './signature.mjs';

const sign = (secret, t, body) =>
  `t=${t},v1=${createHmac('sha256', secret).update(`v0:${t}:${body}`).digest('hex')}`;

test('accepts a fresh delivery signed with the current or previous secret', () => {
  const body = Buffer.from('{"id":"evt_1","type":"task.healed"}');
  const now = 1_800_000_000_000;
  const t = now / 1000 - 5;
  for (const secret of ['new', 'old']) {
    assert.ok(verifyAnchorSignature({ header: sign(secret, t, body), rawBody: body, secrets: ['new', 'old'], now }));
  }
});

test('rejects a stale, tampered or unsigned delivery', () => {
  const body = Buffer.from('{"id":"evt_1"}');
  const now = 1_800_000_000_000;
  const old = now / 1000 - 600;
  assert.ok(!verifyAnchorSignature({ header: sign('s', old, body), rawBody: body, secrets: ['s'], now }));
  const t = now / 1000;
  assert.ok(!verifyAnchorSignature({ header: sign('s', t, body), rawBody: Buffer.from('{"id":"evt_2"}'), secrets: ['s'], now }));
  assert.ok(!verifyAnchorSignature({ header: sign('other', t, body), rawBody: body, secrets: ['s'], now }));
  assert.ok(!verifyAnchorSignature({ header: undefined, rawBody: body, secrets: ['s'], now }));
});

test('a healed task gets reviewed; anything else gets re-explored', () => {
  const healed = healPrompt({ kind: 'healed', details: { fix_suggestion: 'Use Documents' } }, 'heal/x');
  assert.match(healed, /npm run pull -- --draft/);
  assert.match(healed, /fix_suggestion: Use Documents/);
  assert.match(healed, /worktree on branch heal\/x/);
  const drift = healPrompt({ kind: 'drift', details: { runId: 'r9' } }, 'heal/z');
  assert.match(drift, /AI\s+fallback/);
  assert.match(drift, /npm run compile/);
  assert.match(drift, /without the AI fallback/);
  const failed = healPrompt({ kind: 'failed', details: { message: 'no table' } }, 'heal/y');
  assert.match(failed, /npm run compile/);
  assert.doesNotMatch(failed, /--draft/);
});
