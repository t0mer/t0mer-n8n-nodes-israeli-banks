import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';

import { jobError } from '../../shared/errors';
import { runScrapeJob, runSyncScrape } from '../../shared/jobRunner';
import { mapResult } from '../../shared/mapResult';
import type { OutputMode, StatusFilter } from '../../shared/mapResult';
import { getBankCredential, getOptInFeatures, israeliBankAccountTest } from '../../shared/nodeMethods';
import { createScipioClient } from '../../shared/scipioClient';
import { buildScrapeOptions, lookbackStartDate } from '../../shared/scrapeOptions';
import { jobFields, jobOperations } from './descriptions/JobDescription';
import {
	companyOperations,
	systemOperations,
	twoFactorFields,
	twoFactorOperations,
} from './descriptions/OtherResourcesDescription';
import { transactionFields, transactionOperations } from './descriptions/TransactionDescription';

// Programmatic rather than declarative: scrapes run as async Scipio jobs that
// need polling, timeouts with cleanup, and result mapping.

function resolveStartDate(ctx: IExecuteFunctions, i: number): string {
	const mode = ctx.getNodeParameter('startDateMode', i) as string;
	if (mode === 'fixedDate') {
		const value = String(ctx.getNodeParameter('startDate', i) ?? '').slice(0, 10);
		if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
			throw new NodeOperationError(ctx.getNode(), 'Start Date is missing or invalid', { itemIndex: i });
		}
		return value;
	}
	return lookbackStartDate(ctx.getNodeParameter('lookbackDays', i) as number);
}

async function executeOperation(
	ctx: IExecuteFunctions,
	resource: string,
	operation: string,
	i: number,
): Promise<IDataObject[]> {
	if (resource === 'transaction' && operation === 'getAll') {
		const bank = await getBankCredential(ctx, i);
		const client = await createScipioClient(ctx, { itemIndex: i, secrets: bank.secrets });
		const options = ctx.getNodeParameter('options', i, {}) as IDataObject;
		const scrapeOptions = buildScrapeOptions(resolveStartDate(ctx, i), options);
		const timing = {
			maxWaitSeconds: (options.maxWaitSeconds as number) ?? 300,
			pollIntervalSeconds: (options.pollIntervalSeconds as number) ?? 5,
		};
		const result =
			ctx.getNodeParameter('scrapeMethod', i, 'job') === 'sync'
				? await runSyncScrape(client, bank.payload, scrapeOptions, timing)
				: (await runScrapeJob(client, bank.payload, scrapeOptions, timing)).result;
		return mapResult(
			result,
			bank.payload.companyId,
			ctx.getNodeParameter('outputMode', i) as OutputMode,
			ctx.getNodeParameter('statusFilter', i, 'all') as StatusFilter,
		);
	}

	if (resource === 'company' && operation === 'getAll') {
		const client = await createScipioClient(ctx, { itemIndex: i });
		return (await client.getCompanies()).companies as unknown as IDataObject[];
	}

	if (resource === 'job') {
		if (operation === 'create') {
			const bank = await getBankCredential(ctx, i);
			const client = await createScipioClient(ctx, { itemIndex: i, secrets: bank.secrets });
			const options = ctx.getNodeParameter('options', i, {}) as IDataObject;
			const created = await client.createJob(bank.payload, buildScrapeOptions(resolveStartDate(ctx, i), options));
			return [{ ...created, companyId: bank.payload.companyId }];
		}

		const client = await createScipioClient(ctx, { itemIndex: i });
		const jobId = (ctx.getNodeParameter('jobId', i) as string).trim();

		if (operation === 'getStatus') return [(await client.getJob(jobId)) as unknown as IDataObject];
		if (operation === 'getResult') {
			const result = await client.getResult(jobId);
			if (!result) {
				throw jobError(
					ctx.getNode(),
					'The job has not finished yet',
					'Wait a bit longer (for example with a Wait node), check Job → Get Status, and try again.',
					{ jobId, itemIndex: i },
				);
			}
			return [{ jobId, ...result }];
		}
		if (operation === 'submitOtp') {
			await client.submitOtp(jobId, (ctx.getNodeParameter('otpCode', i) as string).trim());
			return [{ jobId, submitted: true }];
		}
		if (operation === 'cancel') {
			await client.deleteJob(jobId);
			return [{ jobId, deleted: true }];
		}
	}

	if (resource === 'twoFactor') {
		const bank = await getBankCredential(ctx, i);
		if (bank.payload.companyId !== 'oneZero') {
			throw new NodeOperationError(ctx.getNode(), 'Two-Factor operations only work with One Zero', {
				description: 'Select an Israeli Bank Account credential whose company is One Zero.',
				itemIndex: i,
			});
		}
		const client = await createScipioClient(ctx, { itemIndex: i, secrets: bank.secrets });

		if (operation === 'sendOtp') {
			const phoneNumber = String(bank.raw.phoneNumber ?? '').trim();
			if (!phoneNumber) {
				throw new NodeOperationError(ctx.getNode(), 'The credential has no phone number', {
					description: 'Fill in Phone Number in the Israeli Bank Account credential.',
					itemIndex: i,
				});
			}
			const { success } = await client.triggerTwoFactor(phoneNumber);
			if (!success) {
				throw new NodeOperationError(ctx.getNode(), 'One Zero did not send the OTP', {
					description: 'Check the phone number in the credential and the Scipio logs.',
					itemIndex: i,
				});
			}
			return [{ success, message: 'OTP sent. Use Two-Factor → Get Long-Term Token with the code.' }];
		}

		if (operation === 'getLongTermToken') {
			const otpCode = (ctx.getNodeParameter('otpCode', i) as string).trim();
			const { longTermTwoFactorAuthToken } = await client.getLongTermToken(otpCode);
			ctx.addExecutionHints({
				message:
					'Copy longTermTwoFactorAuthToken into the "OTP Long-Term Token" field of your Israeli Bank Account credential. This node does not update the credential for you.',
				type: 'info',
				location: 'outputPane',
			});
			return [{ longTermTwoFactorAuthToken }];
		}
	}

	if (resource === 'system' && operation === 'getVersion') {
		const client = await createScipioClient(ctx, { itemIndex: i });
		return [await client.getVersion()];
	}

	throw new NodeOperationError(ctx.getNode(), `Unsupported operation "${operation}" for resource "${resource}"`, {
		itemIndex: i,
	});
}

export class IsraeliBank implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Israeli Bank',
		name: 'israeliBank',
		icon: { light: 'file:israeliBank.svg', dark: 'file:israeliBank.dark.svg' },
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Get Israeli bank and credit-card transactions through a self-hosted Scipio server',
		defaults: {
			name: 'Israeli Bank',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'scipioApi',
				required: true,
			},
			{
				name: 'israeliBankAccountApi',
				required: true,
				testedBy: 'israeliBankAccountTest',
				displayOptions: {
					show: {
						resource: ['transaction', 'job', 'twoFactor'],
						operation: ['getAll', 'create', 'sendOtp', 'getLongTermToken'],
					},
				},
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Company', value: 'company' },
					{ name: 'Job', value: 'job' },
					{ name: 'System', value: 'system' },
					{ name: 'Transaction', value: 'transaction' },
					{ name: 'Two-Factor', value: 'twoFactor' },
				],
				default: 'transaction',
			},
			...transactionOperations,
			...transactionFields,
			...companyOperations,
			...jobOperations,
			...jobFields,
			...twoFactorOperations,
			...twoFactorFields,
			...systemOperations,
		],
	};

	methods = {
		loadOptions: { getOptInFeatures },
		credentialTest: { israeliBankAccountTest },
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				const results = await executeOperation(this, resource, operation, i);
				returnData.push(...results.map((json) => ({ json, pairedItem: { item: i } })));
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: error.message,
							errorType: error.context?.errorType ?? null,
							jobId: error.context?.jobId ?? null,
						},
						pairedItem: { item: i },
					});
					continue;
				}
				// Re-wrapping an n8n error returns the same instance, so set the index first.
				if (error.context) error.context.itemIndex = i;
				if (error instanceof NodeApiError) {
					throw new NodeApiError(this.getNode(), error as unknown as JsonObject, { itemIndex: i });
				}
				throw new NodeOperationError(this.getNode(), error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
