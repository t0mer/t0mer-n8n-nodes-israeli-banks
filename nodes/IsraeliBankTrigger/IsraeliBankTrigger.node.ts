import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import type {
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IPollFunctions,
} from 'n8n-workflow';

import { diffTransactions, sampleTransactions } from '../../shared/dedup';
import type { DedupState, TriggerEvent } from '../../shared/dedup';
import { runScrapeJob } from '../../shared/jobRunner';
import { flattenTransactions } from '../../shared/mapResult';
import { getBankCredential, getOptInFeatures, israeliBankAccountTest } from '../../shared/nodeMethods';
import { createScipioClient } from '../../shared/scipioClient';
import { buildScrapeOptions, lookbackStartDate } from '../../shared/scrapeOptions';
import { scraperOptionsCollection } from '../IsraeliBank/descriptions/ScrapeFieldsDescription';

export class IsraeliBankTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Israeli Bank Trigger',
		name: 'israeliBankTrigger',
		icon: { light: 'file:israeliBank.svg', dark: 'file:israeliBank.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["event"] === "newAny" ? "New transactions (incl. pending)" : "New completed transactions"}}',
		description:
			'Starts the workflow when new Israeli bank or card transactions appear. Poll every 4 hours or less often: banks rate-limit and flag frequent logins.',
		defaults: {
			name: 'Israeli Bank Trigger',
		},
		polling: true,
		inputs: [],
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
			},
		],
		properties: [
			{
				displayName:
					'Set the poll interval to 4 hours or more. Banks rate-limit and may flag or block accounts that log in too often.',
				name: 'pollNotice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				options: [
					{
						name: 'New Completed Transaction',
						value: 'newCompleted',
						description: 'Emit each transaction once, after it is completed',
					},
					{
						name: 'New Transaction (Including Pending)',
						value: 'newAny',
						description: 'Emit pending transactions too. One can be emitted twice: once pending, once completed.',
					},
				],
				default: 'newCompleted',
			},
			{
				displayName: 'Lookback Days',
				name: 'lookbackDays',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 365 },
				default: 7,
				description:
					'Days scraped on every poll. Keep it longer than the poll interval so late-posting transactions are caught.',
			},
			scraperOptionsCollection(undefined, [
				{
					displayName: 'Emit Existing on First Run',
					name: 'emitExistingOnFirstRun',
					type: 'boolean',
					default: false,
					description:
						'Whether to emit the transactions already in the window when the workflow is first activated (by default they are only recorded)',
				},
			]),
		],
	};

	methods = {
		loadOptions: { getOptInFeatures },
		credentialTest: { israeliBankAccountTest },
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const event = this.getNodeParameter('event', 'newCompleted') as TriggerEvent;
		const lookbackDays = this.getNodeParameter('lookbackDays', 7) as number;
		const options = this.getNodeParameter('options', {}) as IDataObject;

		const bank = await getBankCredential(this);
		if (bank.payload.companyId === 'oneZero' && !bank.payload.otpLongTermToken) {
			// Without a token every poll would send an SMS that nobody can answer.
			throw new NodeOperationError(this.getNode(), 'One Zero needs a long-term token for the trigger', {
				description:
					'Get one with the Israeli Bank node (Two-Factor → Send OTP, then Get Long-Term Token) and paste it into the credential.',
			});
		}
		const client = await createScipioClient(this, { secrets: bank.secrets });
		const { result } = await runScrapeJob(
			client,
			bank.payload,
			buildScrapeOptions(lookbackStartDate(lookbackDays), options),
			{
				maxWaitSeconds: (options.maxWaitSeconds as number) ?? 300,
				pollIntervalSeconds: (options.pollIntervalSeconds as number) ?? 5,
			},
		);
		const txns = flattenTransactions(result, bank.payload.companyId, 'all');

		if (this.getMode() === 'manual') {
			const sample = sampleTransactions(txns, event);
			return sample.length > 0 ? [this.helpers.returnJsonArray(sample)] : null;
		}

		const staticData = this.getWorkflowStaticData('node');
		const { emit, state } = diffTransactions({
			state: staticData as Partial<DedupState>,
			txns,
			event,
			lookbackDays,
			emitExistingOnFirstRun: options.emitExistingOnFirstRun === true,
			nowMs: Date.now(),
		});
		staticData.seen = state.seen;
		staticData.initialized = state.initialized;

		return emit.length > 0 ? [this.helpers.returnJsonArray(emit)] : null;
	}
}
