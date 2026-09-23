import { NodeOperationError } from 'n8n-workflow';
import type {
	ICredentialDataDecryptedObject,
	ICredentialsDecrypted,
	ICredentialTestFunctions,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeCredentialTestResult,
	INodePropertyOptions,
	IPollFunctions,
} from 'n8n-workflow';

import { buildCredentialsPayload, secretValues } from './credentialsPayload';
import type { CredentialsPayload } from './credentialsPayload';
import { createScipioClient } from './scipioClient';

export interface BankCredential {
	raw: ICredentialDataDecryptedObject;
	payload: CredentialsPayload;
	secrets: string[];
}

/** Loads the Israeli Bank Account credential and builds the Scipio payload. */
export async function getBankCredential(
	ctx: IExecuteFunctions | IPollFunctions,
	itemIndex?: number,
): Promise<BankCredential> {
	const raw = await ctx.getCredentials('israeliBankAccountApi', itemIndex);
	try {
		return { raw, payload: buildCredentialsPayload(raw), secrets: secretValues(raw) };
	} catch (error) {
		throw new NodeOperationError(ctx.getNode(), (error as Error).message, {
			description: 'Open the Israeli Bank Account credential and fill in the fields for the selected company.',
			itemIndex,
		});
	}
}

/** loadOptions: opt-in features, as advertised by Scipio's /companies. */
export async function getOptInFeatures(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const client = await createScipioClient(this);
	const { optInFeatures = [] } = await client.getCompanies();
	return optInFeatures.map((feature) => {
		const [company] = feature.split(':');
		return {
			name: company.startsWith('mizrahi') ? `${feature} (Mizrahi Only)` : feature,
			value: feature,
			description: `Only affects ${company}`,
		};
	});
}

/**
 * Local-only check of the bank credential. Deliberately does not log in to
 * the bank: that is slow, may send an SMS, and can lock the account.
 */
export async function israeliBankAccountTest(
	this: ICredentialTestFunctions,
	credential: ICredentialsDecrypted,
): Promise<INodeCredentialTestResult> {
	try {
		buildCredentialsPayload(credential.data ?? {});
	} catch (error) {
		return { status: 'Error', message: (error as Error).message };
	}
	return {
		status: 'OK',
		message: 'All required fields are filled in. The bank login itself is not tested.',
	};
}
