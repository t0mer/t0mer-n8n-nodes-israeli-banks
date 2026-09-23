import type { INode } from 'n8n-workflow';

import { ScipioClient } from '../shared/scipioClient';
import type { HttpResponse, Transport } from '../shared/scipioClient';

export const fakeNode: INode = {
	id: 'node-1',
	name: 'Israeli Bank',
	type: '@t0mer/n8n-nodes-israeli-banks.israeliBank',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

export interface Call {
	method: string;
	path: string;
	body?: unknown;
}

/** Route key is `METHOD path`; a route may return a sequence of responses. */
export type Routes = Record<string, HttpResponse | HttpResponse[]>;

export function fakeTransport(routes: Routes): { transport: Transport; calls: Call[] } {
	const calls: Call[] = [];
	const cursor: Record<string, number> = {};
	const transport: Transport = async ({ method, path, body }) => {
		calls.push({ method, path, body });
		const key = `${method} ${path}`;
		const route = routes[key];
		if (!route) return { statusCode: 404, body: { error: { code: 'NOT_FOUND', message: `No route ${key}` } } };
		if (!Array.isArray(route)) return route;
		const index = Math.min(cursor[key] ?? 0, route.length - 1);
		cursor[key] = index + 1;
		return route[index];
	};
	return { transport, calls };
}

export function fakeClient(routes: Routes, options: { itemIndex?: number; secrets?: string[] } = {}) {
	const { transport, calls } = fakeTransport(routes);
	return { client: new ScipioClient(transport, fakeNode, options), calls };
}

export const ok = (body: unknown): HttpResponse => ({ statusCode: 200, body });

export function job(status: string, extra: Record<string, unknown> = {}): HttpResponse {
	return ok({
		jobId: 'job-1',
		companyId: 'leumi',
		status,
		createdAt: '2026-09-01T00:00:00.000Z',
		updatedAt: '2026-09-01T00:00:00.000Z',
		progress: [],
		...extra,
	});
}

export function txn(overrides: Record<string, unknown> = {}) {
	return {
		type: 'normal',
		identifier: 1001,
		date: '2026-09-10T21:00:00.000Z',
		processedDate: '2026-09-11T21:00:00.000Z',
		originalAmount: -50,
		originalCurrency: 'ILS',
		chargedAmount: -50,
		description: 'Coffee',
		status: 'completed',
		...overrides,
	};
}

export const sampleResult = {
	success: true,
	accounts: [
		{
			accountNumber: '12-345-678',
			balance: 1000,
			txns: [
				txn(),
				txn({ identifier: 1002, status: 'pending', description: 'Groceries', chargedAmount: -120 }),
			],
		},
		{
			accountNumber: '99-000-111',
			balance: -20,
			txns: [txn({ identifier: 2001, description: 'Fuel', chargedAmount: -300 })],
		},
	],
	futureDebits: [{ amount: -500, amountCurrency: 'ILS', chargeDate: '2026-10-10' }],
};
