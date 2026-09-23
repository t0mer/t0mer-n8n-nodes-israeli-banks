import { describe, expect, it } from 'vitest';

import { COMPANIES } from '../shared/companies';
import { buildCredentialsPayload, secretValues } from '../shared/credentialsPayload';

const ALL_FIELDS = {
	userCode: 'U1',
	username: 'user',
	id: '123456789',
	num: 'N1',
	card6Digits: '123456',
	nationalID: '987654321',
	email: 'me@example.com',
	phoneNumber: '+972500000000',
	otpLongTermToken: 'long-term',
	password: 'pw',
	unrelated: 'dropped',
};

const EXPECTED: Record<string, string[]> = {
	hapoalim: ['userCode', 'password'],
	leumi: ['username', 'password'],
	mizrahi: ['username', 'password'],
	otsarHahayal: ['username', 'password'],
	max: ['username', 'password'],
	visaCal: ['username', 'password'],
	union: ['username', 'password'],
	beinleumi: ['username', 'password'],
	massad: ['username', 'password'],
	pagi: ['username', 'password'],
	yahav: ['username', 'nationalID', 'password'],
	discount: ['id', 'password', 'num'],
	mercantile: ['id', 'password', 'num'],
	isracard: ['id', 'card6Digits', 'password'],
	amex: ['id', 'card6Digits', 'password'],
	beyahadBishvilha: ['id', 'password'],
	behatsdaa: ['id', 'password'],
	oneZero: ['email', 'password', 'otpLongTermToken'],
};

describe('buildCredentialsPayload', () => {
	it('covers every company', () => {
		expect(Object.keys(EXPECTED).sort()).toEqual(COMPANIES.map((c) => c.id).sort());
	});

	for (const [companyId, fields] of Object.entries(EXPECTED)) {
		it(`sends only the ${companyId} fields`, () => {
			const payload = buildCredentialsPayload({ ...ALL_FIELDS, companyId });
			expect(Object.keys(payload).sort()).toEqual(['companyId', ...fields].sort());
			expect(payload.companyId).toBe(companyId);
			for (const field of fields) expect(payload[field]).toBe(ALL_FIELDS[field as keyof typeof ALL_FIELDS]);
		});
	}

	it('uses the phone number for One Zero when there is no long-term token', () => {
		const payload = buildCredentialsPayload({ ...ALL_FIELDS, companyId: 'oneZero', otpLongTermToken: '' });
		expect(payload).toEqual({ companyId: 'oneZero', email: 'me@example.com', password: 'pw', phoneNumber: '+972500000000' });
	});

	it('requires a token or phone number for One Zero', () => {
		expect(() =>
			buildCredentialsPayload({ companyId: 'oneZero', email: 'a@b.c', password: 'pw', phoneNumber: '', otpLongTermToken: '' }),
		).toThrow(/otpLongTermToken or phoneNumber/);
	});

	it('names missing fields without echoing values', () => {
		expect(() => buildCredentialsPayload({ companyId: 'isracard', id: '1', password: 'CANARY-SECRET' })).toThrow(
			/missing: card6Digits/,
		);
		try {
			buildCredentialsPayload({ companyId: 'isracard', id: '1', password: 'CANARY-SECRET' });
		} catch (error) {
			expect(String(error)).not.toContain('CANARY-SECRET');
		}
	});

	it('rejects an unknown company', () => {
		expect(() => buildCredentialsPayload({ companyId: 'nope' })).toThrow(/Unsupported company/);
	});
});

describe('secretValues', () => {
	it('returns non-empty values except the company ID', () => {
		expect(secretValues({ companyId: 'leumi', username: 'user', password: 'pw123', empty: '' })).toEqual([
			'user',
			'pw123',
		]);
	});
});
