/**
 * @vitest-environment jsdom
 *
 * An identity token is never written to browser storage with a queued save.
 * The first attempt carries it from memory; a replay goes without it, so the
 * backend records the save with the link left off.
 */
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	test,
	vi,
} from 'vite-plus/test';

import {
	matchedResolution,
	NOW,
	optInRule,
} from '../../__tests__/fixtures/kernel-fixtures';
import {
	planEarlyCommit,
	storeEarlyCommit,
} from '../../surface-actions/early-commit';
import type { KernelUser, SavePayload } from '../../types';
import { createKernel } from '../index';
import {
	createBrowserOutboxStore,
	createMemoryOutboxStore,
} from '../save-outbox';
import type { SaveOutboxStore } from '../save-outbox';

interface QueuedEntry {
	payload: SavePayload;
	queuedAt: number;
	attempts: number;
}

const USER: KernelUser = {
	externalId: 'user_123',
	identityProvider: 'clerk',
	identityToken: 'signed.identity.token',
};

const STORED_USER = { externalId: 'user_123', identityProvider: 'clerk' };

let store: SaveOutboxStore;

beforeEach(() => {
	store = createMemoryOutboxStore();
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

const storedText = function storedText(): Promise<string> {
	return store.transact((tx) => JSON.stringify(tx.read('saves') ?? []));
};

const queued = function queued(): Promise<QueuedEntry[]> {
	return store.transact((tx) => (tx.read('saves') ?? []) as QueuedEntry[]);
};

describe('identity token in the save queue', () => {
	test('the first attempt sends the token; the queue and the replays do not', async () => {
		vi.useFakeTimers({ now: 1_700_000_000_000 });
		const save = vi
			.fn<(payload: SavePayload) => Promise<{ ok: boolean }>>()
			.mockRejectedValueOnce(new Error('save offline'))
			.mockRejectedValueOnce(new Error('still offline'))
			.mockResolvedValue({ ok: true });
		const kernel = createKernel(
			{
				initialUser: USER,
				transport: { init: vi.fn().mockResolvedValue({}), save },
			},
			{ outboxStore: store }
		);

		const pending = kernel.commands.save('all');
		await vi.advanceTimersByTimeAsync(0);
		await pending;

		expect(save.mock.calls[0]?.[0].user).toEqual(USER);
		expect(await storedText()).not.toContain('signed.identity.token');
		expect((await queued())[0]?.payload.user).toEqual(STORED_USER);

		// A replay that fails again rewrites the entry, still without it.
		vi.setSystemTime(1_700_000_060_000);
		await kernel.commands.init();
		await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
		await vi.waitFor(async () => expect((await queued())[0]?.attempts).toBe(1));
		expect(await storedText()).not.toContain('signed.identity.token');

		vi.setSystemTime(1_700_000_120_000);
		await kernel.commands.init();
		await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(3));
		for (const [payload] of save.mock.calls.slice(1)) {
			expect(payload.user).toEqual(STORED_USER);
		}
		await vi.waitFor(async () => expect(await queued()).toEqual([]));
		kernel.dispose();
	});

	test('a save that succeeds with a token leaves nothing queued', async () => {
		const save = vi.fn((_payload: SavePayload) =>
			Promise.resolve({ ok: true })
		);
		const kernel = createKernel(
			{ initialUser: USER, transport: { save } },
			{ outboxStore: store }
		);

		// The first save queues through the outbox's own append; the second
		// through the queue module, once it has loaded.
		await kernel.commands.save({ measurement: true });
		await kernel.commands.save({ marketing: false });

		expect(save).toHaveBeenCalledTimes(2);
		expect(save.mock.calls[1]?.[0].user).toEqual(USER);
		expect(await queued()).toEqual([]);
		kernel.dispose();
	});

	test('a save of strictly necessary alone, sent with a token, leaves nothing queued', async () => {
		// Supersession never covers such a save, so only the exact stored
		// payload can match it.
		const save = vi.fn((_payload: SavePayload) =>
			Promise.resolve({ ok: true })
		);
		const kernel = createKernel(
			{
				consentCategories: ['necessary'],
				initialUser: USER,
				transport: { save },
			},
			{ outboxStore: store }
		);

		await kernel.commands.save('all');

		expect(save).toHaveBeenCalledTimes(1);
		expect(save.mock.calls[0]?.[0].user).toEqual(USER);
		expect(await queued()).toEqual([]);
		kernel.dispose();
	});

	test('a stored token is removed and not replayed', async () => {
		const firstSend = vi.fn(
			(_payload: SavePayload) => new Promise<{ ok: boolean }>(() => {})
		);
		const first = createKernel(
			{ initialUser: USER, transport: { save: firstSend } },
			{ outboxStore: store }
		);
		void first.commands.save({ measurement: true });
		await vi.waitFor(() => expect(firstSend).toHaveBeenCalledTimes(1));
		first.dispose();
		// A queue entry written with the token.
		await store.transact((tx) => {
			const entries = (tx.read('saves') ?? []) as QueuedEntry[];
			tx.write(
				'saves',
				entries.map((entry) => ({
					...entry,
					payload: { ...entry.payload, user: USER },
				}))
			);
		});
		expect(await storedText()).toContain('signed.identity.token');

		const replayed: SavePayload[] = [];
		const next = createKernel(
			{
				transport: {
					save: (payload) => {
						replayed.push(payload);
						return new Promise<{ ok: boolean }>(() => {});
					},
				},
			},
			{ outboxStore: store }
		);
		await next.commands.init();
		await vi.waitFor(() => expect(replayed).toHaveLength(1));

		expect(replayed[0]?.user).toEqual(STORED_USER);
		expect(await storedText()).not.toContain('signed.identity.token');
		next.dispose();
	});

	test('a save queued before the queue module loads removes older stored tokens', async () => {
		const first = createKernel(
			{
				initialUser: USER,
				transport: { save: () => new Promise<{ ok: boolean }>(() => {}) },
			},
			{ outboxStore: store }
		);
		void first.commands.save({ measurement: true });
		await vi.waitFor(async () => expect(await queued()).toHaveLength(1));
		first.dispose();
		// An entry an older client wrote with the token.
		await store.transact((tx) => {
			const entries = (tx.read('saves') ?? []) as QueuedEntry[];
			tx.write(
				'saves',
				entries.map((entry) => ({
					...entry,
					attempts: 2,
					payload: { ...entry.payload, user: USER },
				}))
			);
		});
		expect(await storedText()).toContain('signed.identity.token');

		const next = createKernel(
			{
				initialUser: USER,
				transport: { save: () => Promise.reject(new Error('offline')) },
			},
			{
				loadOutboxQueue: () => Promise.reject(new Error('offline')),
				outboxStore: store,
			}
		);
		await next.commands.save({ marketing: true });

		const entries = await queued();
		expect(entries).toHaveLength(2);
		expect(entries[0]?.attempts).toBe(2);
		expect(entries.map(({ payload }) => payload.user)).toEqual([
			STORED_USER,
			STORED_USER,
		]);
		expect(await storedText()).not.toContain('signed.identity.token');
		next.dispose();
	});

	test('an early commit queues its save without the token', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(NOW + 5000);
		const plan = planEarlyCommit({
			actionAt: NOW + 4000,
			choice: 'all',
			snapshot: createKernel(
				{
					consentCategories: ['necessary', 'measurement', 'marketing'],
					initialPolicyResolution: matchedResolution(
						optInRule({ categories: ['measurement', 'marketing'] })
					),
					initialRecords: { subject: { subjectId: 'subject-1' } },
					initialUser: USER,
					now: NOW,
				},
				{ outboxStore: store }
			).getSnapshot(),
		});
		if (!plan) {
			throw new Error('expected a commit');
		}
		expect(plan.payload.user).toEqual(USER);
		// A save an older client queued with its token.
		await store.transact((tx) => {
			tx.write('saves', [
				{
					attempts: 1,
					payload: { ...plan.payload, user: USER },
					queuedAt: NOW,
				},
			]);
		});

		await expect(storeEarlyCommit(plan, { outbox: store })).resolves.toBe(true);

		expect(await storedText()).not.toContain('signed.identity.token');
		const entries = await queued();
		expect(entries).toHaveLength(2);
		expect(entries.map(({ payload }) => payload.user)).toEqual([
			STORED_USER,
			STORED_USER,
		]);
		localStorage.clear();
	});

	test("a save moved from c15t's queue is stored without its token", async () => {
		const values = new Map<string, string>([
			[
				'c15t-v3-pending-consent-saves:v1',
				JSON.stringify([
					{
						attempts: 1,
						payload: { subjectId: 'sub_c15t', user: USER },
						queuedAt: NOW,
					},
				]),
			],
		]);
		const c15tStore = createBrowserOutboxStore({
			localStorage: () => ({
				getItem: (key) => values.get(key) ?? null,
				removeItem: (key) => {
					values.delete(key);
				},
				setItem: (key, value) => {
					values.set(key, value);
				},
			}),
			locks: () => null,
		});

		// Any transaction moves c15t's list, before the queue module reads it.
		await c15tStore.transact((tx) => tx.read('reassignments'));

		expect(values.has('c15t-v3-pending-consent-saves:v1')).toBe(false);
		expect(
			JSON.parse(values.get('inth-pending-consent-saves:v1') ?? '[]')
		).toEqual([
			{
				adoptedFrom: 'c15t',
				attempts: 1,
				payload: { subjectId: 'sub_c15t', user: STORED_USER },
				queuedAt: NOW,
				seq: 1,
			},
		]);
	});
});
