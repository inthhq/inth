/** @vitest-environment jsdom */
/**
 * Document acceptances across page loads, with persistence on: the subject
 * an acceptance made is kept, and a clear ends it.
 */
import type { PolicyResolution } from '@inth/sdk-schema/types';
import { writePolicyResolutionWire } from '@inth/sdk-schema/types';
import { translations } from '@inth/sdk-translations/en';
import { afterEach, beforeEach, expect, test } from 'vitest';

import {
	matchedResolution,
	optInRule,
} from '../../__tests__/fixtures/kernel-fixtures';
import { clearStoredConsentRecords } from '../../modules/persistence/__tests__/record-writes';
import { hosted } from '../../transports/mode';
import { recordAnswer } from '../../transports/v1/__tests__/fixtures';
import { createRuntimeDocuments } from '../documents';
import { createConsentRuntime } from '../index';
import type { ConsentRuntime } from '../types';

const HASH =
	'sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
const CATEGORIES = ['necessary', 'measurement', 'marketing'] as const;
const policy: PolicyResolution = matchedResolution(optInRule());
const runtimes: ConsentRuntime[] = [];
let acceptances: { subjectId: string }[] = [];
let records: { subjectId: string }[] = [];
let links: string[] = [];
const PERSON = '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b20';
/** Holds `/v1/consent/records` answers while set. */
let recordsHeld: Promise<void> | undefined;
/** The subject a link answers with: the one linked, unless set. */
let linkedTo: string | undefined;

const backend: typeof globalThis.fetch = (input, init) => {
	const { pathname } = new URL(String(input));
	if (pathname === '/v1/documents/acceptances') {
		const body = JSON.parse(String(init?.body)) as {
			acceptedAt: number;
			externalId?: string;
			subjectId: string;
		};
		acceptances.push(body);
		return Promise.resolve(
			Response.json({
				acceptances: [
					{
						acceptedAt: body.acceptedAt,
						hash: HASH,
						type: 'terms_us',
						version: '1',
					},
				],
				subjectId: body.externalId ? PERSON : body.subjectId,
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
		links.push(linked);
		return Promise.resolve(Response.json({ subjectId: linkedTo ?? linked }));
	}
	if (pathname === '/v1/consent/records') {
		records.push(JSON.parse(String(init?.body)));
		const held = recordsHeld;
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
const load = async (): Promise<ConsentRuntime> => {
	const runtime = createConsentRuntime({
		consentCategories: [...CATEGORIES],
		mode: hosted({ fetch: backend, projectUrl: 'https://consent.example.com' }),
		prefetch: { initRetry: false },
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

beforeEach(() => {
	localStorage.clear();
	clearStoredConsentRecords();
	acceptances = [];
	records = [];
	links = [];
	linkedTo = undefined;
	recordsHeld = undefined;
});

afterEach(() => {
	for (const runtime of runtimes.splice(0)) {
		unload(runtime);
	}
	localStorage.clear();
});

test('a reload keeps the subject an acceptance made, and the next consent save uses it', async () => {
	const first = await load();
	await createRuntimeDocuments(() => first).accept({
		hash: HASH,
		type: 'terms_us',
	});
	unload(first);

	const second = await load();
	await second.kernel.commands.save({ marketing: false, measurement: true });

	expect(acceptances).toHaveLength(1);
	expect(records).toHaveLength(1);
	expect(records[0]?.subjectId).toBe(acceptances[0]?.subjectId);
	expect(
		await createRuntimeDocuments(() => second).check('terms_us')
	).toMatchObject({ accepted: true });
});

test('a clear removes the stored acceptances, and a reload starts a new subject', async () => {
	const runtime = await load();
	const documents = createRuntimeDocuments(() => runtime);
	await documents.accept({ hash: HASH, type: 'terms_us' });

	runtime.clearRecords();

	expect(await documents.check('terms_us')).toMatchObject({ accepted: false });
	unload(runtime);
	const next = await load();
	expect(next.kernel.getSnapshot().subject?.subjectId).not.toBe(
		acceptances[0]?.subjectId
	);
});

test('acceptances recorded for another subject do not count', async () => {
	const runtime = await load();
	const documents = createRuntimeDocuments(() => runtime);
	await documents.accept({ hash: HASH, type: 'terms_us' });

	runtime.kernel.set.subjectId('0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1d');

	expect(await documents.check('terms_us')).toMatchObject({ accepted: false });
});

test("identify links the subject a started runtime's acceptance was recorded for", async () => {
	const runtime = await load();
	await createRuntimeDocuments(() => runtime).accept({
		hash: HASH,
		type: 'terms_us',
	});

	await runtime.identify({ externalId: 'user_1', identityToken: 'token' });

	expect(acceptances[0]?.subjectId).toBe(
		runtime.kernel.getSnapshot().subject?.subjectId
	);
	expect(links).toEqual([acceptances[0]?.subjectId]);
});

test('stored acceptances follow a subject the backend replaces', async () => {
	const runtime = await load();
	const documents = createRuntimeDocuments(() => runtime);
	await documents.accept({ hash: HASH, type: 'terms_us' });
	linkedTo = '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1e';

	await runtime.identify({ externalId: 'user_1', identityToken: 'token' });

	expect(runtime.kernel.getSnapshot().subject?.subjectId).toBe(linkedTo);
	expect(await documents.check('terms_us')).toMatchObject({ accepted: true });
});

test("a person's acceptance leaves the device's subject, with a consent save in flight", async () => {
	const runtime = await load();
	const device = runtime.kernel.getSnapshot().subject?.subjectId;
	const release = Promise.withResolvers<undefined>();
	recordsHeld = release.promise;
	const saving = runtime.kernel.commands.save({
		marketing: false,
		measurement: true,
	});

	await createRuntimeDocuments(() => runtime).accept(
		{ hash: HASH, type: 'terms_us' },
		{ externalId: 'user_1', identityToken: 'token' }
	);
	release.resolve(undefined);
	await saving;
	recordsHeld = undefined;
	await runtime.kernel.commands.save({ marketing: true, measurement: true });

	expect(runtime.kernel.getSnapshot().subject?.subjectId).toBe(device);
	expect(records.map((record) => record.subjectId)).toEqual([device, device]);
	expect(
		await createRuntimeDocuments(() => runtime).check('terms_us')
	).toMatchObject({ accepted: true });
});
