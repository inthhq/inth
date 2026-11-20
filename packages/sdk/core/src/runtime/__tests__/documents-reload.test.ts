/** @vitest-environment jsdom */
/**
 * Document acceptances across page loads and tabs, with consent as the only
 * owner of the subject: an acceptance is remembered for the subject it was
 * recorded under, across reloads only while consent persistence stores that
 * subject, and never once the subject changed.
 */
import type { PolicyResolution } from '@inth/sdk-schema/types';
import { writePolicyResolutionWire } from '@inth/sdk-schema/types';
import { translations } from '@inth/sdk-translations/en';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
	matchedResolution,
	optInRule,
} from '../../__tests__/fixtures/kernel-fixtures';
import type { InternalKernel } from '../../kernel/internals';
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
const DOCUMENT_ID = '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c';
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
/** The ID the backend publishes its documents under. */
let documentId = DOCUMENT_ID;
/** How `/v1/consent/init` answers: normally, with a 503, or held. */
let initMode: 'answer' | 'fail' | 'hold' = 'answer';
/** Held init requests, each released by the test. */
let initHolds: PromiseWithResolvers<undefined>[] = [];

/** The UUID the backend keeps for a `sub_` ID. */
const canonical = (subjectId: string | undefined) =>
	subjectId?.startsWith('sub_') ? SUBJECT : subjectId;

const document = (type: string) => ({
	document: {
		effectiveDate: '2026-11-18T00:00:00.000Z',
		hash: type === 'terms_us' ? HASH : PRIVACY_HASH,
		id: documentId,
		isCurrent: true,
		requiresAcceptance: true,
		type,
		version: '1',
	},
});

const initAnswer = () =>
	Response.json({
		branding: 'inth',
		location: { countryCode: 'DE', regionCode: null },
		policyResolution: writePolicyResolutionWire(policy),
		translations: { language: 'en', translations },
	});

const backend: typeof globalThis.fetch = (input, init) => {
	// A proxy path such as `/api/inth` reaches the same routes.
	const pathname = new URL(
		String(input),
		'https://app.example.com'
	).pathname.replace(/^\/api\/inth/u, '');
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
	const type = /^\/v1\/documents\/(?<type>[a-z_]+)\/current$/u.exec(pathname)
		?.groups?.type;
	if (type) {
		return Promise.resolve(Response.json(document(type)));
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
	if (initMode === 'fail') {
		return Promise.resolve(v1Error(503, 'server_error'));
	}
	if (initMode === 'hold') {
		const hold = Promise.withResolvers<undefined>();
		initHolds.push(hold);
		return (async () => {
			await hold.promise;
			return initAnswer();
		})();
	}
	return Promise.resolve(initAnswer());
};

type LoadOptions = Pick<
	ConsentRuntimeOptions,
	'persistence' | 'storageConfig'
> & {
	projectUrl?: string;
	initRetry?: NonNullable<ConsentRuntimeOptions['prefetch']>['initRetry'];
};

const create = ({
	projectUrl = PROJECT,
	initRetry = false,
	...rest
}: LoadOptions = {}): ConsentRuntime => {
	const runtime = createConsentRuntime({
		consentCategories: [...CATEGORIES],
		mode: hosted({ fetch: backend, projectUrl }),
		prefetch: { initRetry },
		...rest,
	});
	runtimes.push(runtime);
	return runtime;
};

/** A page load: the runtime, started, once its first init has completed. */
const load = async (options: LoadOptions = {}): Promise<ConsentRuntime> => {
	const runtime = create(options);
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

/** What a sign-up page does: check, then accept the release it showed. */
const checkAndAccept = async (runtime: ConsentRuntime, type = 'terms_us') => {
	const documents = createRuntimeDocuments(() => runtime);
	const { document: shown } = await documents.check(type);
	return documents.accept({ hash: shown.hash, type });
};

const accepted = async (runtime: ConsentRuntime, type = 'terms_us') =>
	(await createRuntimeDocuments(() => runtime).check(type)).accepted;

const documentRequests = () =>
	sent.filter((request) => request.path.startsWith('/v1/documents/'));

beforeEach(() => {
	localStorage.clear();
	clearStoredConsentRecords();
	sent = [];
	acceptanceHold = undefined;
	conflicting = new Set();
	personIsDevice = false;
	recordsHold = undefined;
	documentId = DOCUMENT_ID;
	initMode = 'answer';
	initHolds = [];
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
		await checkAndAccept(first);
		const subject = subjectOf(first);
		unload(first);

		const second = await load();

		expect(subjectOf(second)).toBe(subject);
		expect(await accepted(second)).toBe(true);
	});

	test('an acceptance before any consent choice is asked again', async () => {
		const first = await load();
		await checkAndAccept(first);
		const subject = subjectOf(first);
		unload(first);

		const second = await load();

		expect(subjectOf(second)).not.toBe(subject);
		expect(localStorage.getItem(STORED_KEY)).toBeNull();
		expect(await accepted(second)).toBe(false);
	});

	test.each([['another ID'], ['no ID']])(
		'after set.subjectId to %s, the accepted subject does not come back',
		async (to) => {
			const first = await load();
			await checkAndAccept(first);
			const subject = subjectOf(first);
			first.kernel.set.subjectId(
				to === 'no ID' ? null : '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b21'
			);
			unload(first);

			const second = await load();

			expect(subjectOf(second)).not.toBe(subject);
		}
	);

	test.each([[false], [true]])(
		"a person's acceptance is not remembered for the device, person on the device's subject: %s",
		async (sameSubject) => {
			personIsDevice = sameSubject;
			const first = await load();
			await consent(first);
			const documents = createRuntimeDocuments(() => first);
			await documents.check('terms_us');
			await documents.accept(terms, {
				externalId: 'user_1',
				identityToken: 'token',
			});

			expect(await accepted(first)).toBe(false);
			unload(first);
			expect(localStorage.getItem(STORED_KEY)).toBeNull();
		}
	);

	test("a person's acceptance, a consent save and a reload: the device is asked", async () => {
		const first = await load();
		const documents = createRuntimeDocuments(() => first);
		await documents.check('terms_us');
		await documents.accept(terms, {
			externalId: 'user_1',
			identityToken: 'token',
		});
		await consent(first);
		unload(first);

		expect(await accepted(await load())).toBe(false);
	});

	test('without persistence, nothing is written to storage, even with a consent choice', async () => {
		const runtime = await load({ persistence: false });
		await consent(runtime);

		await checkAndAccept(runtime);

		expect(await accepted(runtime)).toBe(true);
		expect(
			Object.keys(localStorage).filter((key) =>
				key.startsWith('inth-document-acceptances')
			)
		).toEqual([]);
	});

	test('another project behind the same proxy path does not count it', async () => {
		const first = await load({ projectUrl: '/api/inth' });
		await consent(first);
		await checkAndAccept(first);
		expect(await accepted(first)).toBe(true);
		unload(first);
		// The proxy now forwards to another project, which publishes the same
		// bytes as a document of its own.
		documentId = '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b23';

		const second = await load({ projectUrl: '/api/inth' });

		expect(subjectOf(second)).toBe(subjectOf(first));
		expect(await accepted(second)).toBe(false);
	});
});

describe('a clear', () => {
	test('while an acceptance is in flight: nothing is remembered, and a reload starts a new subject', async () => {
		const runtime = await load();
		await consent(runtime);
		const before = subjectOf(runtime);
		const documents = createRuntimeDocuments(() => runtime);
		await documents.check('terms_us');
		const answer = Promise.withResolvers<Response>();
		acceptanceHold = answer.promise;
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
		expect(await accepted(runtime)).toBe(false);
		unload(runtime);
		expect(subjectOf(await load())).not.toBe(before);
	});

	test('while an acceptance is in flight: the subject stays provisional, so identify links nothing', async () => {
		const runtime = await load();
		const subject = subjectOf(runtime);
		expect((runtime.kernel as InternalKernel).getProvisionalSubject()).toBe(
			subject
		);
		const answer = Promise.withResolvers<Response>();
		acceptanceHold = answer.promise;
		const accepting = createRuntimeDocuments(() => runtime).accept(terms);
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
				subjectId: subject,
			})
		);
		await accepting;
		await runtime.identify({ externalId: 'user_1', identityToken: 'token' });

		expect(sent.filter((request) => request.path.endsWith('/link'))).toEqual(
			[]
		);
	});

	test('before the documents code ran on the page, a stored acceptance no longer counts', async () => {
		const first = await load();
		await consent(first);
		await checkAndAccept(first);
		unload(first);
		const second = await load();

		second.clearRecords();

		expect(localStorage.getItem(STORED_KEY)).not.toBeNull();
		expect(await accepted(second)).toBe(false);
	});

	test('without persistence, forgets what the page remembered', async () => {
		const runtime = await load({ persistence: false });
		await checkAndAccept(runtime);
		expect(await accepted(runtime)).toBe(true);

		runtime.clearRecords();

		expect(await accepted(runtime)).toBe(false);
	});

	test('forgets the acceptances of every project URL the page used', async () => {
		const runtime = await load();
		await consent(runtime);
		const kernel = runtime.kernel as InternalKernel;
		const resolved = kernel.backend?.();
		await checkAndAccept(runtime);
		kernel.backend = () =>
			resolved && { ...resolved, projectUrl: 'https://two.example.com' };
		await checkAndAccept(runtime);
		const otherKey = 'inth-document-acceptances:v1:https://two.example.com';
		expect(localStorage.getItem(otherKey)).not.toBeNull();

		runtime.clearRecords();

		await vi.waitFor(() => {
			expect(localStorage.getItem(STORED_KEY)).toBeNull();
			expect(localStorage.getItem(otherKey)).toBeNull();
		});
		expect(await accepted(runtime)).toBe(false);
		kernel.backend = () => resolved;
		expect(await accepted(runtime)).toBe(false);
	});
});

describe('the first init', () => {
	test('failed with retries off: check goes on with the subject the runtime has', async () => {
		initMode = 'fail';
		const runtime = await load();

		await expect(
			createRuntimeDocuments(() => runtime).check('terms_us')
		).resolves.toMatchObject({ accepted: false });
		expect(documentRequests()).toHaveLength(1);
	});

	test('failing with retries: check waits for the last attempt, then goes on', async () => {
		initMode = 'fail';
		const runtime = await load({
			initRetry: { baseDelayMs: 20, maxAttempts: 3, maxDelayMs: 20 },
		});
		const inits = () =>
			sent.filter((request) => request.path === '/v1/consent/init').length;
		expect(inits()).toBe(1);

		const checking = createRuntimeDocuments(() => runtime).check('terms_us');
		await new Promise((resolve) => {
			setTimeout(resolve, 5);
		});
		expect(documentRequests()).toHaveLength(0);

		await expect(checking).resolves.toMatchObject({ accepted: false });
		expect(inits()).toBe(3);
		expect(documentRequests()).toHaveLength(1);
	});

	test('a superseded init does not release a call while the newer one is pending', async () => {
		initMode = 'hold';
		const runtime = create();
		runtime.start();
		await vi.waitFor(() => expect(initHolds).toHaveLength(1));
		void runtime.reinit();
		await vi.waitFor(() => expect(initHolds).toHaveLength(2));
		const checking = createRuntimeDocuments(() => runtime).check('terms_us');

		initHolds[0]?.resolve(undefined);
		await new Promise((resolve) => {
			setTimeout(resolve, 20);
		});
		expect(documentRequests()).toHaveLength(0);

		initHolds[1]?.resolve(undefined);
		await expect(checking).resolves.toMatchObject({ accepted: false });
		expect(documentRequests()).toHaveLength(1);
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
	await checkAndAccept(tab1);

	await consent(tab2);
	tab1.reconcileStorage();

	expect(subjectOf(tab1)).toBe(subjectOf(tab2));
	expect(await accepted(tab1)).toBe(false);
	await checkAndAccept(tab1);
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
		checkAndAccept(tab1),
		checkAndAccept(tab2, 'privacy_policy'),
	]);
	unload(tab1);
	unload(tab2);

	const stored = JSON.parse(localStorage.getItem(STORED_KEY) ?? '{}') as {
		accepted?: Record<string, unknown>;
	};
	expect(Object.keys(stored.accepted ?? {}).toSorted()).toEqual([
		'privacy_policy',
		'terms_us',
	]);
});

test('two projects on one origin with their own storage keys keep apart', async () => {
	const one = await load({ storageConfig: { storageKey: 'inth-one' } });
	await consent(one);
	await checkAndAccept(one);
	const stored = localStorage.getItem(STORED_KEY);
	expect(stored).not.toBeNull();

	const two = await load({
		projectUrl: 'https://two.example.com',
		storageConfig: { storageKey: 'inth-two' },
	});
	await consent(two);
	expect(await accepted(two)).toBe(false);
	await checkAndAccept(two);
	two.clearRecords();

	expect(localStorage.getItem(STORED_KEY)).toBe(stored);
});

describe('a stored entry the reader refuses', () => {
	const entry = (subjectId: unknown, metadata: unknown) =>
		JSON.stringify({ accepted: { terms_us: { [HASH]: metadata } }, subjectId });
	const valid = { acceptedAt: 1, id: DOCUMENT_ID, version: '1' };

	test.each([
		['a malformed subject', (subject: string) => entry(`${subject}!`, valid)],
		['null metadata', (subject: string) => entry(subject, null)],
		[
			'no document ID',
			(subject: string) => entry(subject, { acceptedAt: 1, version: '1' }),
		],
		[
			'more than the size limit',
			(subject: string) =>
				JSON.stringify({
					accepted: { terms_us: { [HASH]: valid } },
					pad: 'x'.repeat(20_000),
					subjectId: subject,
				}),
		],
	])('%s is ignored', async (_name, stored) => {
		const runtime = await load();
		await consent(runtime);
		const subject = subjectOf(runtime) as string;
		localStorage.setItem(STORED_KEY, entry(subject, valid));
		expect(await accepted(runtime)).toBe(true);

		localStorage.setItem(STORED_KEY, stored(subject));

		expect(await accepted(runtime)).toBe(false);
	});
});

test('an acceptance during a consent save under a sub_ ID leaves the subject to consent, which moves the visitor, who is then asked again', async () => {
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

	await checkAndAccept(runtime);
	expect(subjectOf(runtime)).toBe(LEGACY_SUBJECT);
	expect(await accepted(runtime)).toBe(true);
	answer.resolve(undefined);
	await saving;

	await vi.waitFor(() => expect(subjectOf(runtime)).toBe(SUBJECT));
	expect(await accepted(runtime)).toBe(false);
	expect(localStorage.getItem(STORED_KEY)).toBeNull();
});
