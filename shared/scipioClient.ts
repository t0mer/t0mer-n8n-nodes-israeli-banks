import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	ILoadOptionsFunctions,
	INode,
	IPollFunctions,
} from 'n8n-workflow';

import type { CredentialsPayload } from './credentialsPayload';
import { connectionError, httpError } from './errors';

export type JobStatus = 'queued' | 'running' | 'waiting_for_otp' | 'succeeded' | 'failed';

export interface Job {
	jobId: string;
	companyId: string;
	status: JobStatus;
	createdAt: string;
	updatedAt: string;
	queuePosition?: number;
	progress: Array<{ type: string; at: string }>;
	error?: { code: string; message: string };
}

export interface Transaction {
	type: 'normal' | 'installments';
	identifier?: string | number;
	date: string;
	processedDate: string;
	originalAmount: number | null;
	originalCurrency: string;
	chargedAmount: number | null;
	chargedCurrency?: string;
	description: string;
	memo?: string;
	status: 'completed' | 'pending';
	installments?: { number: number; total: number };
	category?: string;
	rawTransaction?: unknown;
}

export interface Account {
	accountNumber: string;
	balance?: number | null;
	txns: Transaction[];
	[key: string]: unknown;
}

export interface ScrapeResult {
	success: boolean;
	accounts?: Account[];
	futureDebits?: IDataObject[];
	errorType?: string;
	errorMessage?: string;
	[key: string]: unknown;
}

export interface ScrapeOptions {
	startDate: string;
	combineInstallments?: boolean;
	futureMonthsToScrape?: number;
	additionalTransactionInformation?: boolean;
	includeRawTransaction?: boolean;
	optInFeatures?: string[];
}

export interface CompaniesResponse {
	companies: Array<{ companyId: string; name: string; loginFields: string[]; requiresTwoFactor: boolean }>;
	optInFeatures: string[];
}

export interface HttpResponse {
	statusCode: number;
	body: unknown;
}

/** Sends one request to Scipio. Must resolve for any HTTP status. */
export type Transport = (request: {
	method: IHttpRequestMethods;
	path: string;
	body?: IDataObject;
}) => Promise<HttpResponse>;

export interface ClientOptions {
	itemIndex?: number;
	/** Credential values to scrub from any error text. */
	secrets?: string[];
}

export class ScipioClient {
	constructor(
		private readonly transport: Transport,
		readonly node: INode,
		readonly options: ClientOptions = {},
	) {}

	private async call(
		method: IHttpRequestMethods,
		path: string,
		body?: IDataObject,
		allow: number[] = [],
	): Promise<HttpResponse> {
		const response = await this.transport({ method, path, body });
		if (response.statusCode >= 400 && !allow.includes(response.statusCode)) {
			throw httpError(this.node, response.statusCode, response.body, this.options);
		}
		return response;
	}

	async getCompanies(): Promise<CompaniesResponse> {
		return (await this.call('GET', '/api/v1/companies')).body as CompaniesResponse;
	}

	async createJob(credentials: CredentialsPayload, options: ScrapeOptions): Promise<{ jobId: string; status: JobStatus }> {
		const response = await this.call('POST', '/api/v1/jobs', {
			credentials,
			options: options as unknown as IDataObject,
		});
		return response.body as { jobId: string; status: JobStatus };
	}

	async getJob(jobId: string): Promise<Job> {
		return (await this.call('GET', `/api/v1/jobs/${encodeURIComponent(jobId)}`)).body as Job;
	}

	/** Returns null while the job is still running (HTTP 409). */
	async getResult(jobId: string): Promise<ScrapeResult | null> {
		const response = await this.call('GET', `/api/v1/jobs/${encodeURIComponent(jobId)}/result`, undefined, [409]);
		return response.statusCode === 409 ? null : (response.body as ScrapeResult);
	}

	async submitOtp(jobId: string, otpCode: string): Promise<void> {
		await this.call('POST', `/api/v1/jobs/${encodeURIComponent(jobId)}/otp`, { otpCode });
	}

	async deleteJob(jobId: string): Promise<void> {
		await this.call('DELETE', `/api/v1/jobs/${encodeURIComponent(jobId)}`);
	}

	async triggerTwoFactor(phoneNumber: string): Promise<{ success: boolean }> {
		const response = await this.call('POST', '/api/v1/2fa/trigger', { companyId: 'oneZero', phoneNumber });
		return response.body as { success: boolean };
	}

	async getLongTermToken(otpCode: string): Promise<{ longTermTwoFactorAuthToken: string }> {
		const response = await this.call('POST', '/api/v1/2fa/long-term-token', { companyId: 'oneZero', otpCode });
		return response.body as { longTermTwoFactorAuthToken: string };
	}

	async getVersion(): Promise<IDataObject> {
		return (await this.call('GET', '/version')).body as IDataObject;
	}
}

type Context = IExecuteFunctions | IPollFunctions | ILoadOptionsFunctions;

/** Builds a client that sends requests through n8n with the Scipio API credential. */
export async function createScipioClient(ctx: Context, options: ClientOptions = {}): Promise<ScipioClient> {
	const cred = await ctx.getCredentials('scipioApi');
	const baseURL = String(cred.baseUrl ?? '').replace(/\/+$/, '');
	const node = ctx.getNode();

	const transport: Transport = async ({ method, path, body }) => {
		try {
			const response = (await ctx.helpers.httpRequestWithAuthentication.call(ctx, 'scipioApi', {
				method,
				baseURL,
				url: path,
				body,
				json: true,
				returnFullResponse: true,
				ignoreHttpStatusErrors: true,
				skipSslCertificateValidation: cred.ignoreSslIssues === true,
			})) as { statusCode: number; body: unknown };
			return { statusCode: response.statusCode, body: response.body };
		} catch (error) {
			throw connectionError(node, error ?? {}, options);
		}
	};

	return new ScipioClient(transport, node, options);
}
