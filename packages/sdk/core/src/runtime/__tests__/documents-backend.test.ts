/** @vitest-environment jsdom */
/**
 * `check` and `accept` go to the backend consent records go to, in every
 * mode a runtime resolves one, and keep what they store to that backend
 * and subject.
 */
import { policyRulePresets, resolvePolicyRules } from '@inth/sdk-schema/types';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { hosted as hostedData, manifest as manifestData } from '../../modes';
import { manifest } from '../../transports/manifest-browser';
import { hosted } from '../../transports/mode';
import { SUBJECT } from '../../transports/v1/__tests__/fixtures';
import { clientMode } from '../client-mode';
import { createRuntimeDocuments } from '../documents';
import {
	createConsentProviderRuntime,
	createConsentRuntime,
	defaultRuntimeModules,
	streamPrefetch,
} from '../index';
import type { ConsentRuntime, RuntimePrefetch } from '../types';

const HASH =
	'sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
const PRIVACY_HASH =
	'sha256:60303ae22b998861bce3b28f33eec1be758a213c86c93c076dbe9f558c11c752';
const STORED_SUBJECT = '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1f';

let requests: {
	path: string;
	method: string;
	body?: Record<string, unknown>;
}[] = [];
const runtimes: ConsentRuntime[] = [];

const backend = (input: RequestInfo | URL, init?: RequestInit) => {
	const url = new URL(String(input), window.location.href);
	const body = init?.body
		? (JSON.parse(String(init.body)) as Record<string, unknown>)
		: undefined;
	requests.push({ body, method: init?.method ?? 'GET', path: url.pathname });
	if (url.pathname.endsWith('/v1/documents/acceptances')) {
		const items = body?.acceptances as { hash: string; type: string }[];
		return Promise.resolve(
			Response.json({
				acceptances: items.map(({ hash, type }) => ({
					acceptedAt: 1,
					hash,
					type,
					version: '1',
				})),
				subjectId: body?.subjectId,
			})
		);
	}
	const type = /\/v1\/documents\/(?<type>[a-z_]+)\/current$/u.exec(url.pathname)
		?.groups?.type;
	if (type) {
		return Promise.resolve(
			Response.json({
				document: {
					effectiveDate: '2026-11-18T00:00:00.000Z',
					hash: type === 'terms_us' ? HASH : PRIVACY_HASH,
					id: '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c',
					isCurrent: true,
					requiresAcceptance: true,
					type,
					version: '1',
				},
			})
		);
	}
	return Promise.resolve(new Response(null, { status: 503 }));
};

const create = (options: Parameters<typeof createConsentRuntime>[0]) => {
	const runtime = createConsentRuntime(options);
	runtimes.push(runtime);
	return runtime;
};

beforeEach(() => {
	localStorage.clear();
	requests = [];
	vi.spyOn(globalThis, 'fetch').mockImplementation(backend);
});

afterEach(() => {
	for (const runtime of runtimes.splice(0)) {
		runtime.dispose();
	}
	vi.restoreAllMocks();
	localStorage.clear();
});

describe('the backend consent resolved', () => {
	test.each([
		[
			'a project URL',
			() => create({ projectUrl: 'https://consent.example.com/' }),
			'/v1/documents/terms_us/current',
		],
		[
			'hosted client mode',
			() =>
				create({ mode: clientMode(hostedData(), { projectUrl: '/api/inth' }) }),
			'/api/inth/v1/documents/terms_us/current',
		],
		[
			'manifest client mode with a route prefix',
			() =>
				create({
					mode: clientMode(manifestData(), {
						projectUrl: '/api/inth',
						routePrefix: '/api/inth',
					}),
				}),
			'/api/inth/v1/documents/terms_us/current',
		],
		[
			'manifest by manifestUrl',
			() =>
				create({
					mode: manifest({ manifestUrl: '/api/inth/v1/consent/manifest' }),
				}),
			'/api/inth/v1/documents/terms_us/current',
		],
		[
			'an empty project URL, for this origin',
			() => create({ mode: manifest({ projectUrl: '' }) }),
			'/v1/documents/terms_us/current',
		],
	])('%s', async (_name, build, path) => {
		const runtime = build();

		await createRuntimeDocuments(() => runtime).check('terms_us');

		expect(
			requests.filter((request) => request.path.includes('/documents/'))
		).toEqual([{ body: undefined, method: 'GET', path }]);
	});
});

test('one request accepts two types, with the property option', async () => {
	const runtime = create({
		mode: hosted({
			fetch: backend,
			projectUrl: 'https://consent.example.com',
			property: 'app.example.com',
		}),
	});
	runtime.kernel.set.subjectId(SUBJECT);

	await createRuntimeDocuments(() => runtime).accept([
		{ hash: HASH, type: 'terms_us' },
		{ hash: PRIVACY_HASH, type: 'privacy_policy' },
	]);

	expect(requests).toEqual([
		{
			body: expect.objectContaining({
				acceptances: [
					{ hash: HASH, type: 'terms_us' },
					{ hash: PRIVACY_HASH, type: 'privacy_policy' },
				],
				property: 'app.example.com',
				subjectId: SUBJECT,
			}),
			method: 'POST',
			path: '/v1/documents/acceptances',
		},
	]);
});

describe('what this browser stores', () => {
	const runtimeFor = (projectUrl: string) => {
		const runtime = create({ mode: hosted({ fetch: backend, projectUrl }) });
		runtime.kernel.set.subjectId(SUBJECT);
		return createRuntimeDocuments(() => runtime);
	};

	test('an acceptance through one project does not count for another', async () => {
		await runtimeFor('https://one.example.com').accept({
			hash: HASH,
			type: 'terms_us',
		});

		const other = await runtimeFor('https://two.example.com').check('terms_us');

		expect(other.accepted).toBe(false);
	});

	test('two writers keep both types', async () => {
		const first = runtimeFor('https://one.example.com');
		const second = runtimeFor('https://one.example.com');

		await Promise.all([
			first.accept({ hash: HASH, type: 'terms_us' }),
			second.accept({ hash: PRIVACY_HASH, type: 'privacy_policy' }),
		]);

		expect((await first.check('terms_us')).accepted).toBe(true);
		expect((await first.check('privacy_policy')).accepted).toBe(true);
	});

	test('an oversized stored value is ignored and replaced', async () => {
		localStorage.setItem(
			'inth-document-acceptances:v1',
			JSON.stringify({
				accepted: {},
				pad: 'x'.repeat(70_000),
				subjectId: SUBJECT,
			})
		);
		const documents = runtimeFor('https://one.example.com');
		expect((await documents.check('terms_us')).accepted).toBe(false);

		await documents.accept({ hash: HASH, type: 'terms_us' });

		expect((await documents.check('terms_us')).accepted).toBe(true);
		expect(
			localStorage.getItem('inth-document-acceptances:v1')?.length
		).toBeLessThan(1000);
	});
});

test('accept waits for a streamed prefetch to settle the subject', async () => {
	const stream = Promise.withResolvers<RuntimePrefetch>();
	const runtime = createConsentProviderRuntime(
		{
			mode: hosted({
				fetch: backend,
				projectUrl: 'https://consent.example.com',
			}),
			persistence: false,
			prefetch: stream.promise,
		},
		{ ...defaultRuntimeModules, streamPrefetch }
	);
	runtimes.push(runtime);
	runtime.start();
	const provisional = runtime.kernel.getSnapshot().subject?.subjectId;

	const accepting = createRuntimeDocuments(() => runtime).accept({
		hash: HASH,
		type: 'terms_us',
	});
	stream.resolve({
		initialPolicyResolution: resolvePolicyRules({
			countryCode: null,
			regionCode: null,
			rules: [
				{ ...policyRulePresets.europeOptIn(), match: { fallback: true } },
			],
		}),
		initialRecords: { subject: { subjectId: STORED_SUBJECT } },
	});
	await accepting;

	expect(provisional).not.toBe(STORED_SUBJECT);
	expect(requests.at(-1)?.body?.subjectId).toBe(STORED_SUBJECT);
	expect(runtime.kernel.getSnapshot().subject?.subjectId).toBe(STORED_SUBJECT);
});
