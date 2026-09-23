import type { FlatTransaction } from './mapResult';

export type TriggerEvent = 'newCompleted' | 'newAny';

export interface DedupState {
	/** Dedup key → transaction date (ISO). */
	seen: Record<string, string>;
	initialized: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Extra days kept past the lookback window before a key is pruned. */
export const PRUNE_GRACE_DAYS = 14;
export const MANUAL_SAMPLE_SIZE = 5;

function part(value: unknown): string {
	return value === undefined || value === null ? '' : String(value);
}

/**
 * Stable key for a transaction. The status is part of the key, so a pending
 * transaction that later completes is seen as new once more.
 */
export function dedupKey(txn: FlatTransaction): string {
	const base = [part(txn.companyId), part(txn.accountNumber)];
	const identifier = txn.identifier;
	if (identifier !== undefined && identifier !== null && identifier !== '') {
		base.push(part(identifier));
	} else {
		const installments = txn.installments as { number?: number } | undefined;
		base.push(
			part(txn.date),
			part(txn.chargedAmount),
			part(txn.description),
			part(txn.memo),
			part(installments?.number),
		);
	}
	base.push(part(txn.status));
	return base.join('|');
}

export function filterByEvent(txns: FlatTransaction[], event: TriggerEvent): FlatTransaction[] {
	return event === 'newAny' ? txns : txns.filter((t) => t.status === 'completed');
}

/**
 * Drops keys whose transaction date is older than lookbackDays + grace.
 * Keys in `keep` (transactions still returned by the bank) are never dropped,
 * otherwise an old-dated transaction would be re-emitted on every poll.
 */
export function prune(
	seen: Record<string, string>,
	lookbackDays: number,
	nowMs: number,
	keep: Set<string> = new Set(),
): Record<string, string> {
	const cutoff = nowMs - (lookbackDays + PRUNE_GRACE_DAYS) * DAY_MS;
	const out: Record<string, string> = {};
	for (const [key, date] of Object.entries(seen)) {
		const time = new Date(date).getTime();
		// Keep keys with an unparseable date rather than re-emitting them.
		if (keep.has(key) || Number.isNaN(time) || time >= cutoff) out[key] = date;
	}
	return out;
}

export interface PollInput {
	state: Partial<DedupState> | undefined;
	txns: FlatTransaction[];
	event: TriggerEvent;
	lookbackDays: number;
	emitExistingOnFirstRun: boolean;
	nowMs: number;
}

export interface PollOutput {
	emit: FlatTransaction[];
	state: DedupState;
}

/**
 * Works out which transactions are new and the next state.
 * First run seeds the state and emits nothing (unless emitExistingOnFirstRun).
 * Pure: the caller decides whether to persist `state`.
 */
export function diffTransactions(input: PollInput): PollOutput {
	const firstRun = !input.state?.initialized;
	const candidates = filterByEvent(input.txns, input.event).map((txn) => ({ txn, key: dedupKey(txn) }));
	const current = new Set(candidates.map((c) => c.key));
	const seen = prune({ ...(input.state?.seen ?? {}) }, input.lookbackDays, input.nowMs, current);
	const emit: FlatTransaction[] = [];

	for (const { txn, key } of candidates) {
		if (key in seen) continue;
		seen[key] = part(txn.date);
		if (!firstRun || input.emitExistingOnFirstRun) emit.push(txn);
	}

	return { emit, state: { seen, initialized: true } };
}

/** Manual-mode sample: most recent transactions first, state untouched. */
export function sampleTransactions(txns: FlatTransaction[], event: TriggerEvent): FlatTransaction[] {
	return [...filterByEvent(txns, event)]
		.sort((a, b) => new Date(part(b.date)).getTime() - new Date(part(a.date)).getTime())
		.slice(0, MANUAL_SAMPLE_SIZE);
}
