// The thing everyone signs in for: what Hangar Supply has billed you.

const DAY_MS = 24 * 60 * 60 * 1000;

const LINES = [
  ['Hydraulic fluid, 55 gal drum x2', 1840.0],
  ['Tire assembly, main gear', 4215.5],
  ['Brake wear pins (box of 50)', 312.75],
  ['Hangar door motor service', 2650.0],
  ['Torque wrench calibration', 189.0],
  ['Safety wire, 0.032 in, 1 lb spool x6', 147.3],
  ['De-icing fluid, Type IV, 275 gal tote', 3988.0],
  ['Ground power unit rental (30 days)', 1200.0],
];

// Eight invoices, one a month, the newest issued three days ago. The dates move
// with the calendar so there is always something open and something overdue.
export function invoicesFor(now = new Date()) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return LINES.map(([description, amount], i) => {
    const issued = today - (3 + i * 30) * DAY_MS;
    const due = issued + 30 * DAY_MS;
    let status = 'paid';
    if (i === 0) status = 'open';
    if (i === 1) status = due < today ? 'overdue' : 'open';
    return {
      number: `HS-${String(10480 - i * 7).padStart(5, '0')}`,
      issued: new Date(issued).toISOString().slice(0, 10),
      due: new Date(due).toISOString().slice(0, 10),
      description,
      amount: amount.toFixed(2),
      currency: 'USD',
      status,
    };
  });
}
