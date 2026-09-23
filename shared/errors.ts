import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import type { INode, JsonObject } from 'n8n-workflow';

/** Scraper error types Scipio can surface (israeli-bank-scrapers ScraperErrorTypes). */
export const ERROR_TYPES = [
	'INVALID_PASSWORD',
	'CHANGE_PASSWORD',
	'ACCOUNT_BLOCKED',
	'TIMEOUT',
	'GENERIC',
	'GENERAL_ERROR',
	'TWO_FACTOR_RETRIEVER_MISSING',
] as const;

export type ErrorType = (typeof ERROR_TYPES)[number];

const ERROR_TEXT: Record<ErrorType, { message: string; description: string }> = {
	INVALID_PASSWORD: {
		message: 'The bank rejected the login details',
		description: 'Check the Israeli Bank Account credential (username, ID, password, etc.).',
	},
	CHANGE_PASSWORD: {
		message: 'The bank requires a password change',
		description: "Log in via the bank's website, change the password, then update the credential.",
	},
	ACCOUNT_BLOCKED: {
		message: 'The bank account is blocked',
		description: "Contact the bank or unblock the account on the bank's website before retrying.",
	},
	TIMEOUT: {
		message: 'The scrape timed out',
		description:
			"The bank's site was slow or an OTP was not submitted in time. Try again later, or raise Scipio's timeouts.",
	},
	GENERIC: {
		message: 'The scrape failed',
		description: "Check the Scipio logs. The bank's site may have changed or be temporarily unavailable.",
	},
	GENERAL_ERROR: {
		message: 'The scrape failed with a general error',
		description: "Check the Scipio logs. The bank's site may have changed or be temporarily unavailable.",
	},
	TWO_FACTOR_RETRIEVER_MISSING: {
		message: 'The bank requires two-factor authentication',
		description:
			'For One Zero, get a long-term token with Two-Factor → Get Long-Term Token and paste it into the credential.',
	},
};

export function describeErrorType(errorType: string | undefined): { message: string; description: string } {
	return ERROR_TEXT[errorType as ErrorType] ?? ERROR_TEXT.GENERIC;
}

const SENSITIVE_KEY = /password|token|otp|id|card/i;
const REDACTED = '[redacted]';

/** Deep-copies a value, replacing every field whose name looks sensitive. */
export function redact(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(redact);
	if (value !== null && typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
			out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(inner);
		}
		return out;
	}
	return value;
}

/** Replaces every occurrence of a known secret value inside a string. */
export function scrub(text: string, secrets: string[] = []): string {
	let out = text;
	// Longest first, so a secret that contains another is replaced whole.
	for (const secret of [...secrets].sort((a, b) => b.length - a.length)) {
		if (secret) out = out.split(secret).join(REDACTED);
	}
	return out;
}

export interface ScrapeFailure {
	errorType?: string;
	errorMessage?: string;
	jobId?: string;
}

/** Error for a scrape that Scipio reported as failed. */
export function scrapeError(
	node: INode,
	failure: ScrapeFailure,
	options: { itemIndex?: number; secrets?: string[] } = {},
): NodeOperationError {
	const { message, description } = describeErrorType(failure.errorType);
	const detail = failure.errorMessage ? ` (${scrub(failure.errorMessage, options.secrets)})` : '';
	const error = new NodeOperationError(node, `${message}${detail}`, {
		description: failure.jobId ? `${description} Job ID: ${failure.jobId}` : description,
		itemIndex: options.itemIndex,
	});
	error.context.errorType = failure.errorType ?? 'GENERIC';
	if (failure.jobId) error.context.jobId = failure.jobId;
	return error;
}

/** Operation error that carries a job ID and optional error type in its context. */
export function jobError(
	node: INode,
	message: string,
	description: string,
	options: { jobId?: string; errorType?: string; itemIndex?: number },
): NodeOperationError {
	const error = new NodeOperationError(node, message, {
		description: options.jobId ? `${description} Job ID: ${options.jobId}` : description,
		itemIndex: options.itemIndex,
	});
	if (options.errorType) error.context.errorType = options.errorType;
	if (options.jobId) error.context.jobId = options.jobId;
	return error;
}

/** Error for a non-2xx Scipio response. The body is redacted before embedding. */
export function httpError(
	node: INode,
	statusCode: number,
	body: unknown,
	options: { itemIndex?: number; secrets?: string[] } = {},
): NodeApiError {
	const envelope = (body as { error?: { code?: unknown; message?: unknown; details?: unknown } } | undefined)
		?.error;
	const code = typeof envelope?.code === 'string' ? envelope.code : `HTTP_${statusCode}`;
	const rawMessage = typeof envelope?.message === 'string' ? envelope.message : `Scipio returned HTTP ${statusCode}`;
	const message = scrub(rawMessage, options.secrets);
	const details = envelope?.details === undefined ? undefined : redact(envelope.details);
	const safeDetails = details === undefined ? '' : scrub(JSON.stringify(details), options.secrets);

	const response: JsonObject = { code, message, httpCode: String(statusCode) };
	return new NodeApiError(node, response, {
		message: `Scipio error ${code}: ${message}`,
		description: safeDetails ? `Details: ${safeDetails}` : httpHint(statusCode, code),
		httpCode: String(statusCode),
		itemIndex: options.itemIndex,
	});
}

function httpHint(statusCode: number, code: string): string {
	if (statusCode === 401) return 'Check the API key in the Scipio API credential.';
	if (code === 'RATE_LIMITED') return 'Scipio rate-limited scrape requests. Poll less often or raise RATE_LIMIT_MAX on Scipio.';
	if (code === 'QUEUE_FULL') return 'Scipio has too many queued jobs. Try again later.';
	if (code === 'TWO_FACTOR_REQUIRED') {
		return 'One Zero needs an OTP Long-Term Token in the credential. For the interactive OTP flow (Job → Create), fill in Phone Number instead.';
	}
	if (statusCode === 504 && code === 'TIMEOUT') {
		// Scipio's own envelope: only the synchronous /scrape endpoint returns this.
		return "Scipio's synchronous scrape limit (SYNC_SCRAPE_TIMEOUT_SECONDS) was reached. Use Scrape Method: Async Job instead.";
	}
	if (statusCode === 502 || statusCode === 503 || statusCode === 504) {
		return 'A proxy or gateway between n8n and Scipio failed or timed out. Check it, or use Scrape Method: Async Job, which only makes short requests.';
	}
	if (statusCode === 404) return 'The job or route was not found. Jobs expire from Scipio after their result TTL.';
	return 'See the Scipio logs for more detail.';
}

const NETWORK_CODES = /^(ECONN\w+|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|ETIMEDOUT|EPIPE|ESOCKETTIMEDOUT|CERT_\w+|\w*_CERT_\w*|DEPTH_ZERO_SELF_SIGNED_CERT|ERR_TLS_\w+)$/;

/** Error for a failed request with no HTTP response. Never embeds the request. */
export function connectionError(
	node: INode,
	cause: { message?: unknown; code?: unknown; httpCode?: unknown },
	options: { itemIndex?: number; secrets?: string[]; timeoutMs?: number } = {},
): NodeApiError {
	// n8n reports an axios timeout as "connection aborted"; the code survives in httpCode.
	const aborted = [cause.code, cause.httpCode].some((c) => c === 'ECONNABORTED' || c === 'ETIMEDOUT');
	if (options.timeoutMs && aborted) {
		const seconds = Math.round(options.timeoutMs / 1000);
		const error = new NodeApiError(
			node,
			{ code: 'TIMEOUT', message: `No response from Scipio within ${seconds} seconds` },
			{
				message: `Scipio did not respond within ${seconds} seconds (Max Wait Seconds)`,
				description:
					'The scrape may still be running on Scipio, so retrying right away starts a second bank login. ' +
					'Raise Max Wait Seconds above Scipio\'s SYNC_SCRAPE_TIMEOUT_SECONDS, or use Scrape Method: Async Job.',
				itemIndex: options.itemIndex,
			},
		);
		error.context.errorType = 'TIMEOUT';
		return error;
	}
	const message = scrub(typeof cause.message === 'string' ? cause.message : 'Request to Scipio failed', options.secrets);
	const codes = [cause.code, cause.httpCode].filter((c): c is string => typeof c === 'string');
	const network = codes.find((c) => NETWORK_CODES.test(c));
	if (!network) {
		// Not a network failure (e.g. n8n rejected the request before sending it): show it as-is.
		return new NodeApiError(
			node,
			{ code: codes[0] ?? 'REQUEST_FAILED', message },
			{
				message: `Request to Scipio failed: ${message}`,
				description: 'n8n could not complete the request to Scipio. See the message above.',
				itemIndex: options.itemIndex,
			},
		);
	}
	return new NodeApiError(
		node,
		{ code: network, message },
		{
			message: `Could not reach Scipio: ${message}`,
			description: 'Check the Base URL in the Scipio API credential and that the Scipio container is running.',
			itemIndex: options.itemIndex,
		},
	);
}
