import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ContractError, parseInvoices } from './invoices.mjs';

const good = {
  number: 'HS-10480',
  issued: '2026-11-02',
  due: '2026-12-02',
  description: 'Hydraulic fluid',
  amount: '1840.00',
  currency: 'USD',
  status: 'open',
};

test('reads invoices_json out of the task result', () => {
  const result = { invoices_json: JSON.stringify([good]) };
  assert.deepEqual(parseInvoices(result), [good]);
  assert.deepEqual(parseInvoices({ value: result }), [good]);
});

test('normalises numbers, case and order', () => {
  const older = { ...good, number: 'HS-10473', issued: '2026-10-03', amount: 4215.5, status: 'Paid' };
  const [first, second] = parseInvoices([older, good]);
  assert.equal(first.number, 'HS-10480');
  assert.equal(second.amount, '4215.50');
  assert.equal(second.status, 'paid');
});

test('says what is wrong when the page changed under the task', () => {
  assert.throws(() => parseInvoices([{ ...good, issued: '2 Nov 2026' }]), /issued must be YYYY-MM-DD, got "2 Nov 2026"/);
  assert.throws(() => parseInvoices([{ ...good, amount: 'USD 1,840.00' }]), /amount must look like 1234.50/);
  assert.throws(() => parseInvoices([{ ...good, status: 'Settled' }]), /status must be paid, open or overdue/);
  assert.throws(() => parseInvoices({ invoices_json: '[]' }), ContractError);
  assert.throws(() => parseInvoices({}), /No invoices/);
});
