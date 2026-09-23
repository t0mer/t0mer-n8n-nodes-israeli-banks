import type { ICredentialType, INodeProperties } from 'n8n-workflow';

import { COMPANIES, companiesUsingField } from '../shared/companies';
import type { CredentialField } from '../shared/companies';

function field(name: CredentialField, props: Omit<INodeProperties, 'name' | 'type' | 'default'>): INodeProperties {
	return {
		name,
		type: 'string',
		default: '',
		displayOptions: { show: { companyId: companiesUsingField(name) } },
		...props,
	};
}

/**
 * One bank or credit-card login. There is no credential test on purpose: a
 * real test would log in to the bank, which is slow, may send an SMS, and can
 * lock the account after repeated attempts.
 */
export class IsraeliBankAccountApi implements ICredentialType {
	name = 'israeliBankAccountApi';

	displayName = 'Israeli Bank Account API';

	icon = {
		light: 'file:../nodes/IsraeliBank/israeliBank.svg',
		dark: 'file:../nodes/IsraeliBank/israeliBank.dark.svg',
	} as const;

	documentationUrl = 'https://github.com/t0mer/n8n-nodes-israeli-banks#israeli-bank-account-credential';

	properties: INodeProperties[] = [
		{
			displayName: 'Bank or Card Company',
			name: 'companyId',
			type: 'options',
			options: [...COMPANIES]
				.sort((a, b) => a.name.localeCompare(b.name))
				.map((c) => ({ name: c.name, value: c.id, description: `${c.name} (${c.hebrewName})` })),
			default: 'hapoalim',
			required: true,
		},
		field('userCode', { displayName: 'User Code', required: true }),
		field('username', { displayName: 'Username', required: true }),
		field('id', { displayName: 'ID Number', description: 'Israeli ID number (Teudat Zehut)', typeOptions: { password: true }, required: true }),
		field('num', { displayName: 'User Identification Code', description: 'The "num" code shown on the bank login page', required: true }),
		field('card6Digits', { displayName: 'Card Last 6 Digits', typeOptions: { password: true }, required: true }),
		field('nationalID', { displayName: 'National ID', typeOptions: { password: true }, required: true }),
		field('email', { displayName: 'Email', placeholder: 'name@email.com', required: true }),
		field('phoneNumber', {
			displayName: 'Phone Number',
			placeholder: 'e.g. +972501234567',
			description: 'Used by Two-Factor → Send OTP. Needed only if you have no long-term token yet.',
		}),
		field('otpLongTermToken', {
			displayName: 'OTP Long-Term Token',
			typeOptions: { password: true },
			description: 'Get it with the Israeli Bank node: Two-Factor → Send OTP, then Two-Factor → Get Long-Term Token',
		}),
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
		},
	];
}
