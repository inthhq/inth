/**
 * @vitest-environment jsdom
 *
 * The save queue's own facts, through the kernel: how long a save waits,
 * how a `sub_` ID and the UUID it moved to are one subject, how a save is
 * found again after another tab moved it, and which answers move a visitor.
 * Two tabs are two kernels on one in-memory store.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type {
	KernelConfig,
	SavePayload,
	SaveResult,
} from '../../consent-kernel.model';
import { ConsentSaveRejectedError } from '../../index';
import { createKernel } from '../index';
import type { InternalKernel } from '../kernel-internals.model';
import { createMemoryOutboxStore } from '../save-outbox';
import type { SaveOutboxStore } from '../save-outbox';

// Loaded once up front, so its first import never outlasts a `vi.waitFor`.
await import('../save-outbox/queue');

/** A c15t visitor's `sub_` ID, the UUID the backend answers for it, another. */
const LEGACY = 'sub_2VZxR7YmNpKq3WfLs8TgHd';
const CANONICAL = '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c';
const OTHER = '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b9c';
const WEEK = 7 * 24 * 60 * 60 * 1000;

interface QueuedEntry {
	payload: SavePayload;
	queuedAt: number;
	attempts: number;
	seq?: number;
}

let store: SaveOutboxStore;
const tabs: InternalKernel[] = [];

beforeEach(() => {
	store = createMemoryOutboxStore();
});

afterEach(() => {
	for (const kernel of tabs.splice(0)) {
		kernel.dispose();
	}
	vi.useRealTimers();
	vi.restoreAllMocks();
});

/** A tab: a kernel on the shared store. */
const tab = function tab(config: KernelConfig): InternalKernel {
	const kernel = createKernel(config, { outboxStore: store });
	tabs.push(kernel);
	return kernel;
};

/** A tab whose visitor is on `subjectId`. */
const tabOn = (
	subjectId: string,
	transport: KernelConfig['transport']
): InternalKernel =>
	tab({ initialRecords: { subject: { subjectId } }, transport });

const queued = () =>
	store.transact((tx) => (tx.read('saves') ?? []) as QueuedEntry[]);

const reassignments = () =>
	store.transact((tx) => tx.read('reassignments') ?? []);

const subjectOf = (kernel: InternalKernel) =>
	kernel.getSnapshot().subject?.subjectId;

const offline = (_payload: SavePayload): Promise<SaveResult> =>
	Promise.reject(new TypeError('offline'));

/** Answers every save with `subjectId`. */
const answering =
	(subjectId: string) =>
	(_payload: SavePayload): Promise<SaveResult> =>
		Promise.resolve({ ok: true, subjectId });

/** A transport `save` whose answers the test gives, in request order. */
const heldSave = function heldSave() {
	const answers: PromiseWithResolvers<SaveResult>[] = [];
	const save = vi.fn((_payload: SavePayload) => {
		const answer = Promise.withResolvers<SaveResult>();
		answers.push(answer);
		return answer.promise;
	});
	return { answers, save };
};

/** Lets a replay that sends nothing run to its end. */
const settled = async () => {
	for (let turn = 0; turn < 5; turn += 1) {
		// oxlint-disable-next-line no-await-in-loop -- One macrotask after another.
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});
	}
};

test('a save queued with a time far ahead of the clock still expires a week later', async () => {
	vi.useFakeTimers({ toFake: ['Date'] });
	const now = 1_800_000_000_000;
	vi.setSystemTime(now);
	const save = vi.fn(offline);
	const kernel = tab({
		transport: { init: vi.fn().mockResolvedValue({}), save },
	});
	const errors: unknown[] = [];
	kernel.events.on('command:error', ({ error }) => errors.push(error));
	await kernel.commands.save('all');
	await store.transact((tx) => {
		tx.write(
			'saves',
			((tx.read('saves') ?? []) as QueuedEntry[]).map((entry) => ({
				...entry,
				queuedAt: now + 365 * 24 * 60 * 60 * 1000,
			}))
		);
	});

	kernel.replaySaves();
	// Read as queued now, and stored so. `vi.waitFor` moves the clock on.
	await vi.waitFor(async () => expect((await queued())[0]?.attempts).toBe(1));
	expect((await queued())[0]?.queuedAt).toBeLessThanOrEqual(Date.now());

	vi.setSystemTime(now + WEEK + 1);
	kernel.replaySaves();
	await vi.waitFor(async () => expect(await queued()).toEqual([]));
	expect(errors.at(-1)).toMatchObject({
		message: expect.stringContaining('more than 7 days'),
	});
});

test('a save under the UUID covers what another tab still queues under the sub_ ID it came from', async () => {
	const a = tabOn(LEGACY, { save: vi.fn(answering(CANONICAL)) });
	await a.commands.save({ measurement: true });
	await vi.waitFor(() => expect(subjectOf(a)).toBe(CANONICAL));
	// Nothing was queued under the sub_ ID, and the move is recorded anyway.
	expect(await reassignments()).toEqual([
		expect.objectContaining({ from: LEGACY, to: CANONICAL }),
	]);

	const bSave = vi.fn(offline);
	const b = tabOn(LEGACY, { save: bSave });
	await b.commands.save({ marketing: true });
	expect((await queued()).map(({ payload }) => payload.subjectId)).toEqual([
		LEGACY,
	]);

	await a.commands.save({ marketing: false });
	expect(await queued()).toEqual([]);

	bSave.mockImplementation(answering(CANONICAL));
	b.replaySaves();
	await settled();
	expect(bSave).toHaveBeenCalledTimes(1);
});

test('a save in flight whose entry another tab moved to the UUID is not resent, and leaves the queue when answered', async () => {
	const { answers, save } = heldSave();
	const a = tabOn(LEGACY, { save });
	const sent = a.commands.save({ marketing: true });
	await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));

	const b = tabOn(LEGACY, { save: answering(CANONICAL) });
	await b.commands.save({ measurement: true });
	expect((await queued()).map(({ payload }) => payload.subjectId)).toEqual([
		CANONICAL,
	]);

	// The moved entry is still the request tab A has out.
	a.replaySaves();
	await settled();
	expect(save).toHaveBeenCalledTimes(1);

	answers[0]?.resolve({ ok: true, subjectId: CANONICAL });
	await sent;
	expect(await queued()).toEqual([]);
});

test.each([
	[
		'accepted',
		(answer: PromiseWithResolvers<SaveResult>) =>
			answer.resolve({ ok: true, subjectId: CANONICAL }),
	],
	[
		'refused as invalid',
		(answer: PromiseWithResolvers<SaveResult>) =>
			answer.reject(
				new ConsentSaveRejectedError({
					code: 'invalid_request',
					message: 'refused',
					status: 400,
				})
			),
	],
])(
	'a replay %s leaves the queue after another tab moved its entry to the UUID',
	async (_answer, answer) => {
		const save = vi.fn(offline);
		const a = tabOn(LEGACY, { save });
		await a.commands.save({ marketing: true });
		const held = heldSave();
		save.mockImplementation(held.save);
		a.replaySaves();
		await vi.waitFor(() => expect(held.save).toHaveBeenCalledTimes(1));

		const b = tabOn(LEGACY, { save: answering(CANONICAL) });
		await b.commands.save({ measurement: true });
		expect((await queued()).map(({ payload }) => payload.subjectId)).toEqual([
			CANONICAL,
		]);

		answer(held.answers[0] as PromiseWithResolvers<SaveResult>);
		await vi.waitFor(async () => expect(await queued()).toEqual([]));
		a.replaySaves();
		await settled();
		expect(held.save).toHaveBeenCalledTimes(1);
	}
);

describe('an answer never moves a visitor off a UUID', () => {
	test('the answer to a save', async () => {
		const kernel = tabOn(CANONICAL, { save: answering(OTHER) });
		await kernel.commands.save({ marketing: true });
		await settled();
		expect(subjectOf(kernel)).toBe(CANONICAL);
		expect(await reassignments()).toEqual([]);
	});

	test('the answer to a replay', async () => {
		const save = vi.fn(offline);
		const kernel = tabOn(CANONICAL, { save });
		await kernel.commands.save({ marketing: true });
		save.mockImplementation(answering(OTHER));
		kernel.replaySaves();
		await vi.waitFor(async () => expect(await queued()).toEqual([]));
		await settled();
		expect(save).toHaveBeenCalledTimes(2);
		expect(subjectOf(kernel)).toBe(CANONICAL);
		expect(await reassignments()).toEqual([]);
	});

	test('the answer to a link', async () => {
		const kernel = tabOn(CANONICAL, {
			identify: vi.fn().mockResolvedValue({ subjectId: OTHER }),
		});
		await kernel.commands.identify({
			externalId: 'user-1',
			identityToken: 'token',
		});
		expect(subjectOf(kernel)).toBe(CANONICAL);
		expect(await reassignments()).toEqual([]);
	});
});
