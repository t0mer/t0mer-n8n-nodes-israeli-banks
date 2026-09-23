import type { IDataObject, IExecuteFunctions, IHttpRequestOptions, IPollFunctions } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';

import { IsraeliBank } from '../nodes/IsraeliBank/IsraeliBank.node';
import { IsraeliBankTrigger } from '../nodes/IsraeliBankTrigger/IsraeliBankTrigger.node';
import { fakeNode, sampleResult } from './helpers';

const CANARY = 'CANARY-SECRET';

type Responder = (request: IHttpRequestOptions) => { statusCode: number; body: unknown };

function scipio(result: unknown): Responder {
	return ({ method, url }) => {
		if (method === 'POST' && url === '/api/v1/jobs') return { statusCode: 202, body: { jobId: 'job-1', status: 'queued' } };
		if (url === '/api/v1/jobs/job-1') return { statusCode: 200, body: { jobId: 'job-1', status: 'succeeded', progress: [] } };
		if (url === '/api/v1/jobs/job-1/result') return { statusCode: 200, body: result };
		return { statusCode: 404, body: { error: { code: 'NOT_FOUND', message: 'nope' } } };
	};
}

const credentials: Record<string, IDataObject> = {
	scipioApi: { baseUrl: 'http://scipio:8080/', apiKey: '', ignoreSslIssues: false },
	israeliBankAccountApi: { companyId: 'leumi', username: 'user', password: CANARY },
};

function baseContext(params: IDataObject, respond: Responder, requests: IHttpRequestOptions[]) {
	return {
		getNode: () => fakeNode,
		getCredentials: async (type: string) => credentials[type],
		helpers: {
			httpRequestWithAuthentication: async (_type: string, request: IHttpRequestOptions) => {
				requests.push(request);
				return respond(request);
			},
			returnJsonArray: (data: IDataObject[]) => data.map((json) => ({ json })),
		},
		params,
	};
}

function executeContext(params: IDataObject, respond: Responder, continueOnFail = false) {
	const requests: IHttpRequestOptions[] = [];
	const base = baseContext(params, respond, requests);
	const ctx = {
		...base,
		getInputData: () => [{ json: {} }],
		getNodeParameter: (name: string, _i: number, fallback?: unknown) => (name in params ? params[name] : fallback),
		continueOnFail: () => continueOnFail,
		addExecutionHints: () => undefined,
	};
	return { ctx: ctx as unknown as IExecuteFunctions, requests };
}

function pollContext(params: IDataObject, respond: Responder, mode: string, staticData: IDataObject) {
	const requests: IHttpRequestOptions[] = [];
	const base = baseContext(params, respond, requests);
	const ctx = {
		...base,
		getNodeParameter: (name: string, fallback?: unknown) => (name in params ? params[name] : fallback),
		getMode: () => mode,
		getWorkflowStaticData: () => staticData,
	};
	return { ctx: ctx as unknown as IPollFunctions, requests };
}

const getManyParams = {
	resource: 'transaction',
	operation: 'getAll',
	startDateMode: 'fixedDate',
	startDate: '2026-09-01T00:00:00',
	outputMode: 'transactions',
	statusFilter: 'completed',
	options: { combineInstallments: true, maxWaitSeconds: 30 },
};

describe('IsraeliBank node', () => {
	it('runs Transaction → Get Many end to end', async () => {
		const { ctx, requests } = executeContext(getManyParams, scipio(sampleResult));
		const [items] = await new IsraeliBank().execute.call(ctx);
		expect(items).toHaveLength(2);
		for (const item of items) expect(item.pairedItem).toEqual({ item: 0 });
		expect(items[0].json).toMatchObject({ companyId: 'leumi', accountNumber: '12-345-678', status: 'completed' });

		expect(requests[0]).toMatchObject({
			method: 'POST',
			baseURL: 'http://scipio:8080',
			url: '/api/v1/jobs',
			body: {
				credentials: { companyId: 'leumi', username: 'user', password: CANARY },
				options: { startDate: '2026-09-01', combineInstallments: true },
			},
		});
	});

	it('emits a sanitized error item with continueOnFail', async () => {
		const failed = { success: false, errorType: 'INVALID_PASSWORD', errorMessage: `bad password ${CANARY}`, password: CANARY };
		const { ctx } = executeContext(getManyParams, scipio(failed), true);
		const [items] = await new IsraeliBank().execute.call(ctx);
		expect(items).toHaveLength(1);
		expect(items[0].json).toMatchObject({ errorType: 'INVALID_PASSWORD', jobId: 'job-1' });
		expect(items[0].pairedItem).toEqual({ item: 0 });
		expect(JSON.stringify(items)).not.toContain(CANARY);
	});

	it('throws with the item index when continueOnFail is off', async () => {
		const failed = { success: false, errorType: 'CHANGE_PASSWORD' };
		const { ctx } = executeContext(getManyParams, scipio(failed));
		await expect(new IsraeliBank().execute.call(ctx)).rejects.toMatchObject({
			context: expect.objectContaining({ itemIndex: 0, errorType: 'CHANGE_PASSWORD' }),
		});
	});

	it('reports a clear error when Job → Get Result is not ready', async () => {
		const { ctx } = executeContext({ resource: 'job', operation: 'getResult', jobId: 'job-9' }, () => ({
			statusCode: 409,
			body: { error: { code: 'NOT_READY', message: 'Job result is not ready yet.' } },
		}));
		await expect(new IsraeliBank().execute.call(ctx)).rejects.toMatchObject({
			message: expect.stringContaining('not finished'),
			context: expect.objectContaining({ jobId: 'job-9' }),
		});
	});
});

describe('IsraeliBankTrigger node', () => {
	const params = { event: 'newCompleted', lookbackDays: 7, options: {} };

	it('emits nothing on first activation, then only new transactions', async () => {
		const staticData: IDataObject = {};
		const trigger = new IsraeliBankTrigger();

		const first = pollContext(params, scipio(sampleResult), 'trigger', staticData);
		expect(await trigger.poll.call(first.ctx)).toBeNull();
		expect(staticData.initialized).toBe(true);

		const again = pollContext(params, scipio(sampleResult), 'trigger', staticData);
		expect(await trigger.poll.call(again.ctx)).toBeNull();

		const withNew = structuredClone(sampleResult);
		withNew.accounts[0].txns.push({ ...withNew.accounts[0].txns[0], identifier: 5555, description: 'New' });
		const third = pollContext(params, scipio(withNew), 'trigger', staticData);
		const out = await trigger.poll.call(third.ctx);
		expect(out?.[0].map((i) => i.json.description)).toEqual(['New']);
	});

	it('returns samples in manual mode without touching state', async () => {
		const staticData: IDataObject = {};
		const { ctx } = pollContext(params, scipio(sampleResult), 'manual', staticData);
		const out = await new IsraeliBankTrigger().poll.call(ctx);
		expect(out?.[0]).toHaveLength(2);
		expect(staticData).toEqual({});
	});

	it('refuses One Zero without a long-term token before creating a job', async () => {
		const saved = credentials.israeliBankAccountApi;
		credentials.israeliBankAccountApi = { companyId: 'oneZero', email: 'a@b.c', password: 'pw', phoneNumber: '+972500000000' };
		try {
			const { ctx, requests } = pollContext(params, scipio(sampleResult), 'trigger', {});
			await expect(new IsraeliBankTrigger().poll.call(ctx)).rejects.toMatchObject({
				message: expect.stringContaining('long-term token'),
			});
			expect(requests).toEqual([]);
		} finally {
			credentials.israeliBankAccountApi = saved;
		}
	});

	it('does not update state when the scrape fails', async () => {
		const staticData: IDataObject = { seen: { a: '2026-09-18' }, initialized: true };
		const { ctx } = pollContext(params, scipio({ success: false, errorType: 'TIMEOUT' }), 'trigger', staticData);
		await expect(new IsraeliBankTrigger().poll.call(ctx)).rejects.toBeTruthy();
		expect(staticData).toEqual({ seen: { a: '2026-09-18' }, initialized: true });
	});
});
