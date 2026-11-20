/** @vitest-environment jsdom */
/**
 * Document acceptances across page loads and tabs, with consent persistence
 * as the only owner of the subject: an acceptance is remembered for the
 * subject it was recorded under, across reloads only while consent
 * persistence keeps that subject, and never once the subject changed.
 */
import type { PolicyResolution } from '@inth/sdk-schema/types';
import { writePolicyResolutionWire } from '@inth/sdk-schema/types';
import { translations } from '@inth/sdk-translations/en';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
	matchedResolution,
	optInRule,
} from '../../__tests__/fixtures/kernel-fixtures';
import { PENDING_SAVES_STORAGE_KEY } from '../../libs/storage-keys';
import { clearStoredConsentRecords } from '../../modules/persistence/__tests__/record-writes';
import { hosted } from '../../transports/mode';
import {
	LEGACY_SUBJECT,
	recordAnswer,
	SUBJECT,
	v1Error,
} from '../../transports/v1/__tests__/fixtures';
import { createRuntimeDocuments, isInthApiError } from '../documents';
import { createConsentRuntime } from '../index';
import type { ConsentRuntime, ConsentRuntimeOptions } from '../types';

const HASH =
	'sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
const PRIVACY_HASH =
	'sha256:60303ae22b998861bce3b28f33eec1be758a213c86c93c076dbe9f558c11c752';
const PROJECT = 'https://consent.example.com';
const STORED_KEY = `inth-document-acceptances:v1:${PROJECT}`;
const CATEGORIES = ['necessary', 'measurement', 'marketing'] as const;
const PERSON = '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b20';
const policy: PolicyResolution = matchedResolution(optInRule());
const runtimes: ConsentRuntime[] = [];

interface Sent {
	path: string;
	subjectId?: string;
	externalId?: string;
}
let sent: Sent[] = [];
/** Held answers to `/v1/documents/acceptances`, released by the test. */
let acceptanceHold: Promise<Response> | undefined;
/** Subjects `/v1/consent/records` refuses as another project's. */
let conflicting = new Set<string>();
/** The person's subject is this device's, as after a link. */
let personIsDevice = false;
/** Holds `/v1/consent/records` answers while set. */
let recordsHold: Promise<void> | undefined;

/** The UUID the backend keeps for a `sub_` ID. */
const canonical = (subjectId: string | undefined) =>
	subjectId?.startsWith('sub_') ? SUBJECT : subjectId;

const backend: typeof globalThis.fetch = (input, init) => {
	const { pathname } = new URL(String(input));
	const body = init?.body
		? (JSON.parse(String(init.body)) as {
				acceptances?: { hash: string; type: string }[];
				acceptedAt?: number;
				externalId?: string;
				subjectId?: string;
			})
		: {};
	sent.push({
		externalId: body.externalId,
		path: pathname,
		subjectId: body.subjectId,
	});
	if (pathname === '/v1/documents/acceptances') {
		if (acceptanceHold) {
			return acceptanceHold;
		}
		return Promise.resolve(
			Response.json({
				acceptances: (body.acceptances ?? []).map(({ hash, type }) => ({
					acceptedAt: body.acceptedAt,
					hash,
					type,
					version: '1',
				})),
				subjectId:
					body.externalId && !personIsDevice
						? PERSON
						: canonical(body.subjectId),
			})
		);
	}
	if (pathname === '/v1/documents/terms_us/current') {
		return Promise.resolve(
			Response.json({
				document: {
					effectiveDate: '2026-11-18T00:00:00.000Z',
					hash: HASH,
					id: '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c',
					isCurrent: true,
					requiresAcceptance: true,
					type: 'terms_us',
					version: '1',
				},
			})
		);
	}
	const linked = /^\/v1\/subjects\/(?<id>[^/]+)\/link$/u.exec(pathname)?.groups
		?.id;
	if (linked) {
		return Promise.resolve(Response.json({ subjectId: linked }));
	}
	if (pathname === '/v1/consent/records') {
		if (body.subjectId && conflicting.has(body.subjectId)) {
			return Promise.resolve(v1Error(409, 'subject_conflict'));
		}
		const held = recordsHold;
		return (async () => {
			await held;
			return Response.json(recordAnswer(init));
		})();
	}
	return Promise.resolve(
		Response.json({
			branding: 'inth',
			location: { countryCode: 'DE', regionCode: null },
			policyResolution: writePolicyResolutionWire(policy),
			translations: { language: 'en', translations },
		})
	);
};

/** A page load: the runtime, started, once its init has answered. */
const load = async (
	options: Pick<ConsentRuntimeOptions, 'persistence' | 'storageConfig'> & {
		projectUrl?: string;
	} = {}
): Promise<ConsentRuntime> => {
	const { projectUrl = PROJECT, ...rest } = options;
	const runtime = createConsentRuntime({
		consentCategories: [...CATEGORIES],
		mode: hosted({ fetch: backend, projectUrl }),
		prefetch: { initRetry: false },
		...rest,
	});
	runtimes.push(runtime);
	const completed = Promise.withResolvers<undefined>();
	runtime.kernel.events.on('command:init:completed', () =>
		completed.resolve(undefined)
	);
	runtime.start();
	await completed.promise;
	return runtime;
};

const unload = (runtime: ConsentRuntime): void => {
	runtime.dispose();
	runtime.kernel.dispose();
};

const subjectOf = (runtime: ConsentRuntime) =>
	runtime.kernel.getSnapshot().subject?.subjectId;

const consent = (runtime: ConsentRuntime) =>
	runtime.kernel.commands.save({ marketing: false, measurement: true });

const terms = { hash: HASH, type: 'terms_us' };

beforeEach(() => {
	localStorage.clear();
	clearStoredConsentRecords();
	sent = [];
	acceptanceHold = undefined;
	conflicting = new Set();
	personIsDevice = false;
	recordsHold = undefined;
});

afterEach(() => {
	for (const runtime of runtimes.splice(0)) {
		unload(runtime);
	}
	localStorage.clear();
});

describe('across a reload', () => {
	test('an acceptance with a consent record is remembered', async () => {
		const first = await load();
		await consent(first);
		await createRuntimeDocuments(() => first).accept(terms);
		const accepted = subjectOf(first);
		unload(first);

		const second = await load();

		expect(subjectOf(second)).toBe(accepted);
		expect(
			await createRuntimeDocuments(() => second).check('terms_us')
		).toMatchObject({ accepted: true });
	});

	test('an acceptance before any consent choice is asked again', async () => {
		const first = await load();
		await createRuntimeDocuments(() => first).accept(terms);
		const accepted = subjectOf(first);
		unload(first);

		const second = await load();

		expect(subjectOf(second)).not.toBe(accepted);
		expect(localStorage.getItem(STORED_KEY)).toBeNull();
		expect(
			await createRuntimeDocuments(() => second).check('terms_us')
		).toMatchObject({ accepted: false });
	});

	test.each([['another ID'], ['no ID']])(
		'after set.subjectId to %s, the accepted subject does not come back',
		async (to) => {
			const first = await load();
			await createRuntimeDocuments(() => first).accept(terms);
			const accepted = subjectOf(first);
			first.kernel.set.subjectId(
				to === 'no ID' ? null : '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b21'
			);
			unload(first);

			const second = await load();

			expect(subjectOf(second)).not.toBe(accepted);
		}
	);

	test.each([[false], [true]])(
		"a person's acceptance is not remembered for the device, person on the device's subject: %s",
		async (sameSubject) => {
			personIsDevice = sameSubject;
			const first = await load();
			await consent(first);
			const documents = createRuntimeDocuments(() => first);
			await documents.accept(terms, {
				externalId: 'user_1',
				identityToken: 'token',
			});

			expect(await documents.check('terms_us')).toMatchObject({
				accepted: false,
			});
			unload(first);
			expect(localStorage.getItem(STORED_KEY)).toBeNull();
		}
	);

	test("a person's acceptance, a consent save and a reload: the device is asked", async () => {
		const first = await load();
		await createRuntimeDocuments(() => first).accept(terms, {
			externalId: 'user_1',
			identityToken: 'token',
		});
		await consent(first);
		unload(first);

		const second = await load();

		expect(
			await createRuntimeDocuments(() => second).check('terms_us')
		).toMatchObject({ accepted: false });
	});
});

describe('a clear', () => {
	test('before the documents code ran on the page, a stored acceptance no longer counts', async () => {
		const first = await load();
		await consent(first);
		await createRuntimeDocuments(() => first).accept(terms);
		unload(first);
		const second = await load();

		second.clearRecords();

		expect(localStorage.getItem(STORED_KEY)).not.toBeNull();
		expect(
			await createRuntimeDocuments(() => second).check('terms_us')
		).toMatchObject({ accepted: false });
	});

	test('while an acceptance is in flight: nothing is remembered, and a reload starts a new subject', async () => {
		const runtime = await load();
		await consent(runtime);
		const before = subjectOf(runtime);
		const answer = Promise.withResolvers<Response>();
		acceptanceHold = answer.promise;
		const documents = createRuntimeDocuments(() => runtime);
		const accepting = documents.accept(terms);
		await vi.waitFor(() =>
			expect(sent.at(-1)?.path).toBe('/v1/documents/acceptances')
		);

		runtime.clearRecords();
		answer.resolve(
			Response.json({
				acceptances: [
					{
						acceptedAt: Date.now(),
						hash: HASH,
						type: 'terms_us',
						version: '1',
					},
				],
				subjectId: before,
			})
		);
		await accepting;

		expect(localStorage.getItem(STORED_KEY)).toBeNull();
		expect(await documents.check('terms_us')).toMatchObject({
			accepted: false,
		});
		unload(runtime);
		expect(subjectOf(await load())).not.toBe(before);
	});

	test('without persistence, forgets what the page remembered', async () => {
		const runtime = await load({ persistence: false });
		const documents = createRuntimeDocuments(() => runtime);
		await documents.accept(terms);
		expect(await documents.check('terms_us')).toMatchObject({
			accepted: true,
		});

		runtime.clearRecords();

		expect(await documents.check('terms_us')).toMatchObject({
			accepted: false,
		});
	});
});

test('identify links the subject an acceptance was recorded for', async () => {
	const runtime = await load();
	await createRuntimeDocuments(() => runtime).accept(terms);

	await runtime.identify({ externalId: 'user_1', identityToken: 'token' });

	expect(sent.filter((request) => request.path.endsWith('/link'))).toEqual([
		{
			externalId: 'user_1',
			path: `/v1/subjects/${subjectOf(runtime)}/link`,
			subjectId: undefined,
		},
	]);
});

test('a subject_conflict on a consent save and on an acceptance in flight: the acceptance rejects, and nothing goes out under a third subject', async () => {
	const runtime = await load();
	const first = subjectOf(runtime) as string;
	conflicting = new Set([first]);
	const answer = Promise.withResolvers<Response>();
	acceptanceHold = answer.promise;
	const accepting = createRuntimeDocuments(() => runtime).accept(terms);
	await vi.waitFor(() =>
		expect(sent.at(-1)?.path).toBe('/v1/documents/acceptances')
	);

	await consent(runtime);
	await vi.waitFor(() => expect(subjectOf(runtime)).not.toBe(first));
	const second = subjectOf(runtime);
	answer.resolve(v1Error(409, 'subject_conflict'));

	await expect(accepting).rejects.toSatisfy(
		(error) => isInthApiError(error) && error.code === 'subject_conflict'
	);
	expect(subjectOf(runtime)).toBe(second);
	expect(
		sent.filter((request) => request.path === '/v1/documents/acceptances')
	).toHaveLength(1);
	expect(new Set(sent.flatMap((request) => request.subjectId ?? []))).toEqual(
		new Set([first, second])
	);
});

test("two fresh tabs: the tab that accepted follows the other's record and is asked again", async () => {
	const tab1 = await load();
	const tab2 = await load();
	const documents = createRuntimeDocuments(() => tab1);
	await documents.accept(terms);

	await consent(tab2);
	tab1.reconcileStorage();

	expect(subjectOf(tab1)).toBe(subjectOf(tab2));
	expect(await documents.check('terms_us')).toMatchObject({ accepted: false });
	await documents.accept(terms);
	expect(sent.at(-1)).toMatchObject({
		path: '/v1/documents/acceptances',
		subjectId: subjectOf(tab2),
	});
});

test('two tabs accepting different types for one subject keep both', async () => {
	const tab1 = await load();
	await consent(tab1);
	const tab2 = await load();
	expect(subjectOf(tab2)).toBe(subjectOf(tab1));

	await Promise.all([
		createRuntimeDocuments(() => tab1).accept(terms),
		createRuntimeDocuments(() => tab2).accept({
			hash: PRIVACY_HASH,
			type: 'privacy_policy',
		}),
	]);
	unload(tab1);
	unload(tab2);

	const accepted = JSON.parse(localStorage.getItem(STORED_KEY) ?? '{}') as {
		accepted?: Record<string, unknown>;
	};
	expect(Object.keys(accepted.accepted ?? {}).toSorted()).toEqual([
		'privacy_policy',
		'terms_us',
	]);
});

test('two projects on one origin with their own storage keys keep apart', async () => {
	const one = await load({ storageConfig: { storageKey: 'inth-one' } });
	await consent(one);
	await createRuntimeDocuments(() => one).accept(terms);
	const stored = localStorage.getItem(STORED_KEY);
	expect(stored).not.toBeNull();

	const two = await load({
		projectUrl: 'https://two.example.com',
		storageConfig: { storageKey: 'inth-two' },
	});
	await consent(two);
	const documents = createRuntimeDocuments(() => two);
	expect(await documents.check('terms_us')).toMatchObject({ accepted: false });
	await documents.accept(terms);
	two.clearRecords();

	expect(localStorage.getItem(STORED_KEY)).toBe(stored);
});

describe('a stored entry the reader refuses', () => {
	const entry = (subjectId: unknown, accepted: unknown) =>
		JSON.stringify({ accepted: { terms_us: { [HASH]: accepted } }, subjectId });

	test.each([
		[
			'a malformed subject',
			(subject: string) =>
				entry(`${subject}!`, { acceptedAt: 1, version: '1' }),
		],
		['null metadata', (subject: string) => entry(subject, null)],
		[
			'more than the size limit',
			(subject: string) =>
				JSON.stringify({
					accepted: { terms_us: { [HASH]: { acceptedAt: 1, version: '1' } } },
					pad: 'x'.repeat(20_000),
					subjectId: subject,
				}),
		],
	])('%s is ignored', async (_name, stored) => {
		const runtime = await load();
		await consent(runtime);
		const documents = createRuntimeDocuments(() => runtime);
		const subject = subjectOf(runtime) as string;
		localStorage.setItem(
			STORED_KEY,
			entry(subject, { acceptedAt: 1, version: '1' })
		);
		expect(await documents.check('terms_us')).toMatchObject({
			accepted: true,
		});

		localStorage.setItem(STORED_KEY, stored(subject));

		expect(await documents.check('terms_us')).toMatchObject({
			accepted: false,
		});
	});
});

test('a consent save under a sub_ ID that an acceptance canonicalised first is sent once', async () => {
	const runtime = await load();
	runtime.kernel.set.subjectId(LEGACY_SUBJECT);
	const answer = Promise.withResolvers<undefined>();
	recordsHold = answer.promise;
	const saving = consent(runtime);
	await vi.waitFor(() =>
		expect(sent.at(-1)).toMatchObject({
			path: '/v1/consent/records',
			subjectId: LEGACY_SUBJECT,
		})
	);

	await createRuntimeDocuments(() => runtime).accept(terms);
	expect(subjectOf(runtime)).toBe(SUBJECT);
	answer.resolve(undefined);
	await saving;
	recordsHold = undefined;
	await vi.waitFor(() =>
		expect(
			JSON.parse(localStorage.getItem(PENDING_SAVES_STORAGE_KEY) ?? '[]')
		).toEqual([])
	);
	unload(runtime);
	await load();
	await new Promise((resolve) => {
		setTimeout(resolve, 50);
	});

	expect(
		sent.filter((request) => request.path === '/v1/consent/records')
	).toHaveLength(1);
});
