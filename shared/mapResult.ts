import type { IDataObject } from 'n8n-workflow';

import type { Account, ScrapeResult, Transaction } from './scipioClient';

export type OutputMode = 'transactions' | 'accounts' | 'raw';
export type StatusFilter = 'all' | 'completed' | 'pending';

const jerusalemDate = new Intl.DateTimeFormat('en-CA', {
	timeZone: 'Asia/Jerusalem',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
});

/** `YYYY-MM-DD` in Asia/Jerusalem, or undefined for an unparseable date. */
export function toLocalDate(iso: string | undefined): string | undefined {
	if (!iso) return undefined;
	const date = new Date(iso);
	return Number.isNaN(date.getTime()) ? undefined : jerusalemDate.format(date);
}

export function filterTxns(txns: Transaction[], statusFilter: StatusFilter): Transaction[] {
	return statusFilter === 'all' ? txns : txns.filter((t) => t.status === statusFilter);
}

function withLocalDate(txn: Transaction): IDataObject {
	return { ...(txn as unknown as IDataObject), date_local: toLocalDate(txn.date) ?? null };
}

export interface FlatTransaction extends IDataObject {
	companyId: string;
	accountNumber: string;
}

/** One entry per transaction, with the account number and balance merged in. */
export function flattenTransactions(
	result: ScrapeResult,
	companyId: string,
	statusFilter: StatusFilter,
): FlatTransaction[] {
	const out: FlatTransaction[] = [];
	for (const account of result.accounts ?? []) {
		for (const txn of filterTxns(account.txns ?? [], statusFilter)) {
			out.push({
				...withLocalDate(txn),
				companyId,
				accountNumber: account.accountNumber,
				balance: account.balance ?? null,
			});
		}
	}
	return out;
}

function mapAccount(account: Account, companyId: string, statusFilter: StatusFilter): IDataObject {
	return {
		...(account as IDataObject),
		companyId,
		txns: filterTxns(account.txns ?? [], statusFilter).map(withLocalDate),
	};
}

/**
 * Maps a successful Scipio result to output JSON objects.
 * `raw` is Scipio's result unchanged (plus companyId); the status filter and
 * date_local apply to the other modes. Future debits appear only in the
 * `accounts` and `raw` modes.
 */
export function mapResult(
	result: ScrapeResult,
	companyId: string,
	outputMode: OutputMode,
	statusFilter: StatusFilter,
): IDataObject[] {
	if (outputMode === 'transactions') return flattenTransactions(result, companyId, statusFilter);
	if (outputMode === 'raw') return [{ ...(result as IDataObject), companyId }];

	const accounts = (result.accounts ?? []).map((a) => mapAccount(a, companyId, statusFilter));
	const futureDebits = result.futureDebits ?? [];
	return futureDebits.length > 0 ? accounts.map((a) => ({ ...a, futureDebits })) : accounts;
}
