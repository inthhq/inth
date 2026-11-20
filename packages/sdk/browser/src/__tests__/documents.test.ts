/**
 * A plain JavaScript app binds `@inth/sdk/runtime/documents` to its
 * client's runtime: `check` and `accept` use the client's backend and
 * subject.
 */
import { createRuntimeDocuments } from '@inth/sdk-core/runtime/documents';
import { hosted } from '@inth/sdk-core/transports';
import { afterEach, expect, test, vi } from 'vitest';

import { createConsentClient } from '../index';

const HASH =
	'sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';

afterEach(() => {
	localStorage.clear();
});

test('accepts for the client subject, then checks as accepted', async () => {
	const posted: Record<string, unknown>[] = [];
	const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
		const { pathname } = new URL(String(input));
		if (pathname === '/v1/documents/acceptances') {
			const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
			posted.push(body);
			return Promise.resolve(
				Response.json({
					acceptances: [
						{ acceptedAt: 1, hash: HASH, type: 'terms_us', version: '1' },
					],
					subjectId: body.subjectId,
				})
			);
		}
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
	});
	const client = createConsentClient({
		mode: hosted({ fetch, projectUrl: 'https://consent.example.com' }),
	});
	const documents = createRuntimeDocuments(() => client.runtime);
	// What a started client has: a subject from consent.
	client.runtime.kernel.set.subjectId('0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c');

	try {
		const before = await documents.check('terms_us');
		await documents.accept({ hash: HASH, type: 'terms_us' });
		const check = await documents.check('terms_us');

		expect(posted).toHaveLength(1);
		expect(posted[0]?.subjectId).toBe(client.getSnapshot().subject?.subjectId);
		expect(before.accepted).toBe(false);
		expect(check.accepted).toBe(true);
	} finally {
		client.dispose();
	}
});
