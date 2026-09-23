import { describe, expect, it } from 'vitest';

import { dedupKey, diffTransactions, prune, PRUNE_GRACE_DAYS, sampleTransactions } from '../shared/dedup';
import type { FlatTransaction } from '../shared/mapResult';

const NOW = Date.parse('2026-09-20T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function flat(overrides: Record<string, unknown> = {}): FlatTransaction {
	return {
		companyId: 'max',
		accountNumber: '1234',
		identifier: 'A1',
		date: '2026-09-18T21:00:00.000Z',
		chargedAmount: -10,
		description: 'Coffee',
		status: 'completed',
		...overrides,
	};
}

describe('dedupKey', () => {
	it('uses the identifier when present', () => {
		expect(dedupKey(flat())).toBe('max|1234|A1|completed');
	});

	it('falls back to transaction fields without an identifier', () => {
		const key = dedupKey(flat({ identifier: undefined, memo: 'm', installments: { number: 2, total: 3 } }));
		expect(key).toBe('max|1234|2026-09-18T21:00:00.000Z|-10|Coffee|m|2|completed');
	});

	it('treats an empty identifier as missing', () => {
		expect(dedupKey(flat({ identifier: '' }))).toContain('Coffee');
	});

	it('changes when a pending transaction completes', () => {
		expect(dedupKey(flat({ status: 'pending' }))).not.toBe(dedupKey(flat({ status: 'completed' })));
	});
});

describe('diffTransactions', () => {
	const base = { lookbackDays: 7, emitExistingOnFirstRun: false, nowMs: NOW };

	it('seeds state and emits nothing on the first run', () => {
		const { emit, state } = diffTransactions({ ...base, state: {}, txns: [flat()], event: 'newCompleted' });
		expect(emit).toEqual([]);
		expect(state.initialized).toBe(true);
		expect(Object.keys(state.seen)).toEqual(['max|1234|A1|completed']);
	});

	it('emits existing transactions on the first run when asked', () => {
		const { emit } = diffTransactions({
			...base,
			emitExistingOnFirstRun: true,
			state: undefined,
			txns: [flat()],
			event: 'newCompleted',
		});
		expect(emit).toHaveLength(1);
	});

	it('emits only transactions not seen before', () => {
		const first = diffTransactions({ ...base, state: {}, txns: [flat()], event: 'newCompleted' });
		const second = diffTransactions({
			...base,
			state: first.state,
			txns: [flat(), flat({ identifier: 'A2' })],
			event: 'newCompleted',
		});
		expect(second.emit.map((t) => t.identifier)).toEqual(['A2']);
		const third = diffTransactions({ ...base, state: second.state, txns: [flat(), flat({ identifier: 'A2' })], event: 'newCompleted' });
		expect(third.emit).toEqual([]);
	});

	it('under newCompleted ignores pending, then emits once completed', () => {
		const seeded = diffTransactions({ ...base, state: {}, txns: [], event: 'newCompleted' });
		const pending = diffTransactions({ ...base, state: seeded.state, txns: [flat({ status: 'pending' })], event: 'newCompleted' });
		expect(pending.emit).toEqual([]);
		const completed = diffTransactions({ ...base, state: pending.state, txns: [flat()], event: 'newCompleted' });
		expect(completed.emit).toHaveLength(1);
	});

	it('under newAny emits pending and later completed', () => {
		const seeded = diffTransactions({ ...base, state: {}, txns: [], event: 'newAny' });
		const pending = diffTransactions({ ...base, state: seeded.state, txns: [flat({ status: 'pending' })], event: 'newAny' });
		expect(pending.emit.map((t) => t.status)).toEqual(['pending']);
		const completed = diffTransactions({ ...base, state: pending.state, txns: [flat()], event: 'newAny' });
		expect(completed.emit.map((t) => t.status)).toEqual(['completed']);
	});

	it('does not re-emit an old-dated transaction the bank keeps returning', () => {
		const old = flat({ identifier: 'OLD', date: new Date(NOW - 60 * DAY).toISOString() });
		const first = diffTransactions({ ...base, emitExistingOnFirstRun: true, state: {}, txns: [old], event: 'newCompleted' });
		expect(first.emit).toHaveLength(1);
		const second = diffTransactions({ ...base, state: first.state, txns: [old], event: 'newCompleted' });
		expect(second.emit).toEqual([]);
		// Once the bank stops returning it, the key is pruned.
		const third = diffTransactions({ ...base, state: second.state, txns: [], event: 'newCompleted' });
		expect(Object.keys(third.state.seen)).toEqual([]);
	});

	it('does not mutate the input state', () => {
		const state = { seen: { old: '2026-09-18T00:00:00.000Z' }, initialized: true };
		diffTransactions({ ...base, state, txns: [flat()], event: 'newCompleted' });
		expect(state.seen).toEqual({ old: '2026-09-18T00:00:00.000Z' });
	});
});

describe('prune', () => {
	it('drops keys older than lookback + grace days', () => {
		const lookbackDays = 7;
		const edge = new Date(NOW - (lookbackDays + PRUNE_GRACE_DAYS) * DAY).toISOString();
		const old = new Date(NOW - (lookbackDays + PRUNE_GRACE_DAYS + 1) * DAY).toISOString();
		const out = prune({ keep: edge, drop: old, weird: 'not-a-date' }, lookbackDays, NOW);
		expect(Object.keys(out).sort()).toEqual(['keep', 'weird']);
	});
});

describe('sampleTransactions', () => {
	it('returns the 5 most recent matching transactions', () => {
		const txns = Array.from({ length: 8 }, (_, n) =>
			flat({ identifier: `T${n}`, date: new Date(NOW - n * DAY).toISOString(), status: n === 0 ? 'pending' : 'completed' }),
		);
		expect(sampleTransactions(txns, 'newCompleted').map((t) => t.identifier)).toEqual(['T1', 'T2', 'T3', 'T4', 'T5']);
		expect(sampleTransactions(txns, 'newAny').map((t) => t.identifier)).toEqual(['T0', 'T1', 'T2', 'T3', 'T4']);
	});
});
