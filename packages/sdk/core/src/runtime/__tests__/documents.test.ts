/** @vitest-environment jsdom */
/**
 * `check` and `accept` bound to a runtime, against a fake `/v1` backend.
 */
import { v1DocumentAcceptancesInputSchema } from '@inth/sdk-schema/v1';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { testing } from '../../testing';
import { hosted } from '../../transports/mode';
import {
	KEY,
	LEGACY_SUBJECT,
	PROJECT_URL,
	SUBJECT,
	v1Error,
} from '../../transports/v1/__tests__/fixtures';
import { createRuntimeDocuments, isInthApiError } from '../documents';
import { createConsentRuntime } from '../index';
import type { ConsentRuntime } from '../types';

const HASH =
	'sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
const EARLIER_HASH =
	'sha256:60303ae22b998861bce3b28f33eec1be758a213c86c93c076dbe9f558c11c752';
/** Each release is its own document, with its own ID. */
const IDS: Record<string, string> = {
	[EARLIER_HASH]: '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1d',
	[HASH]: '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c',
};

let current = { hash: HASH, requiresAcceptance: true };
let sent: Record<string, unknown>[] = [];
let conflicts = 0;

const backend: typeof globalThis.fetch = (input, init) => {
	const { pathname } = new URL(String(input));
	if (pathname === '/v1/documents/acceptances') {
		const body = JSON.parse(String(init?.body)) as {
			acceptedAt: number;
			acceptances: { hash: string; type: string }[];
			subjectId: string;
		};
		sent.push(body);
		if (conflicts > 0) {
			conflicts -= 1;
			return Promise.resolve(v1Error(409, 'subject_conflict'));
		}
		return Promise.resolve(
			Response.json({
				acceptances: body.acceptances.map(({ hash, type }) => ({
					acceptedAt: body.acceptedAt,
					hash,
					type,
					version: hash === HASH ? '2026-11-18' : '2026-01-01',
				})),
				subjectId: body.subjectId.startsWith('sub_') ? SUBJECT : body.subjectId,
			})
		);
	}
	return Promise.resolve(
		Response.json({
			document: {
				effectiveDate: '2026-11-18T00:00:00.000Z',
				id: IDS[current.hash],
				isCurrent: true,
				type: 'terms_us',
				version: '2026-11-18',
				...current,
			},
		})
	);
};

let runtime: ConsentRuntime;
const documents = createRuntimeDocuments(() => runtime);

/** What a sign-up page does: check, then accept the release it showed. */
const checkAndAccept = async () => {
	const { document } = await documents.check('terms_us');
	return documents.accept({ hash: document.hash, type: 'terms_us' });
};

beforeEach(() => {
	localStorage.clear();
	current = { hash: HASH, requiresAcceptance: true };
	sent = [];
	conflicts = 0;
	runtime = createConsentRuntime({
		mode: hosted({ fetch: backend, projectUrl: PROJECT_URL }),
	});
	runtime.kernel.set.subjectId(SUBJECT);
});

afterEach(() => {
	runtime.dispose();
	vi.restoreAllMocks();
});

describe('check', () => {
	test('reads the release in force, not accepted with nothing remembered', async () => {
		const result = await documents.check('terms_us');

		expect(result.accepted).toBe(false);
		expect(result.document.hash).toBe(HASH);
	});

	test('is accepted once the page accepted the release it checked', async () => {
		await checkAndAccept();

		expect((await documents.check('terms_us')).accepted).toBe(true);
	});

	test('an acceptance of a release the page never checked is not remembered', async () => {
		await documents.accept({ hash: HASH, type: 'terms_us' });

		expect(sent).toHaveLength(1);
		expect((await documents.check('terms_us')).accepted).toBe(false);
	});

	test.each([true, false])(
		'an earlier release accepted does not count, requiresAcceptance %s',
		async (requiresAcceptance) => {
			current = { hash: EARLIER_HASH, requiresAcceptance: true };
			await checkAndAccept();
			current = { hash: HASH, requiresAcceptance };

			const result = await documents.check('terms_us');

			expect(result.accepted).toBe(false);
			expect(result.document.requiresAcceptance).toBe(requiresAcceptance);
		}
	);

	test('an older release accepted later keeps the newer one accepted', async () => {
		await checkAndAccept();
		current = { hash: EARLIER_HASH, requiresAcceptance: true };
		await checkAndAccept();
		current = { hash: HASH, requiresAcceptance: true };

		expect((await documents.check('terms_us')).accepted).toBe(true);
	});

	test('says a testing() runtime has no backend', async () => {
		runtime.dispose();
		runtime = createConsentRuntime({ mode: testing() });

		await expect(documents.check('terms_us')).rejects.toThrow(
			'legal documents need a backend, and this runtime has none. A testing() or offline mode'
		);
	});
});

describe('accept', () => {
	test("sends one valid request for the runtime's subject and property", async () => {
		const answer = await documents.accept([{ hash: HASH, type: 'terms_us' }]);

		expect(sent).toHaveLength(1);
		expect(
			v1DocumentAcceptancesInputSchema['~standard'].validate(sent[0])
		).not.toHaveProperty('issues');
		expect(sent[0]).toMatchObject({
			acceptances: [{ hash: HASH, type: 'terms_us' }],
			property: 'localhost',
			subjectId: SUBJECT,
		});
		expect(answer.acceptances[0]?.version).toBe('2026-11-18');
	});

	test('sends the idempotency key it was given', async () => {
		await documents.accept(
			{ hash: HASH, type: 'terms_us' },
			{ idempotencyKey: KEY }
		);

		expect(sent[0]?.idempotencyKey).toBe(KEY);
	});

	test('rejects without a subject, and makes none', async () => {
		runtime.kernel.set.subjectId(null);

		await expect(
			documents.accept({ hash: HASH, type: 'terms_us' })
		).rejects.toThrow('the runtime has no subject yet');
		expect(sent).toHaveLength(0);
		expect(runtime.kernel.getSnapshot().subject?.subjectId).toBeUndefined();
	});

	test('rejects a subject_conflict and keeps the subject', async () => {
		conflicts = 1;

		const accepting = checkAndAccept();

		await expect(accepting).rejects.toSatisfy(
			(error) => isInthApiError(error) && error.code === 'subject_conflict'
		);
		expect(sent).toHaveLength(1);
		expect(runtime.kernel.getSnapshot().subject?.subjectId).toBe(SUBJECT);
		expect((await documents.check('terms_us')).accepted).toBe(false);
	});

	test('an answer naming the UUID of a sub_ ID leaves the subject, and is remembered for the page under the sub_ ID only', async () => {
		runtime.kernel.set.subjectId(LEGACY_SUBJECT);

		await checkAndAccept();

		expect(sent[0]?.subjectId).toBe(LEGACY_SUBJECT);
		expect(runtime.kernel.getSnapshot().subject?.subjectId).toBe(
			LEGACY_SUBJECT
		);
		expect((await documents.check('terms_us')).accepted).toBe(true);
		expect(Object.keys(localStorage)).toEqual([]);
		runtime.kernel.set.subjectId(SUBJECT);
		expect((await documents.check('terms_us')).accepted).toBe(false);
	});
});

test('without storage, accept records and the page remembers it', async () => {
	vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
		throw new DOMException('blocked', 'SecurityError');
	});

	await expect(checkAndAccept()).resolves.toMatchObject({
		subjectId: expect.any(String),
	});
	expect(sent).toHaveLength(1);
	expect((await documents.check('terms_us')).accepted).toBe(true);
});
