import { describe, expect, it } from 'vitest';

import { COMPANIES } from '../shared/companies';
import fixture from './fixtures/companies.json';

// Fields the library lists that are not credential fields.
const NON_CREDENTIAL_FIELDS = ['otpCodeRetriever'];

describe('companies list', () => {
	it('matches the company IDs Scipio serves', () => {
		expect(COMPANIES.map((c) => c.id).sort()).toEqual(fixture.companies.map((c) => c.companyId).sort());
	});

	for (const remote of fixture.companies) {
		it(`has the same login fields as Scipio for ${remote.companyId}`, () => {
			const local = COMPANIES.find((c) => c.id === remote.companyId);
			const localFields = [...(local?.fields ?? []), ...(local?.optionalFields ?? [])].sort();
			const remoteFields = remote.loginFields.filter((f) => !NON_CREDENTIAL_FIELDS.includes(f)).sort();
			expect(localFields).toEqual(remoteFields);
		});
	}

	it('has unique IDs and an English name for each company', () => {
		expect(new Set(COMPANIES.map((c) => c.id)).size).toBe(COMPANIES.length);
		for (const company of COMPANIES) expect(company.name).toMatch(/^[A-Za-z]/);
	});
});
