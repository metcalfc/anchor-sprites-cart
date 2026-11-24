import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { saveEnv } from './env.mjs';

test('saveEnv replaces names already there, appends new ones, keeps the rest', () => {
  const dir = mkdtempSync(join(tmpdir(), 'env-'));
  const file = join(dir, '.env');
  try {
    writeFileSync(file, '# keys\nANCHOR_API_KEY=abc\nSITE_EMAIL=old@example.com\n');
    saveEnv({ SITE_EMAIL: 'new@example.com', SITE_PASSWORD: 'pw' }, file);
    assert.equal(readFileSync(file, 'utf8'), '# keys\nANCHOR_API_KEY=abc\nSITE_EMAIL=new@example.com\nSITE_PASSWORD=pw\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('saveEnv creates the file, readable only by you', () => {
  const dir = mkdtempSync(join(tmpdir(), 'env-'));
  const file = join(dir, '.env');
  try {
    saveEnv({ A: '1' }, file);
    assert.equal(readFileSync(file, 'utf8'), 'A=1\n');
    assert.equal(statSync(file).mode & 0o777, 0o600);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
