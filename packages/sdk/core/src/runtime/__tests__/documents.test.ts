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
import { isUuidV7 } from '../../transports/v1/routes';
import { createRuntimeDocuments } from '../documents';
import { createConsentRuntime } from '../index';
import type { ConsentRuntime } from '../types';

const HASH =
	'sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
const EARLIER_HASH =
	'sha256:60303ae22b998861bce3b28f33eec1be758a213c86c93c076dbe9f558c11c752';

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
				id: '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c',
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

beforeEach(() => {
	localStorage.clear();
	current = { hash: HASH, requiresAcceptance: true };
	sent = [];
	conflicts = 0;
	runtime = createConsentRuntime({
		mode: hosted({ fetch: backend, projectUrl: PROJECT_URL }),
	});
});

afterEach(() => {
	runtime.dispose();
	vi.restoreAllMocks();
});

describe('check', () => {
	test('reads the release in force, not accepted with nothing stored', async () => {
		const result = await documents.check('terms_us');

		expect(result.accepted).toBe(false);
		expect(result.document.hash).toBe(HASH);
	});

	test('is accepted once this browser accepted the same hash', async () => {
		await documents.accept({ hash: HASH, type: 'terms_us' });

		expect((await documents.check('terms_us')).accepted).toBe(true);
	});

	test.each([true, false])(
		'an earlier release accepted does not count, requiresAcceptance %s',
		async (requiresAcceptance) => {
			await documents.accept({ hash: EARLIER_HASH, type: 'terms_us' });
			current = { hash: HASH, requiresAcceptance };

			const result = await documents.check('terms_us');

			expect(result.accepted).toBe(false);
			expect(result.document.requiresAcceptance).toBe(requiresAcceptance);
		}
	);

	test('an older release accepted later keeps the newer one accepted', async () => {
		await documents.accept({ hash: HASH, type: 'terms_us' });
		await documents.accept({ hash: EARLIER_HASH, type: 'terms_us' });

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
		runtime.kernel.set.subjectId(SUBJECT);

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

	test('makes a subject ID when there is none, and keeps it', async () => {
		expect(runtime.kernel.getSnapshot().subject?.subjectId).toBeUndefined();

		await documents.accept({ hash: HASH, type: 'terms_us' });
		await documents.accept({ hash: HASH, type: 'terms_us' });

		const subjectId = String(sent[0]?.subjectId);
		expect(isUuidV7(subjectId)).toBe(true);
		expect(sent[1]?.subjectId).toBe(subjectId);
		expect(runtime.kernel.getSnapshot().subject?.subjectId).toBe(subjectId);
	});

	test('moves to a new subject ID after a subject_conflict and sends the action again', async () => {
		runtime.kernel.set.subjectId(SUBJECT);
		conflicts = 1;

		const answer = await documents.accept(
			{ hash: HASH, type: 'terms_us' },
			{ idempotencyKey: KEY }
		);

		expect(sent).toHaveLength(2);
		expect(sent[0]).toMatchObject({ idempotencyKey: KEY, subjectId: SUBJECT });
		expect(sent[1]?.idempotencyKey).toBe(KEY);
		expect(sent[1]?.subjectId).not.toBe(SUBJECT);
		expect(runtime.kernel.getSnapshot().subject?.subjectId).toBe(
			sent[1]?.subjectId
		);
		expect(answer.subjectId).toBe(sent[1]?.subjectId);
	});

	test('adopts the subject ID the backend swapped a sub_ ID for', async () => {
		runtime.kernel.set.subjectId(LEGACY_SUBJECT);

		await documents.accept({ hash: HASH, type: 'terms_us' });

		expect(sent[0]?.subjectId).toBe(LEGACY_SUBJECT);
		expect(runtime.kernel.getSnapshot().subject?.subjectId).toBe(SUBJECT);
	});
});

test('without storage, nothing is accepted and accept still records', async () => {
	vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
		throw new DOMException('blocked', 'SecurityError');
	});

	await expect(
		documents.accept({ hash: HASH, type: 'terms_us' })
	).resolves.toMatchObject({ subjectId: expect.any(String) });
	expect(sent).toHaveLength(1);
	expect((await documents.check('terms_us')).accepted).toBe(false);
});
