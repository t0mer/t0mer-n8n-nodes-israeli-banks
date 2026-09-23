import type { INodeProperties } from 'n8n-workflow';

export const companyOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['company'] } },
		options: [
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List the banks and card companies Scipio supports',
				action: 'Get many companies',
			},
		],
		default: 'getAll',
	},
];

export const twoFactorOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['twoFactor'] } },
		options: [
			{
				name: 'Get Long-Term Token',
				value: 'getLongTermToken',
				description: 'Exchange the SMS code for a long-term token (One Zero)',
				action: 'Get a long term token',
			},
			{
				name: 'Send OTP',
				value: 'sendOtp',
				description: "Send an SMS code to the credential's phone number (One Zero)",
				action: 'Send an OTP',
			},
		],
		default: 'sendOtp',
	},
];

export const twoFactorFields: INodeProperties[] = [
	{
		displayName: 'OTP Code',
		name: 'otpCode',
		type: 'string',
		default: '',
		required: true,
		description: 'The code from the SMS sent by Two-Factor → Send OTP',
		displayOptions: { show: { resource: ['twoFactor'], operation: ['getLongTermToken'] } },
	},
];

export const systemOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['system'] } },
		options: [
			{
				name: 'Get Version',
				value: 'getVersion',
				description: 'Get the Scipio and scraper library versions',
				action: 'Get the scipio version',
			},
		],
		default: 'getVersion',
	},
];
