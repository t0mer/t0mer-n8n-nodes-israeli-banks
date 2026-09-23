import { sleep as n8nSleep } from 'n8n-workflow';

import type { CredentialsPayload } from './credentialsPayload';
import { jobError, scrapeError } from './errors';
import type { ScipioClient, ScrapeOptions, ScrapeResult } from './scipioClient';

export interface RunJobOptions {
	maxWaitSeconds: number;
	pollIntervalSeconds: number;
	/** Injected for tests. */
	sleep?: (ms: number) => Promise<void>;
	now?: () => number;
}

async function cancelQuietly(client: ScipioClient, jobId: string): Promise<void> {
	try {
		await client.deleteJob(jobId);
	} catch {
		// Best effort: the job may already be gone.
	}
}

export interface JobOutcome {
	jobId: string;
	result: ScrapeResult;
}

/**
 * Creates a Scipio job, polls until it finishes, and returns a successful
 * result. Throws a NodeOperationError (carrying the job ID) for scrape
 * failures, OTP prompts and timeouts.
 */
export async function runScrapeJob(
	client: ScipioClient,
	credentials: CredentialsPayload,
	scrapeOptions: ScrapeOptions,
	options: RunJobOptions,
): Promise<JobOutcome> {
	const sleep = options.sleep ?? n8nSleep;
	const now = options.now ?? Date.now;
	const intervalMs = Math.max(2, options.pollIntervalSeconds) * 1000;
	const deadline = now() + Math.max(1, options.maxWaitSeconds) * 1000;
	const errorOptions = { itemIndex: client.options.itemIndex, secrets: client.options.secrets };

	const { jobId } = await client.createJob(credentials, scrapeOptions);

	for (;;) {
		const job = await client.getJob(jobId);

		if (job.status === 'waiting_for_otp') {
			// Nobody can submit the OTP to this job, and it holds a Scipio browser slot.
			await cancelQuietly(client, jobId);
			throw jobError(
				client.node,
				'The bank is waiting for a one-time password (OTP)',
				'The job was cancelled. Use the Job resource instead: Job → Create, then a Wait node, then Job → Submit OTP and Job → Get Result. ' +
					'For One Zero you can avoid OTP prompts by storing a long-term token in the credential (Two-Factor → Get Long-Term Token).',
				{ ...errorOptions, jobId, errorType: 'TWO_FACTOR_RETRIEVER_MISSING' },
			);
		}

		if (job.status === 'succeeded' || job.status === 'failed') {
			const result = await client.getResult(jobId);
			if (result) {
				if (!result.success) {
					throw scrapeError(
						client.node,
						{ errorType: result.errorType, errorMessage: result.errorMessage, jobId },
						errorOptions,
					);
				}
				return { jobId, result };
			}
			if (job.status === 'failed') {
				throw scrapeError(
					client.node,
					{ errorType: job.error?.code, errorMessage: job.error?.message, jobId },
					errorOptions,
				);
			}
			// Result not stored yet (409): keep polling.
		}

		if (now() + intervalMs > deadline) break;
		await sleep(intervalMs);
	}

	await cancelQuietly(client, jobId);
	throw jobError(
		client.node,
		`The scrape did not finish within ${options.maxWaitSeconds} seconds`,
		'The job was cancelled. Raise "Max Wait Seconds" in the options, or check the Scipio queue and logs.',
		{ ...errorOptions, jobId, errorType: 'TIMEOUT' },
	);
}
