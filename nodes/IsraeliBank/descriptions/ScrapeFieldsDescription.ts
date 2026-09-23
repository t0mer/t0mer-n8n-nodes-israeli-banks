import type { IDisplayOptions, INodeProperties } from 'n8n-workflow';

/** Start-date fields shared by Transaction → Get Many and Job → Create. */
export function startDateFields(displayOptions: IDisplayOptions): INodeProperties[] {
	return [
		{
			displayName: 'Start Date Mode',
			name: 'startDateMode',
			type: 'options',
			noDataExpression: true,
			displayOptions,
			options: [
				{ name: 'Lookback Days', value: 'lookbackDays', description: 'Scrape the last N days' },
				{ name: 'Fixed Date', value: 'fixedDate', description: 'Scrape from a specific date' },
			],
			default: 'lookbackDays',
		},
		{
			displayName: 'Lookback Days',
			name: 'lookbackDays',
			type: 'number',
			typeOptions: { minValue: 1, maxValue: 365 },
			default: 30,
			description: 'How many days back to scrape',
			displayOptions: { show: { ...displayOptions.show, startDateMode: ['lookbackDays'] } },
		},
		{
			displayName: 'Start Date',
			name: 'startDate',
			type: 'dateTime',
			default: '',
			required: true,
			description: 'Scrape transactions from this date on',
			displayOptions: { show: { ...displayOptions.show, startDateMode: ['fixedDate'] } },
		},
	];
}

const SCRAPER_OPTIONS: INodeProperties[] = [
	{
		displayName: 'Additional Transaction Information',
		name: 'additionalTransactionInformation',
		type: 'boolean',
		default: false,
		description: 'Whether to fetch extra per-transaction details where the bank supports it (slower)',
	},
	{
		displayName: 'Combine Installments',
		name: 'combineInstallments',
		type: 'boolean',
		default: false,
		description: 'Whether to combine installment payments into a single transaction',
	},
	{
		displayName: 'Future Months to Scrape',
		name: 'futureMonthsToScrape',
		type: 'number',
		typeOptions: { minValue: 0 },
		default: 1,
		description: 'How many months ahead to scrape (credit-card companies)',
	},
	{
		displayName: 'Include Raw Transaction',
		name: 'includeRawTransaction',
		type: 'boolean',
		default: false,
		description: "Whether to include the bank's raw transaction object on each transaction",
	},
	{
		displayName: 'Max Wait Seconds',
		name: 'maxWaitSeconds',
		type: 'number',
		typeOptions: { minValue: 10 },
		default: 300,
		description:
			'How long to wait for the scrape before giving up (and cancelling the job). With Synchronous Request this is the HTTP timeout.',
	},
	{
		displayName: 'Opt-In Feature Names or IDs',
		name: 'optInFeatures',
		type: 'multiOptions',
		typeOptions: { loadOptionsMethod: 'getOptInFeatures' },
		default: [],
		description:
			'Optional library behaviors. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Poll Interval Seconds',
		name: 'pollIntervalSeconds',
		type: 'number',
		typeOptions: { minValue: 2 },
		default: 5,
		description: 'How often to check the job status while waiting. Not used with Synchronous Request.',
	},
];

/** Library scraper options + node polling options; `extra` is merged in alphabetically. */
export function scraperOptionsCollection(
	displayOptions: IDisplayOptions | undefined,
	extra: INodeProperties[] = [],
	exclude: string[] = [],
): INodeProperties {
	return {
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		...(displayOptions ? { displayOptions } : {}),
		options: [...SCRAPER_OPTIONS.filter((o) => !exclude.includes(o.name)), ...extra].sort((a, b) =>
			a.displayName.localeCompare(b.displayName),
		),
	};
}
