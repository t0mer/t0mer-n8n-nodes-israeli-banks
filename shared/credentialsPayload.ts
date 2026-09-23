import { getCompany } from './companies';

export type BankCredentialData = Record<string, unknown>;

export interface CredentialsPayload {
	companyId: string;
	[field: string]: string;
}

function str(value: unknown): string {
	return typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);
}

/**
 * Builds the `credentials` object Scipio expects for the selected company.
 * Only the fields that company uses are included; everything else is dropped,
 * because Scipio rejects unknown properties.
 *
 * Throws a plain message string (caller wraps it in a NodeOperationError).
 */
export function buildCredentialsPayload(cred: BankCredentialData): CredentialsPayload {
	const companyId = str(cred.companyId);
	const company = getCompany(companyId);
	if (!company) {
		throw new TypeError(`Unsupported company "${companyId}" in the Israeli Bank Account credential`);
	}

	const payload: CredentialsPayload = { companyId };
	const missing: string[] = [];

	for (const field of company.fields) {
		const value = str(cred[field]);
		if (value === '') missing.push(field);
		else payload[field] = value;
	}

	if (company.id === 'oneZero') {
		// A long-term token wins; otherwise Scipio needs the phone number to
		// start the interactive OTP flow.
		const token = str(cred.otpLongTermToken);
		const phone = str(cred.phoneNumber);
		if (token !== '') payload.otpLongTermToken = token;
		else if (phone !== '') payload.phoneNumber = phone;
		else missing.push('otpLongTermToken or phoneNumber');
	}

	if (missing.length > 0) {
		throw new TypeError(
			`The Israeli Bank Account credential for "${company.name}" is missing: ${missing.join(', ')}`,
		);
	}

	return payload;
}

/** All non-empty credential values, used to scrub them from any error text. */
export function secretValues(cred: BankCredentialData): string[] {
	return Object.entries(cred)
		.filter(([key]) => key !== 'companyId')
		.map(([, value]) => str(value))
		.filter((value) => value.length >= 3);
}
