import type { INodeProperties } from 'n8n-workflow';

import { scraperOptionsCollection, startDateFields } from './ScrapeFieldsDescription';

const showOnlyForTransactions = { show: { resource: ['transaction'] } };
const showForGetMany = { show: { resource: ['transaction'], operation: ['getAll'] } };

export const transactionOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: showOnlyForTransactions,
		options: [
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Scrape the account and return its transactions',
				action: 'Get many transactions',
			},
		],
		default: 'getAll',
	},
];

export const transactionFields: INodeProperties[] = [
	...startDateFields(showForGetMany),
	{
		displayName: 'Output Mode',
		name: 'outputMode',
		type: 'options',
		displayOptions: showForGetMany,
		options: [
			{
				name: 'Transactions',
				value: 'transactions',
				description: 'One item per transaction, with account number and balance merged in',
			},
			{
				name: 'Accounts',
				value: 'accounts',
				description: 'One item per account, with its transactions nested under txns',
			},
			{ name: 'Raw', value: 'raw', description: "One item with Scipio's full, unfiltered result" },
		],
		default: 'transactions',
	},
	{
		displayName: 'Status Filter',
		name: 'statusFilter',
		type: 'options',
		displayOptions: { show: { ...showForGetMany.show, outputMode: ['transactions', 'accounts'] } },
		options: [
			{ name: 'Completed Only', value: 'completed' },
			{ name: 'Pending Only', value: 'pending' },
			{ name: 'All', value: 'all' },
		],
		default: 'completed',
		description: 'Which transactions to return',
	},
	scraperOptionsCollection(showForGetMany),
];
