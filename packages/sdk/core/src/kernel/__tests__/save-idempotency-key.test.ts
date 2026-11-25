/**
 * @vitest-environment jsdom
 *
 * The idempotency key of a save: made once with the action, stored with the
 * queued payload, and sent unchanged by every replay.
 */
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	test,
	vi,
} from 'vite-plus/test';

import type { SavePayload } from '../../consent-kernel.model';
import { isUuidV7 } from '../../transports/v1/v1-request.api';
import { createKernel } from '../index';
import { createMemoryOutboxStore } from '../save-outbox';
import type { SaveOutboxStore } from '../save-outbox';
import { withStoredIdempotencyKey } from '../save-outbox/stored-key';

interface QueuedEntry {
	payload: SavePayload;
	queuedAt: number;
	attempts: number;
}

let store: SaveOutboxStore;

await import('../save-outbox/queue');

beforeEach(() => {
	store = createMemoryOutboxStore();
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

const queued = function queued(): Promise<QueuedEntry[]> {
	return store.transact((tx) => (tx.read('saves') ?? []) as QueuedEntry[]);
};

const UUID_V8_PATTERN =
	/^[\da-f]{8}-[\da-f]{4}-8[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/u;

/** A save a c15t client queued: no idempotency key. */
const keylessEntry = function keylessEntry(): QueuedEntry {
	return {
		attempts: 0,
		payload: {
			choice: {
				categories: {
					marketing: {
						basis: { fingerprint: 'fp', kind: 'choice-v1' },
						confirmedAt: 1_700_000_000_000,
						value: true,
					},
				},
				version: 3,
			},
			confirmed: {
				actionAt: 1_700_000_000_000,
				categories: { marketing: true },
			},
			consentAction: 'custom',
			consents: { marketing: true, necessary: true },
			givenAt: 1_700_000_000_000,
			model: 'opt-in',
			overrides: {},
			policySnapshotToken: null,
			subject: { subjectId: 'sub_legacy' },
			subjectId: 'sub_legacy',
			tcString: null,
			uiSource: 'banner',
			user: null,
		} as SavePayload,
		queuedAt: Date.now() - 60_000,
	};
};

/** `inner`, refusing every write, as a full localStorage does. */
const refusingWrites = function refusingWrites(
	inner: SaveOutboxStore
): SaveOutboxStore {
	return {
		clear: () => {},
		transact: (run) =>
			inner.transact((tx) => run({ read: tx.read, write: () => false })),
	};
};

/** Replay the stored queue from a new page, sending through `save`. */
const replayOnNewPage = async function replayOnNewPage(
	outboxStore: SaveOutboxStore,
	save: (payload: SavePayload) => Promise<{ ok: boolean }>
): Promise<void> {
	const kernel = createKernel(
		{ transport: { init: vi.fn().mockResolvedValue({}), save } },
		{ outboxStore }
	);
	await kernel.commands.init();
	await vi.waitFor(() => expect(save).toHaveBeenCalled());
	kernel.dispose();
};

describe('save idempotency key', () => {
	test('each action gets a key of its own', async () => {
		const saveSpy = vi.fn((payload: SavePayload) =>
			Promise.resolve({ ok: true, subjectId: payload.subjectId })
		);
		const kernel = createKernel(
			{ transport: { save: saveSpy } },
			{ outboxStore: store }
		);

		await kernel.commands.save({ measurement: true });
		await kernel.commands.save({ marketing: false });

		const keys = saveSpy.mock.calls.map(([payload]) => payload.idempotencyKey);
		expect(keys).toHaveLength(2);
		expect(keys.every((key) => key !== undefined && isUuidV7(key))).toBe(true);
		expect(keys[0]).not.toBe(keys[1]);
		kernel.dispose();
	});

	test('a queued save replays with the key it was made with', async () => {
		vi.useFakeTimers({ now: 1_700_000_000_000 });
		const saveSpy = vi
			.fn<(payload: SavePayload) => Promise<{ ok: boolean }>>()
			.mockRejectedValueOnce(new Error('save offline'))
			.mockResolvedValue({ ok: true });
		const kernel = createKernel(
			{ transport: { init: vi.fn().mockResolvedValue({}), save: saveSpy } },
			{ outboxStore: store }
		);

		const pendingSave = kernel.commands.save('all');
		await vi.advanceTimersByTimeAsync(0);
		await pendingSave;
		const original = saveSpy.mock.calls[0]?.[0].idempotencyKey;
		expect(original).toBeDefined();
		expect((await queued())[0]?.payload.idempotencyKey).toBe(original);

		vi.setSystemTime(1_700_000_060_000);
		await kernel.commands.init();
		await vi.waitFor(() => {
			expect(saveSpy).toHaveBeenCalledTimes(2);
		});
		expect(saveSpy.mock.calls[1]?.[0].idempotencyKey).toBe(original);
		kernel.dispose();
	});

	test('a later page replays a stored save with its stored key', async () => {
		const firstSend = vi.fn(
			(_payload: SavePayload) => new Promise<{ ok: boolean }>(() => {})
		);
		const first = createKernel(
			{ transport: { save: firstSend } },
			{ outboxStore: store }
		);
		void first.commands.save({ measurement: true });
		await vi.waitFor(() => expect(firstSend).toHaveBeenCalledTimes(1));
		const original = firstSend.mock.calls[0]?.[0].idempotencyKey;
		first.dispose();

		const replayed: SavePayload[] = [];
		const next = createKernel(
			{
				transport: {
					save: (payload) => {
						replayed.push(payload);
						return Promise.resolve({ ok: true });
					},
				},
			},
			{ outboxStore: store }
		);
		await next.commands.init();
		await vi.waitFor(() => expect(replayed).toHaveLength(1));
		expect(replayed[0]?.idempotencyKey).toBe(original);
		next.dispose();
	});

	test('a stored save whose key is not a string is dropped', async () => {
		await store.transact((tx) => {
			tx.write('saves', []);
		});
		const firstSend = vi.fn(
			(_payload: SavePayload) => new Promise<{ ok: boolean }>(() => {})
		);
		const first = createKernel(
			{ transport: { save: firstSend } },
			{ outboxStore: store }
		);
		void first.commands.save({ measurement: true });
		await vi.waitFor(() => expect(firstSend).toHaveBeenCalledTimes(1));
		first.dispose();
		await store.transact((tx) => {
			const entries = (tx.read('saves') ?? []) as QueuedEntry[];
			expect(entries).toHaveLength(1);
			expect(isUuidV7(entries[0]?.payload.idempotencyKey ?? '')).toBe(true);
			tx.write(
				'saves',
				entries.map((entry) => ({
					...entry,
					payload: { ...entry.payload, idempotencyKey: 42 },
				}))
			);
		});

		const replay = vi.fn(() => Promise.resolve({ ok: true }));
		const next = createKernel(
			{ transport: { save: replay } },
			{ outboxStore: store }
		);
		await next.commands.init();
		await vi.waitFor(async () => expect(await queued()).toEqual([]));
		expect(replay).not.toHaveBeenCalled();
		next.dispose();
	});

	test('a stored save without a key is sent with the same key on every attempt', async () => {
		await store.transact((tx) => {
			tx.write('saves', [keylessEntry()]);
		});
		const failed = vi.fn((_payload: SavePayload): Promise<{ ok: boolean }> =>
			Promise.reject(new Error('save offline'))
		);
		await replayOnNewPage(store, failed);
		const sent = vi.fn((_payload: SavePayload) =>
			Promise.resolve({ ok: true })
		);
		await replayOnNewPage(store, sent);

		const key = failed.mock.calls[0]?.[0].idempotencyKey;
		expect(key).toMatch(UUID_V8_PATTERN);
		expect(sent.mock.calls[0]?.[0].idempotencyKey).toBe(key);
		await vi.waitFor(async () => expect(await queued()).toEqual([]));
	});

	test('the key is the same when storage refuses to keep it', async () => {
		await store.transact((tx) => {
			tx.write('saves', [keylessEntry()]);
		});
		const full = refusingWrites(store);
		const first = vi.fn((_payload: SavePayload) =>
			Promise.resolve({ ok: false })
		);
		await replayOnNewPage(full, first);
		const second = vi.fn((_payload: SavePayload) =>
			Promise.resolve({ ok: true })
		);
		await replayOnNewPage(full, second);

		const key = first.mock.calls[0]?.[0].idempotencyKey;
		expect(key).toMatch(UUID_V8_PATTERN);
		expect(second.mock.calls[0]?.[0].idempotencyKey).toBe(key);
		expect((await queued())[0]?.payload.idempotencyKey).toBeUndefined();
	});

	test('the key changes with the queue time, the subject and the consents', () => {
		const { payload, queuedAt } = keylessEntry();
		const keyOf = (entry: SavePayload, at: number) =>
			withStoredIdempotencyKey(entry, at).idempotencyKey;
		const keys = new Set([
			keyOf(payload, queuedAt),
			keyOf(payload, queuedAt + 1),
			keyOf({ ...payload, subjectId: 'sub_other' }, queuedAt),
			keyOf(
				{ ...payload, consents: { ...payload.consents, marketing: false } },
				queuedAt
			),
		]);
		expect(keys.size).toBe(4);
	});

	test.each(['', 'not-a-uuid', '0193E5A8-7C1E-7B7A-9D7E-2F0C9A3B4D5E'])(
		'a stored key %j that is not a lowercase UUID is replaced by the keyless one',
		(key) => {
			const { payload, queuedAt } = keylessEntry();
			expect(
				withStoredIdempotencyKey({ ...payload, idempotencyKey: key }, queuedAt)
					.idempotencyKey
			).toBe(withStoredIdempotencyKey(payload, queuedAt).idempotencyKey);
		}
	);

	test('a stored save keeps its key across releases', () => {
		// A browser whose storage refuses the write-back derives the key again
		// after every upgrade. Changing this value sends its saves twice.
		expect(
			withStoredIdempotencyKey(keylessEntry().payload, 1_700_000_000_000)
				.idempotencyKey
		).toBe('9ec1f23d-d047-870b-8e05-f75a1d90b59a');
	});
});
