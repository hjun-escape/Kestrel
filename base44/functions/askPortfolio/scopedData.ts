// Wraps askPortfolio's read-only data layer so every tool only sees companies
// the caller may access (see access.ts: signed in = own companies only,
// signed out = the unowned shared demo book). Pure.
import { canAccessCompany } from './access.ts';
import type { Caller } from './access.ts';
import type { DataLayer } from './tools.ts';

export function scopeDataLayer(data: DataLayer, caller: Caller | null | undefined): DataLayer {
  const getBorrower = async (id: string) => {
    const borrower = await data.getBorrower(id);
    return borrower && canAccessCompany(borrower, caller) ? borrower : null;
  };
  return {
    listBorrowers: async () => (await data.listBorrowers()).filter((b) => canAccessCompany(b, caller)),
    getBorrower,
    listSignals: async (borrowerId: string) => ((await getBorrower(borrowerId)) ? data.listSignals(borrowerId) : []),
  };
}
