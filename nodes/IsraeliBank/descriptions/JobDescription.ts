import type { INodeProperties } from 'n8n-workflow';

import { scraperOptionsCollection, startDateFields } from './ScrapeFieldsDescription';

const showOnlyForJobs = { show: { resource: ['job'] } };
const showForCreate = { show: { resource: ['job'], operation: ['create'] } };

export const jobOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: showOnlyForJobs,
		options: [
			{
				name: 'Cancel',
				value: 'cancel',
				description: 'Cancel and delete a job',
				action: 'Cancel a job',
			},
			{
				name: 'Create',
				value: 'create',
				description: 'Start a scrape job and return its ID without waiting',
				action: 'Create a job',
			},
			{
				name: 'Get Result',
				value: 'getResult',
				description: 'Get the result of a finished job',
				action: 'Get the result of a job',
			},
			{
				name: 'Get Status',
				value: 'getStatus',
				description: 'Get the status, progress and queue position of a job',
				action: 'Get the status of a job',
			},
			{
				name: 'Submit OTP',
				value: 'submitOtp',
				description: 'Send the one-time password to a job that is waiting for it',
				action: 'Submit an OTP to a job',
			},
		],
		default: 'create',
	},
];

export const jobFields: INodeProperties[] = [
	{
		displayName: 'Job ID',
		name: 'jobId',
		type: 'string',
		default: '',
		required: true,
		description: 'The job ID returned by Job → Create',
		displayOptions: {
			show: { resource: ['job'], operation: ['cancel', 'getResult', 'getStatus', 'submitOtp'] },
		},
	},
	{
		displayName: 'OTP Code',
		name: 'otpCode',
		type: 'string',
		default: '',
		required: true,
		description: 'The one-time password the bank sent',
		displayOptions: { show: { resource: ['job'], operation: ['submitOtp'] } },
	},
	...startDateFields(showForCreate),
	scraperOptionsCollection(showForCreate, [], ['maxWaitSeconds', 'pollIntervalSeconds']),
];
