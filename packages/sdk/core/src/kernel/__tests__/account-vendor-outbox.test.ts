/**
 * @vitest-environment jsdom
 *
 * With an account layer, a save sends only the vendors it decided. The
 * outbox must keep each of those partial vendor maps until it is sent: a
 * later save that decided another vendor does not cover the earlier one.
 */
import type { UserConsent } from '@inth/sdk-schema/types';
import { afterEach, expect, test, vi } from 'vitest';

import {
	matchedResolution,
	NOW,
	optOutRule,
} from '../../__tests__/fixtures/kernel-fixtures';
import type { SavePayload, SaveResult } from '../../consent-kernel.model';
import { createKernel } from '../index';
import { createMemoryOutboxStore } from '../save-outbox';

await import('../save-outbox/queue');

const SUBJECT_UUID = '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c';
const user = { externalId: 'U', identityToken: 'token' };
const vendor = (id: string) =>
	({ category: 'marketing', id, presentable: true, source: 'config' }) as const;

const accountDocument: UserConsent = {
	categories: {},
	optOut: null,
	sync: {
		checkedAt: NOW - 1000,
		choices: {},
		externalId: user.externalId,
		optOut: null,
		vendors: {},
	},
};

const settled = async () => {
	for (let turn = 0; turn < 5; turn += 1) {
		// oxlint-disable-next-line no-await-in-loop -- One macrotask after another.
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});
	}
};

const accountKernel = (save: (payload: SavePayload) => Promise<SaveResult>) => {
	const kernel = createKernel(
		{
			consentCategories: ['marketing'],
			initialPolicyResolution: matchedResolution(
				optOutRule({ prompt: 'choice' })
			),
			initialRecords: { subject: { subjectId: SUBJECT_UUID } },
			initialUser: user,
			initialVendors: {
				declared: [vendor('a'), vendor('b')],
				listVersion: 'v1',
			},
			now: NOW,
			transport: { save },
		},
		{ outboxStore: createMemoryOutboxStore() }
	);
	kernel.syncUserConsent(accountDocument);
	return kernel;
};

/** Every grant the backend accepted, per vendor, in arrival order. */
const accepted = (calls: SavePayload[], results: boolean[]) =>
	calls.flatMap((payload, index) =>
		results[index] && payload.vendorChoice
			? Object.entries(payload.vendorChoice.grants)
			: []
	);

afterEach(() => {
	vi.restoreAllMocks();
});

test('two single-vendor saves queued offline both reach the backend', async () => {
	vi.spyOn(Date, 'now').mockReturnValue(NOW);
	let online = false;
	const calls: SavePayload[] = [];
	const results: boolean[] = [];
	const save = vi.fn((payload: SavePayload) => {
		calls.push(payload);
		results.push(online);
		return online
			? Promise.resolve({ ok: true, subjectId: payload.subjectId })
			: Promise.reject(new TypeError('offline'));
	});
	const kernel = accountKernel(save);
	try {
		await kernel.commands.save({}, { vendors: { a: false } });
		await kernel.commands.save({}, { vendors: { b: false } });
		expect(calls.map((payload) => payload.vendorChoice?.grants)).toEqual([
			{ a: false },
			{ b: false },
		]);

		online = true;
		kernel.replaySaves();
		await vi.waitFor(() =>
			expect(accepted(calls, results)).toEqual(
				expect.arrayContaining([
					['a', false],
					['b', false],
				])
			)
		);
	} finally {
		kernel.dispose();
	}
});

test('a single-vendor save that fails while another vendor is saved is still queued', async () => {
	vi.spyOn(Date, 'now').mockReturnValue(NOW);
	const calls: SavePayload[] = [];
	const results: boolean[] = [];
	const answers: PromiseWithResolvers<SaveResult>[] = [];
	const save = vi.fn((payload: SavePayload) => {
		calls.push(payload);
		const answer = Promise.withResolvers<SaveResult>();
		answers.push(answer);
		return answer.promise;
	});
	const kernel = accountKernel(save);
	try {
		const first = kernel.commands.save({}, { vendors: { a: false } });
		await vi.waitFor(() => expect(calls).toHaveLength(1));
		const second = kernel.commands.save({}, { vendors: { b: false } });
		await vi.waitFor(() => expect(calls).toHaveLength(2));
		results.push(false, true);
		answers[0]?.reject(new TypeError('offline'));
		answers[1]?.resolve({ ok: true, subjectId: SUBJECT_UUID });
		await Promise.all([first, second]);
		await settled();

		save.mockImplementation((payload: SavePayload) => {
			calls.push(payload);
			results.push(true);
			return Promise.resolve({ ok: true, subjectId: payload.subjectId });
		});
		kernel.replaySaves();
		await vi.waitFor(() =>
			expect(accepted(calls, results)).toContainEqual(['a', false])
		);
	} finally {
		kernel.dispose();
	}
});
