import { describe, expect, it } from 'vitest';

import { mapResult, toLocalDate } from '../shared/mapResult';
import type { OutputMode, StatusFilter } from '../shared/mapResult';
import type { ScrapeResult } from '../shared/scipioClient';
import { sampleResult } from './helpers';

const result = sampleResult as unknown as ScrapeResult;
const FILTERS: StatusFilter[] = ['all', 'completed', 'pending'];
const EXPECTED_COUNTS: Record<StatusFilter, number> = { all: 3, completed: 2, pending: 1 };

function txnCount(mode: OutputMode, items: Array<Record<string, unknown>>): number {
	if (mode === 'transactions') return items.length;
	const accounts = mode === 'raw' ? (items[0].accounts as Array<{ txns: unknown[] }>) : (items as Array<{ txns: unknown[] }>);
	return accounts.reduce((sum, a) => sum + a.txns.length, 0);
}

describe('mapResult', () => {
	for (const filter of FILTERS) {
		it(`transactions mode, ${filter}`, () => {
			const items = mapResult(result, 'leumi', 'transactions', filter);
			expect(items).toHaveLength(EXPECTED_COUNTS[filter]);
			for (const item of items) {
				expect(item.companyId).toBe('leumi');
				expect(item.accountNumber).toBeTypeOf('string');
				expect(item).toHaveProperty('balance');
				expect(item.date_local).toMatch(/^\d{4}-\d{2}-\d{2}$/);
				if (filter !== 'all') expect(item.status).toBe(filter);
				expect(item).not.toHaveProperty('futureDebits');
			}
		});

		it(`accounts mode, ${filter}`, () => {
			const items = mapResult(result, 'leumi', 'accounts', filter);
			expect(items).toHaveLength(2);
			expect(txnCount('accounts', items)).toBe(EXPECTED_COUNTS[filter]);
			expect(items[0].companyId).toBe('leumi');
			expect(items[0].futureDebits).toEqual(sampleResult.futureDebits);
		});

		it(`raw mode ignores the ${filter} filter and returns the full result`, () => {
			const items = mapResult(result, 'leumi', 'raw', filter);
			expect(items).toEqual([{ ...sampleResult, companyId: 'leumi' }]);
			expect(txnCount('raw', items)).toBe(EXPECTED_COUNTS.all);
		});
	}

	it('merges account number and balance into each transaction', () => {
		const [first] = mapResult(result, 'leumi', 'transactions', 'all');
		expect(first).toMatchObject({ accountNumber: '12-345-678', balance: 1000, description: 'Coffee' });
	});

	it('leaves accounts without futureDebits unchanged', () => {
		const items = mapResult({ success: true, accounts: sampleResult.accounts } as unknown as ScrapeResult, 'max', 'accounts', 'all');
		expect(items[0]).not.toHaveProperty('futureDebits');
	});

	it('handles a result with no accounts', () => {
		expect(mapResult({ success: true }, 'max', 'transactions', 'all')).toEqual([]);
	});
});

describe('toLocalDate', () => {
	it('converts to the Asia/Jerusalem calendar date', () => {
		// 21:00 UTC is midnight (next day) in Israel.
		expect(toLocalDate('2026-09-10T21:00:00.000Z')).toBe('2026-09-11');
		expect(toLocalDate('2026-01-10T21:59:00.000Z')).toBe('2026-01-10');
	});

	it('returns undefined for bad input', () => {
		expect(toLocalDate('nope')).toBeUndefined();
		expect(toLocalDate(undefined)).toBeUndefined();
	});
});
