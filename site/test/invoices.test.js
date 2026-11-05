import assert from 'node:assert/strict';
import { test } from 'node:test';
import { invoicesFor } from '../src/invoices.js';

test('there is always one open invoice and one overdue', () => {
  const invoices = invoicesFor(new Date('2026-11-05T15:00:00Z'));
  assert.equal(invoices.length, 8);
  assert.equal(invoices[0].issued, '2026-11-02');
  assert.equal(invoices[0].status, 'open');
  assert.equal(invoices[1].status, 'overdue');
  assert.ok(invoices.slice(2).every((i) => i.status === 'paid'));
});

test('invoices are newest first, with unique numbers', () => {
  const invoices = invoicesFor(new Date('2026-11-05T15:00:00Z'));
  const issued = invoices.map((i) => i.issued);
  assert.deepEqual(issued, issued.toSorted().toReversed());
  assert.equal(new Set(invoices.map((i) => i.number)).size, invoices.length);
});
