/**
 * The hosted `/v1` transport against a stubbed `fetch`, alone and inside a
 * kernel.
 */
import type { InitOutput } from '@inth/sdk-schema/types';
import { v1ConsentInitQuerySchema } from '@inth/sdk-schema/v1';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { createKernel } from '../../../kernel';
import { createMemoryOutboxStore } from '../../../kernel/save-outbox';
import { ApiError } from '../error';
import { createV1HostedTransport } from '../hosted';
import {
	bodyAt,
	json,
	LEGACY_SUBJECT,
	PROJECT_URL,
	savePayload,
	stubFetch,
	SUBJECT,
	v1Error,
} from './fixtures';

await import('../../../kernel/save-outbox/queue');

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

const INIT_OUTPUT = {
	location: { countryCode: 'DE', regionCode: null },
	translations: {
		language: 'en',
		translations: {
			common: {
				acceptAll: 'Accept all',
				customize: 'Customize',
				rejectAll: 'Reject all',
				save: 'Save',
			},
			cookieBanner: { description: 'Cookies', title: 'Cookies' },
		},
	},
} as unknown as InitOutput;

describe('init: GET /v1/consent/init', () => {
	test('puts every input in the query string', async () => {
		const { calls, fetch } = stubFetch(() => json(200, INIT_OUTPUT));
		const transport = createV1HostedTransport({
			fetch,
			projectUrl: PROJECT_URL,
		});

		await transport.init({
			experiment: { arm: 'b', id: 'banner-copy' },
			journey: {
				id: '3b241101-e2bb-4255-8caf-4136c566a962',
				scope: 'page',
				storedChoice: false,
			},
			overrides: { country: 'DE', gpc: true, region: 'BY' },
			user: null,
		});

		expect(calls).toHaveLength(1);
		const url = new URL(calls[0]?.url ?? '');
		expect(`${url.origin}${url.pathname}`).toBe(
			`${PROJECT_URL}/v1/consent/init`
		);
		expect(Object.fromEntries(url.searchParams)).toEqual({
			country: 'DE',
			experiment: 'banner-copy=b',
			gpc: '1',
			journey: '3b241101-e2bb-4255-8caf-4136c566a962',
			journeyScope: 'page',
			region: 'BY',
			stored: '0',
		});
		expect(
			v1ConsentInitQuerySchema['~standard'].validate(
				Object.fromEntries(url.searchParams)
			)
		).not.toHaveProperty('issues');
		expect(calls[0]?.init.method).toBe('GET');
		expect(calls[0]?.headers).toEqual({ accept: 'application/json' });
	});

	test('sends a language override as Accept-Language', async () => {
		const { calls, fetch } = stubFetch(() => json(200, INIT_OUTPUT));
		const transport = createV1HostedTransport({
			fetch,
			projectUrl: PROJECT_URL,
		});

		await transport.init({ overrides: { language: 'de' }, user: null });

		const url = new URL(calls[0]?.url ?? '');
		expect(url.search).toBe('');
		expect(calls[0]?.headers).toEqual({
			accept: 'application/json',
			'accept-language': 'de',
		});
	});

	test('maps the answer as the current policy contract', async () => {
		const { fetch } = stubFetch(() => json(200, INIT_OUTPUT));
		const transport = createV1HostedTransport({
			fetch,
			projectUrl: PROJECT_URL,
		});

		const response = await transport.init({ overrides: {}, user: null });

		expect(response.location).toEqual({ countryCode: 'DE', regionCode: null });
		expect(response.translations?.language).toBe('en');
	});

	test('a failed init throws the code and request ID', async () => {
		const { fetch } = stubFetch(
			() =>
				new Response('upstream down', {
					headers: { 'x-request-id': 'req_header' },
					status: 502,
				})
		);
		const transport = createV1HostedTransport({
			fetch,
			projectUrl: PROJECT_URL,
		});

		const error = await transport
			.init({ overrides: {}, user: null })
			.catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(ApiError);
		expect(error).toMatchObject({
			code: 'bad_gateway',
			requestId: 'req_header',
			status: 502,
		});
	});

	test('uses initial data instead of a request', async () => {
		const { calls, fetch } = stubFetch(() => json(200, INIT_OUTPUT));
		const transport = createV1HostedTransport({
			fetch,
			initialData: Promise.resolve({ init: INIT_OUTPUT }),
			projectUrl: PROJECT_URL,
		});

		await transport.init({ overrides: {}, user: null });
		await transport.init({ overrides: {}, user: null });

		expect(calls).toHaveLength(1);
	});

	test('honours initUrl', async () => {
		const { calls, fetch } = stubFetch(() => json(200, INIT_OUTPUT));
		const transport = createV1HostedTransport({
			fetch,
			initUrl: '/api/inth/init',
			projectUrl: PROJECT_URL,
		});

		await transport.init({ overrides: {}, user: null });

		expect(calls[0]?.url).toBe('/api/inth/init');
	});
});

describe('assertDecisionInputs', () => {
	const MATCHED = {
		...INIT_OUTPUT,
		policyResolution: {
			fingerprints: { policy: 'fp-policy' },
			policyId: 'eu',
			status: 'matched',
		},
	} as unknown as InitOutput;

	test('a save without a token carries the decision init resolved', async () => {
		const { calls, fetch } = stubFetch(
			() => json(200, MATCHED),
			() => json(200, { subjectId: SUBJECT })
		);
		const transport = createV1HostedTransport({
			assertDecisionInputs: true,
			fetch,
			projectUrl: PROJECT_URL,
		});

		await transport.init({ overrides: {}, user: null }).catch(() => undefined);
		await transport.save(savePayload({ policySnapshotToken: null }));

		expect(calls[1]?.body).toMatchObject({
			country: 'DE',
			fingerprint: 'fp-policy',
			language: 'en',
			policyId: 'eu',
			region: null,
		});
	});

	test('refuses a save before any init resolved', async () => {
		const { calls, fetch } = stubFetch(() => json(200, {}));
		const transport = createV1HostedTransport({
			assertDecisionInputs: true,
			fetch,
			projectUrl: PROJECT_URL,
		});

		await expect(
			transport.save(savePayload({ policySnapshotToken: null }))
		).rejects.toThrow(/cannot save before init/u);
		expect(calls).toEqual([]);
	});
});

describe('inside a kernel', () => {
	test('a stored sub_ ID is replaced by the UUID the backend answers with', async () => {
		const { calls, fetch } = stubFetch(() => json(200, { subjectId: SUBJECT }));
		const kernel = createKernel(
			{
				transport: createV1HostedTransport({ fetch, projectUrl: PROJECT_URL }),
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		kernel.hydrate({ subject: { subjectId: LEGACY_SUBJECT } });
		const resolved: { previous?: string; next?: string }[] = [];
		kernel.events.on('subject:resolved', ({ previousSubjectId, snapshot }) => {
			resolved.push({
				next: snapshot.subject?.subjectId,
				previous: previousSubjectId,
			});
		});

		const result = await kernel.commands.save({ measurement: true });

		expect(bodyAt(calls, 0).subjectId).toBe(LEGACY_SUBJECT);
		expect(result).toMatchObject({ ok: true, subjectId: SUBJECT });
		expect(kernel.getSnapshot().subject?.subjectId).toBe(SUBJECT);
		expect(resolved).toEqual([{ next: SUBJECT, previous: LEGACY_SUBJECT }]);
		kernel.dispose();
	});

	test('a refused save is not queued', async () => {
		const store = createMemoryOutboxStore();
		const { fetch } = stubFetch(() => v1Error(409, 'policy_snapshot_expired'));
		const kernel = createKernel(
			{
				transport: createV1HostedTransport({ fetch, projectUrl: PROJECT_URL }),
			},
			{ outboxStore: store }
		);

		await kernel.commands.save('all');

		expect((await store.transact((tx) => tx.read('saves'))) ?? []).toEqual([]);
		kernel.dispose();
	});
});
