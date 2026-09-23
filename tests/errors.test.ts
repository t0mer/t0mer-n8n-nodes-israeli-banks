import { describe, expect, it } from 'vitest';

import { connectionError, describeErrorType, ERROR_TYPES, httpError, redact, scrapeError, scrub } from '../shared/errors';
import { runScrapeJob } from '../shared/jobRunner';
import { fakeClient, fakeNode, job, ok } from './helpers';

const CANARY = 'CANARY-SECRET';

function everything(error: { message?: string; description?: string | null; context?: unknown }): string {
	return JSON.stringify([error.message, error.description, error.context, String(error)]);
}

describe('describeErrorType', () => {
	for (const errorType of ERROR_TYPES) {
		it(`maps ${errorType} to a message and a hint`, () => {
			const text = describeErrorType(errorType);
			expect(text.message.length).toBeGreaterThan(5);
			expect(text.description.length).toBeGreaterThan(10);
		});
	}

	it('has distinct guidance for the key cases', () => {
		expect(describeErrorType('INVALID_PASSWORD').description).toContain('Israeli Bank Account credential');
		expect(describeErrorType('CHANGE_PASSWORD').description).toContain("bank's website");
	});

	it('falls back to GENERIC for unknown types', () => {
		expect(describeErrorType('SOMETHING_NEW')).toEqual(describeErrorType('GENERIC'));
		expect(describeErrorType(undefined)).toEqual(describeErrorType('GENERIC'));
	});
});

describe('redact / scrub', () => {
	it('redacts sensitive keys at any depth', () => {
		const out = redact({
			password: CANARY,
			nested: [{ otpLongTermToken: CANARY, card6Digits: CANARY, id: CANARY, companyId: 'max', fine: 'ok' }],
		});
		expect(JSON.stringify(out)).not.toContain(CANARY);
		expect(JSON.stringify(out)).toContain('"fine":"ok"');
	});

	it('scrubs known secret values from text', () => {
		expect(scrub(`login failed for ${CANARY}!`, [CANARY])).toBe('login failed for [redacted]!');
	});

	it('scrubs a secret that contains a shorter one completely', () => {
		const out = scrub('user tomerk password tomerk!2026', ['tomerk', 'tomerk!2026']);
		expect(out).toBe('user [redacted] password [redacted]');
	});
});

describe('redaction canary', () => {
	it('never leaks from an HTTP error body', () => {
		const error = httpError(
			fakeNode,
			400,
			{
				error: {
					code: 'VALIDATION',
					message: `body/credentials/password must match, got ${CANARY}`,
					details: [{ password: CANARY, instancePath: '/credentials/password' }],
				},
			},
			{ secrets: [CANARY] },
		);
		expect(everything(error)).not.toContain(CANARY);
		expect(error.message).toContain('VALIDATION');
	});

	it('never leaks from a scrape failure message', () => {
		const error = scrapeError(fakeNode, { errorType: 'INVALID_PASSWORD', errorMessage: `wrong ${CANARY}`, jobId: 'j' }, { secrets: [CANARY] });
		expect(everything(error)).not.toContain(CANARY);
	});

	it('never leaks from a connection error', () => {
		const error = connectionError(fakeNode, { message: `ECONNREFUSED while sending ${CANARY}`, code: 'ECONNREFUSED' }, { secrets: [CANARY] });
		expect(everything(error)).not.toContain(CANARY);
	});

	it('never leaks through the job runner', async () => {
		const { client } = fakeClient(
			{
				'POST /api/v1/jobs': { statusCode: 202, body: { jobId: 'job-1', status: 'queued' } },
				'GET /api/v1/jobs/job-1': job('succeeded'),
				'GET /api/v1/jobs/job-1/result': ok({ success: false, errorType: 'GENERIC', errorMessage: `crash: password=${CANARY}`, password: CANARY }),
			},
			{ secrets: [CANARY] },
		);
		const error = await runScrapeJob(client, { companyId: 'leumi', username: 'u', password: CANARY }, { startDate: '2026-09-01' }, {
			maxWaitSeconds: 10,
			pollIntervalSeconds: 2,
		}).catch((e: Error) => e);
		expect(everything(error as never)).not.toContain(CANARY);
	});
});
