/**
 * Companies supported by Scipio (and israeli-bank-scrapers), with the login
 * fields each one needs. Shared by the credential form and the nodes.
 * Keep in sync with Scipio's GET /api/v1/companies (see tests/fixtures).
 */

export type CredentialField =
	| 'userCode'
	| 'username'
	| 'id'
	| 'num'
	| 'card6Digits'
	| 'nationalID'
	| 'email'
	| 'phoneNumber'
	| 'otpLongTermToken'
	| 'password';

export interface Company {
	id: string;
	name: string;
	hebrewName: string;
	/** Fields that must be sent to Scipio. */
	fields: CredentialField[];
	/** Fields that are sent only when filled in. */
	optionalFields?: CredentialField[];
}

export const COMPANIES: Company[] = [
	{ id: 'amex', name: 'Amex Israel', hebrewName: 'אמריקן אקספרס', fields: ['id', 'card6Digits', 'password'] },
	{ id: 'behatsdaa', name: 'Behatsdaa', hebrewName: 'בהצדעה', fields: ['id', 'password'] },
	{ id: 'beinleumi', name: 'First International (Beinleumi)', hebrewName: 'הבינלאומי', fields: ['username', 'password'] },
	{ id: 'beyahadBishvilha', name: 'Beyahad Bishvilha', hebrewName: 'ביחד בשבילך', fields: ['id', 'password'] },
	{ id: 'discount', name: 'Discount Bank', hebrewName: 'דיסקונט', fields: ['id', 'password', 'num'] },
	{ id: 'hapoalim', name: 'Bank Hapoalim', hebrewName: 'הפועלים', fields: ['userCode', 'password'] },
	{ id: 'isracard', name: 'Isracard', hebrewName: 'ישראכרט', fields: ['id', 'card6Digits', 'password'] },
	{ id: 'leumi', name: 'Bank Leumi', hebrewName: 'לאומי', fields: ['username', 'password'] },
	{ id: 'massad', name: 'Massad', hebrewName: 'מסד', fields: ['username', 'password'] },
	{ id: 'max', name: 'Max', hebrewName: 'מקס', fields: ['username', 'password'] },
	{ id: 'mercantile', name: 'Mercantile Bank', hebrewName: 'מרכנתיל', fields: ['id', 'password', 'num'] },
	{ id: 'mizrahi', name: 'Mizrahi Tefahot', hebrewName: 'מזרחי טפחות', fields: ['username', 'password'] },
	{
		id: 'oneZero',
		name: 'One Zero (Experimental, 2FA)',
		hebrewName: 'וואן זירו',
		fields: ['email', 'password'],
		optionalFields: ['phoneNumber', 'otpLongTermToken'],
	},
	{ id: 'otsarHahayal', name: 'Otsar Hahayal', hebrewName: 'אוצר החייל', fields: ['username', 'password'] },
	{ id: 'pagi', name: 'Pagi', hebrewName: 'פאג"י', fields: ['username', 'password'] },
	{ id: 'union', name: 'Union Bank', hebrewName: 'איגוד', fields: ['username', 'password'] },
	{ id: 'visaCal', name: 'Visa Cal', hebrewName: 'כאל', fields: ['username', 'password'] },
	{ id: 'yahav', name: 'Bank Yahav', hebrewName: 'יהב', fields: ['username', 'nationalID', 'password'] },
];

export const COMPANY_IDS = COMPANIES.map((c) => c.id);

export function getCompany(companyId: string): Company | undefined {
	return COMPANIES.find((c) => c.id === companyId);
}

/** Company IDs whose credential form shows the given field. */
export function companiesUsingField(field: CredentialField): string[] {
	return COMPANIES.filter(
		(c) => c.fields.includes(field) || (c.optionalFields ?? []).includes(field),
	).map((c) => c.id);
}
