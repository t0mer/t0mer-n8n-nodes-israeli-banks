import type { IDataObject } from 'n8n-workflow';

import type { ScrapeOptions } from './scipioClient';

const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` (UTC) for `days` days before `nowMs`. */
export function lookbackStartDate(days: number, nowMs: number = Date.now()): string {
	return new Date(nowMs - days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Picks the library scraper options out of the node's Options collection.
 * Node-only settings (maxWaitSeconds, pollIntervalSeconds, ...) are ignored,
 * because Scipio rejects unknown properties.
 */
export function buildScrapeOptions(startDate: string, options: IDataObject): ScrapeOptions {
	const out: ScrapeOptions = { startDate };
	if (typeof options.combineInstallments === 'boolean') out.combineInstallments = options.combineInstallments;
	if (typeof options.additionalTransactionInformation === 'boolean') {
		out.additionalTransactionInformation = options.additionalTransactionInformation;
	}
	if (typeof options.includeRawTransaction === 'boolean') out.includeRawTransaction = options.includeRawTransaction;
	if (typeof options.futureMonthsToScrape === 'number') {
		out.futureMonthsToScrape = Math.max(0, Math.floor(options.futureMonthsToScrape));
	}
	if (Array.isArray(options.optInFeatures) && options.optInFeatures.length > 0) {
		out.optInFeatures = options.optInFeatures.map(String);
	}
	return out;
}
