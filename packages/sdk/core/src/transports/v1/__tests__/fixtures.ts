import { vi } from 'vitest';

import type { SavePayload } from '../../../types';

export const PROJECT_URL = 'https://your-project.inth.app';
export const SUBJECT = '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c';
export const LEGACY_SUBJECT = 'sub_2VZxR7YmNpKq3WfLs8TgHd';
export const RECORD = '0193e5a8-8a00-7d3a-9b1c-6e3f8a0b1c2d';
export const KEY = '0193e5a8-7c1e-7b7a-9d7e-2f0c9a3b4d5e';
export const ACTION_AT = 1_763_467_200_000;

/** One recorded call to a stubbed `fetch`. */
export interface FetchCall {
	url: string;
	init: RequestInit;
	headers: Record<string, string>;
	body: unknown;
}

/**
 * A `fetch` that answers each call with the next response, and records what
 * it was sent.
 */
export const stubFetch = function stubFetch(...responses: (() => Response)[]): {
	fetch: typeof globalThis.fetch;
	calls: FetchCall[];
} {
	const calls: FetchCall[] = [];
	let index = 0;
	const fetch = vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
		const headers: Record<string, string> = {};
		new Headers(init.headers).forEach((value, name) => {
			headers[name] = value;
		});
		calls.push({
			body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
			headers,
			init,
			url: String(input),
		});
		const next = responses[Math.min(index, responses.length - 1)];
		index += 1;
		return next
			? Promise.resolve(next())
			: Promise.reject(new Error('no response'));
	});
	return { calls, fetch: fetch as unknown as typeof globalThis.fetch };
};

/** The JSON body of the call at `index`, or an empty object. */
export const bodyAt = (
	calls: readonly FetchCall[],
	index: number
): Record<string, unknown> =>
	(calls[index]?.body ?? {}) as Record<string, unknown>;

export const json = (status: number, body: unknown, headers = {}) =>
	new Response(JSON.stringify(body), {
		headers: { 'content-type': 'application/json', ...headers },
		status,
	});

export const v1Error = (
	status: number,
	code: string,
	requestId = 'req_123',
	headers = {}
) =>
	json(
		status,
		{ error: { code, message: `refused: ${code}` }, requestId },
		headers
	);

/** A save that confirmed `measurement` and carries an older `marketing` receipt. */
export const savePayload = (
	overrides: Partial<SavePayload> = {}
): SavePayload => ({
	choice: {
		categories: {
			marketing: {
				basis: { fingerprint: 'fp-choice', kind: 'choice-v1' },
				confirmedAt: 1_760_000_000_000,
				value: false,
			},
			measurement: {
				basis: { fingerprint: 'fp-choice', kind: 'choice-v1' },
				confirmedAt: ACTION_AT,
				value: true,
			},
		},
		version: 3,
	},
	confirmed: { actionAt: ACTION_AT, categories: { measurement: true } },
	consentAction: 'custom',
	consents: {
		experience: false,
		functionality: false,
		marketing: false,
		measurement: true,
		necessary: true,
	},
	givenAt: ACTION_AT,
	idempotencyKey: KEY,
	model: 'opt-in',
	overrides: {},
	policySnapshotToken: 'snapshot-token',
	subject: { subjectId: SUBJECT },
	subjectId: SUBJECT,
	tcString: null,
	uiSource: 'dialog',
	user: null,
	...overrides,
});
