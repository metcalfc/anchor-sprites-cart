// The contract: what GET /invoices promises, whatever Hangar Supply looks like
// this week. The compiled task has to produce this. If it does not, the run
// failed, even if Anchor says it succeeded.

export class ContractError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ContractError';
  }
}

const STATUSES = new Set(['paid', 'open', 'overdue']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const AMOUNT = /^\d+\.\d{2}$/;

// The task returns its output as one string field, invoices_json. Find it in
// whatever shape the run result comes back in.
function findInvoices(result) {
  if (Array.isArray(result)) return result;
  if (typeof result === 'string') {
    try {
      return findInvoices(JSON.parse(result));
    } catch {
      throw new ContractError(`invoices_json is not JSON: ${result.slice(0, 80)}`);
    }
  }
  if (result && typeof result === 'object') {
    for (const key of ['invoices_json', 'invoices', 'value', 'output']) {
      if (key in result && result[key] != null) return findInvoices(result[key]);
    }
  }
  throw new ContractError(`No invoices in the task output: ${JSON.stringify(result)?.slice(0, 120)}`);
}

// Returns the invoices, newest first, or throws a ContractError that says
// exactly what is wrong.
export function parseInvoices(result) {
  const list = findInvoices(result);
  if (list.length === 0) throw new ContractError('The task returned no invoices.');
  const invoices = list.map((raw, i) => {
    const where = `invoice ${i + 1} (${raw?.number ?? 'no number'})`;
    const invoice = {
      number: String(raw?.number ?? '').trim(),
      issued: String(raw?.issued ?? '').trim(),
      due: String(raw?.due ?? '').trim(),
      description: String(raw?.description ?? '').trim(),
      amount: typeof raw?.amount === 'number' ? raw.amount.toFixed(2) : String(raw?.amount ?? '').trim(),
      currency: String(raw?.currency ?? 'USD').trim().toUpperCase(),
      status: String(raw?.status ?? '').trim().toLowerCase(),
    };
    if (!invoice.number) throw new ContractError(`${where}: missing number`);
    if (!ISO_DATE.test(invoice.issued)) throw new ContractError(`${where}: issued must be YYYY-MM-DD, got ${JSON.stringify(raw?.issued)}`);
    if (!ISO_DATE.test(invoice.due)) throw new ContractError(`${where}: due must be YYYY-MM-DD, got ${JSON.stringify(raw?.due)}`);
    if (!AMOUNT.test(invoice.amount)) throw new ContractError(`${where}: amount must look like 1234.50, got ${JSON.stringify(raw?.amount)}`);
    if (!STATUSES.has(invoice.status)) throw new ContractError(`${where}: status must be paid, open or overdue, got ${JSON.stringify(raw?.status)}`);
    return invoice;
  });
  return invoices.toSorted((a, b) => b.issued.localeCompare(a.issued));
}
