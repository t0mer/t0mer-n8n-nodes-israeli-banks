import { describe, expect, it } from 'vitest';

import type { CredentialsPayload } from '../shared/credentialsPayload';
import { runScrapeJob } from '../shared/jobRunner';
import { fakeClient, job, ok, sampleResult } from './helpers';
import type { Routes } from './helpers';

const credentials: CredentialsPayload = { companyId: 'leumi', username: 'user', password: 'pw' };
const scrapeOptions = { startDate: '2026-09-01' };

/** A virtual clock: sleep advances time instantly. */
function clock() {
	let time = 0;
	const sleeps: number[] = [];
	return {
		now: () => time,
		sleep: async (ms: number) => {
			sleeps.push(ms);
			time += ms;
		},
		sleeps,
	};
}

const created = { statusCode: 202, body: { jobId: 'job-1', status: 'queued' } };

function run(routes: Routes, maxWaitSeconds = 60, pollIntervalSeconds = 5) {
	const { client, calls } = fakeClient({ 'POST /api/v1/jobs': created, ...routes });
	const c = clock();
	const promise = runScrapeJob(client, credentials, scrapeOptions, {
		maxWaitSeconds,
		pollIntervalSeconds,
		sleep: c.sleep,
		now: c.now,
	});
	return { promise, calls, clock: c };
}

describe('runScrapeJob', () => {
	it('polls until succeeded and returns the result', async () => {
		const { promise, calls, clock: c } = run({
			'GET /api/v1/jobs/job-1': [job('queued', { queuePosition: 0 }), job('running'), job('succeeded')],
			'GET /api/v1/jobs/job-1/result': ok(sampleResult),
		});
		const outcome = await promise;
		expect(outcome.jobId).toBe('job-1');
		expect(outcome.result.accounts).toHaveLength(2);
		expect(calls[0]).toEqual({ method: 'POST', path: '/api/v1/jobs', body: { credentials, options: scrapeOptions } });
		expect(c.sleeps).toEqual([5000, 5000]);
	});

	it('throws a mapped error when the scrape failed (job succeeded, success=false)', async () => {
		const { promise } = run({
			'GET /api/v1/jobs/job-1': job('succeeded'),
			'GET /api/v1/jobs/job-1/result': ok({ success: false, errorType: 'INVALID_PASSWORD', errorMessage: 'bad login' }),
		});
		await expect(promise).rejects.toMatchObject({
			message: expect.stringContaining('rejected the login'),
			description: expect.stringContaining('Israeli Bank Account credential'),
			context: expect.objectContaining({ errorType: 'INVALID_PASSWORD', jobId: 'job-1' }),
		});
	});

	it('throws on a failed job', async () => {
		const { promise } = run({
			'GET /api/v1/jobs/job-1': job('failed', { error: { code: 'TIMEOUT', message: 'nav timeout' } }),
			'GET /api/v1/jobs/job-1/result': ok({ success: false, errorType: 'TIMEOUT', errorMessage: 'nav timeout' }),
		});
		await expect(promise).rejects.toMatchObject({ context: expect.objectContaining({ errorType: 'TIMEOUT', jobId: 'job-1' }) });
	});

	it('cancels the job and explains the OTP flow when the job waits for an OTP', async () => {
		const { promise, calls } = run({
			'GET /api/v1/jobs/job-1': job('waiting_for_otp'),
			'DELETE /api/v1/jobs/job-1': { statusCode: 204, body: '' },
		});
		await expect(promise).rejects.toMatchObject({
			message: expect.stringContaining('one-time password'),
			description: expect.stringMatching(/Submit OTP[\s\S]*job-1/),
			context: expect.objectContaining({ jobId: 'job-1' }),
		});
		expect(calls[calls.length - 1]).toMatchObject({ method: 'DELETE', path: '/api/v1/jobs/job-1' });
	});

	it('cancels the job and throws on timeout', async () => {
		const { promise, calls } = run(
			{ 'GET /api/v1/jobs/job-1': job('running'), 'DELETE /api/v1/jobs/job-1': { statusCode: 204, body: '' } },
			12,
			5,
		);
		await expect(promise).rejects.toMatchObject({
			message: expect.stringContaining('12 seconds'),
			context: expect.objectContaining({ errorType: 'TIMEOUT', jobId: 'job-1' }),
		});
		expect(calls[calls.length - 1]).toMatchObject({ method: 'DELETE', path: '/api/v1/jobs/job-1' });
		expect(calls.filter((c) => c.path === '/api/v1/jobs/job-1' && c.method === 'GET')).toHaveLength(3);
	});

	it('still throws the timeout when the cleanup DELETE fails', async () => {
		const { promise } = run({ 'GET /api/v1/jobs/job-1': job('running') }, 5, 5);
		await expect(promise).rejects.toMatchObject({ context: expect.objectContaining({ errorType: 'TIMEOUT' }) });
	});

	it('keeps polling when the result is not ready yet (409)', async () => {
		const { promise, calls } = run({
			'GET /api/v1/jobs/job-1': job('succeeded'),
			'GET /api/v1/jobs/job-1/result': [
				{ statusCode: 409, body: { error: { code: 'NOT_READY', message: 'Job result is not ready yet.' } } },
				ok(sampleResult),
			],
		});
		await expect(promise).resolves.toMatchObject({ jobId: 'job-1' });
		expect(calls.filter((c) => c.path.endsWith('/result'))).toHaveLength(2);
	});

	it('surfaces HTTP errors from job creation', async () => {
		const { client } = fakeClient({
			'POST /api/v1/jobs': { statusCode: 429, body: { error: { code: 'RATE_LIMITED', message: 'Too many requests.' } } },
		});
		await expect(
			runScrapeJob(client, credentials, scrapeOptions, { maxWaitSeconds: 10, pollIntervalSeconds: 2 }),
		).rejects.toMatchObject({ message: expect.stringContaining('RATE_LIMITED'), httpCode: '429' });
	});

	it('clamps the poll interval to at least 2 seconds', async () => {
		const { promise, clock: c } = run(
			{ 'GET /api/v1/jobs/job-1': [job('running'), job('succeeded')], 'GET /api/v1/jobs/job-1/result': ok(sampleResult) },
			60,
			0,
		);
		await promise;
		expect(c.sleeps).toEqual([2000]);
	});
});
