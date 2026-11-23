/**
 * The browser outbox store: localStorage under a Web Lock, in the format
 * earlier releases wrote, so saves a visitor queued before an upgrade
 * still replay. c15t's lists move into Inth's under the lock and replay
 * from there. Storage and locks are injected; the last test runs the default store against the
 * test window's localStorage.
 */
import { afterEach, describe, expect, test, vi } from 'vitest';

import { ConsentSaveRejectedError, createConsentKernel } from '../../index';
import type { KernelConfig, SavePayload, SaveResult } from '../../consent-kernel.model';
import { clearKernelRecords } from '../clear-records.model';
import { createKernel } from '../index';
import { createBrowserOutboxStore } from '../save-outbox';
import type { BrowserOutboxEnvironment } from '../save-outbox/save-outbox.store';
import { withStoredIdempotencyKey } from '../save-outbox/stored-key';

// The stored format is part of the interface: spelled out, not imported.
const SAVES_KEY = 'inth-pending-consent-saves:v1';
const REASSIGNMENTS_KEY = 'inth-subject-reassignments:v1';
const C15T_SAVES_KEY = 'c15t-v3-pending-consent-saves:v1';
const C15T_REASSIGNMENTS_KEY = 'c15t-v3-subject-reassignments:v1';
// Shared with c15t tabs.
const LOCK_NAME = 'c15t-v3-pending-consent-saves:v1';

afterEach(() => {
	vi.restoreAllMocks();
});

const memoryStorage = function memoryStorage(): Storage {
	const values = new Map<string, string>();
	return {
		clear: () => values.clear(),
		getItem: (key) => values.get(key) ?? null,
		key: (index) => [...values.keys()][index] ?? null,
		get length() {
			return values.size;
		},
		removeItem: (key) => {
			values.delete(key);
		},
		setItem: (key, value) => {
			values.set(key, value);
		},
	};
};

/** A lock manager that grants one request at a time, in order. */
const serialLocks = function serialLocks() {
	const names: string[] = [];
	let chain: Promise<unknown> = Promise.resolve();
	const locks = {
		request(name: string, run: () => unknown) {
			names.push(name);
			const granted = chain.then(run);
			chain = granted.catch(() => undefined);
			return granted;
		},
	} as unknown as LockManager;
	return { locks, names };
};

const kernelOn = function kernelOn(
	config: KernelConfig,
	environment: BrowserOutboxEnvironment
) {
	return createKernel(config, {
		outboxStore: createBrowserOutboxStore(environment),
	});
};

const offline = () => vi.fn().mockRejectedValue(new Error('save offline'));

/** A queued save as an earlier release wrote it. */
const legacyEntry = {
	attempts: 2,
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
	},
	queuedAt: Date.now() - 60_000,
};

describe('browser outbox store', () => {
	test('queues a failed save as a JSON list under the saves key', async () => {
		const storage = memoryStorage();
		const { locks, names } = serialLocks();
		const kernel = kernelOn(
			{ transport: { save: offline() } },
			{ localStorage: () => storage, locks: () => locks }
		);

		await kernel.commands.save('all');

		const stored = JSON.parse(storage.getItem(SAVES_KEY) ?? 'null');
		expect(stored).toEqual([
			{
				attempts: 0,
				payload: expect.objectContaining({
					consentAction: 'all',
					subjectId: kernel.getSnapshot().subject?.subjectId,
				}),
				queuedAt: expect.any(Number),
				seq: 1,
			},
		]);
		expect(new Set(names)).toEqual(new Set([LOCK_NAME]));
		kernel.dispose();
	});

	test('records a subject reassignment under the reassignments key', async () => {
		const storage = memoryStorage();
		const save = vi
			.fn()
			.mockRejectedValueOnce(
				new ConsentSaveRejectedError({
					code: 'subject_conflict',
					message: '/subjects responded 409',
					status: 409,
				})
			)
			.mockResolvedValue({ ok: true });
		const kernel = kernelOn(
			{
				initialRecords: { subject: { subjectId: 'sub_taken' } },
				transport: { save },
			},
			{ localStorage: () => storage, locks: () => null }
		);

		await kernel.commands.save('all');

		expect(JSON.parse(storage.getItem(REASSIGNMENTS_KEY) ?? 'null')).toEqual([
			{
				at: expect.any(Number),
				from: 'sub_taken',
				to: kernel.getSnapshot().subject?.subjectId,
			},
		]);
		kernel.dispose();
	});

	test('replays a save queued by an earlier release and removes the key', async () => {
		const storage = memoryStorage();
		storage.setItem(SAVES_KEY, JSON.stringify([legacyEntry]));
		const save = vi.fn().mockResolvedValue({ ok: true });
		const kernel = kernelOn(
			{ transport: { init: vi.fn().mockResolvedValue({}), save } },
			{ localStorage: () => storage, locks: () => serialLocks().locks }
		);

		await kernel.commands.init();
		await vi.waitFor(() => {
			expect(storage.getItem(SAVES_KEY)).toBeNull();
		});
		expect(save).toHaveBeenCalledWith(
			{ ...legacyEntry.payload, idempotencyKey: expect.any(String) },
			{ replay: true }
		);
		kernel.dispose();
	});

	test('replays a save a c15t page queued and removes its key', async () => {
		const storage = memoryStorage();
		storage.setItem(C15T_SAVES_KEY, JSON.stringify([legacyEntry]));
		const save = vi.fn().mockResolvedValue({ ok: true });
		const kernel = kernelOn(
			{ transport: { init: vi.fn().mockResolvedValue({}), save } },
			{ localStorage: () => storage, locks: () => serialLocks().locks }
		);

		await kernel.commands.init();
		await vi.waitFor(() => {
			// The key the save would get had it never moved.
			expect(save).toHaveBeenCalledWith(
				withStoredIdempotencyKey(
					legacyEntry.payload as SavePayload,
					legacyEntry.queuedAt
				),
				{ replay: true }
			);
		});
		await vi.waitFor(() => {
			expect(storage.getItem(SAVES_KEY)).toBeNull();
		});
		expect(save).toHaveBeenCalledTimes(1);
		expect(storage.getItem(C15T_SAVES_KEY)).toBeNull();
		kernel.dispose();
	});

	test("a c15t tab's clear after the move voids the save it queued", async () => {
		const storage = memoryStorage();
		storage.setItem(C15T_SAVES_KEY, JSON.stringify([legacyEntry]));
		const save = offline();
		const transport = { init: vi.fn().mockResolvedValue({}), save };
		const environment = {
			localStorage: () => storage,
			locks: () => serialLocks().locks,
		};
		const first = kernelOn({ transport }, environment);
		await first.commands.init();
		await vi.waitFor(() => {
			expect(save).toHaveBeenCalledTimes(1);
		});
		first.dispose();
		expect(storage.getItem(C15T_SAVES_KEY)).toBeNull();
		expect(storage.getItem(SAVES_KEY)).not.toBeNull();

		// The visitor clears in a c15t tab still open.
		storage.setItem('c15t-epoch', String(Date.now()));
		const second = kernelOn({ transport }, environment);
		await second.commands.init();
		await vi.waitFor(() => {
			expect(storage.getItem(SAVES_KEY)).toBeNull();
		});
		expect(save).toHaveBeenCalledTimes(1);
		second.dispose();
	});

	test('follows a subject reassignment a c15t page recorded', async () => {
		const storage = memoryStorage();
		storage.setItem(
			C15T_REASSIGNMENTS_KEY,
			JSON.stringify([{ at: Date.now(), from: 'sub_taken', to: 'sub_c15t' }])
		);
		const save = vi
			.fn()
			.mockRejectedValueOnce(
				new ConsentSaveRejectedError({
					code: 'subject_conflict',
					message: '/subjects responded 409',
					status: 409,
				})
			)
			.mockResolvedValue({ ok: true });
		const kernel = kernelOn(
			{
				initialRecords: { subject: { subjectId: 'sub_taken' } },
				transport: { save },
			},
			{ localStorage: () => storage, locks: () => serialLocks().locks }
		);

		await kernel.commands.save('all');

		expect(kernel.getSnapshot().subject?.subjectId).toBe('sub_c15t');
		expect(storage.getItem(C15T_REASSIGNMENTS_KEY)).toBeNull();
		expect(JSON.parse(storage.getItem(REASSIGNMENTS_KEY) ?? 'null')).toEqual([
			{
				adoptedFrom: 'c15t',
				at: expect.any(Number),
				from: 'sub_taken',
				to: 'sub_c15t',
			},
		]);
		kernel.dispose();
	});

	test("merges c15t's saves into the queue, which still narrows and dedupes them", async () => {
		const storage = memoryStorage();
		const entryFor = (subjectId: string, marketing: boolean, at: number) => ({
			...legacyEntry,
			payload: {
				...legacyEntry.payload,
				choice: {
					categories: {
						marketing: {
							basis: { fingerprint: 'fp', kind: 'choice-v1' },
							confirmedAt: at,
							value: marketing,
						},
					},
					version: 3,
				},
				confirmed: { actionAt: at, categories: { marketing } },
				consents: { marketing, necessary: true },
				givenAt: at,
				subject: { subjectId },
				subjectId,
			},
		});
		const older = entryFor('sub_legacy', true, 1_700_000_000_000);
		const other = entryFor('sub_other', true, 1_700_000_000_000);
		const newer = entryFor('sub_legacy', false, 1_700_000_001_000);
		storage.setItem(SAVES_KEY, JSON.stringify([older, other]));
		storage.setItem(C15T_SAVES_KEY, JSON.stringify([newer, other]));
		const save = vi.fn().mockResolvedValue({ ok: true });
		const kernel = kernelOn(
			{ transport: { init: vi.fn().mockResolvedValue({}), save } },
			{ localStorage: () => storage, locks: () => serialLocks().locks }
		);

		await kernel.commands.init();
		await vi.waitFor(() => {
			expect(storage.getItem(SAVES_KEY)).toBeNull();
		});
		// In queue order: c15t's entries were queued after these, in their own
		// order.
		expect(save.mock.calls.map(([payload]) => payload)).toEqual([
			{ ...newer.payload, idempotencyKey: expect.any(String) },
			{ ...other.payload, idempotencyKey: expect.any(String) },
		]);
		expect(storage.getItem(C15T_SAVES_KEY)).toBeNull();
		kernel.dispose();
	});

	test.each([
		{ label: 'invalid JSON', stored: '{not json' },
		{ label: 'a non-array value', stored: '{"payload":{}}' },
	])("drops c15t's lists when they hold $label", async ({ stored }) => {
		const storage = memoryStorage();
		storage.setItem(C15T_SAVES_KEY, stored);
		storage.setItem(C15T_REASSIGNMENTS_KEY, stored);
		const save = vi.fn().mockResolvedValue({ ok: true });
		const kernel = kernelOn(
			{ transport: { init: vi.fn().mockResolvedValue({}), save } },
			{ localStorage: () => storage, locks: () => serialLocks().locks }
		);

		await kernel.commands.init();
		await vi.waitFor(() => {
			expect(storage.getItem(C15T_SAVES_KEY)).toBeNull();
		});
		expect(storage.getItem(C15T_REASSIGNMENTS_KEY)).toBeNull();
		expect(storage.getItem(SAVES_KEY)).toBeNull();
		expect(save).not.toHaveBeenCalled();
		kernel.dispose();
	});

	test("a clear removes c15t's lists too, at once and again under the lock", async () => {
		const storage = memoryStorage();
		storage.setItem(C15T_SAVES_KEY, JSON.stringify([legacyEntry]));
		storage.setItem(
			C15T_REASSIGNMENTS_KEY,
			JSON.stringify([{ at: Date.now(), from: 'sub_old', to: 'sub_legacy' }])
		);
		const { locks } = serialLocks();
		let releaseLock: () => void = () => {};
		void locks.request(
			LOCK_NAME,
			() =>
				new Promise<void>((resolve) => {
					releaseLock = resolve;
				})
		);
		const kernel = kernelOn(
			{ initialRecords: { subject: { subjectId: 'sub_legacy' } } },
			{ localStorage: () => storage, locks: () => locks }
		);
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});

		clearKernelRecords(kernel);
		expect(storage.getItem(C15T_SAVES_KEY)).toBeNull();
		expect(storage.getItem(C15T_REASSIGNMENTS_KEY)).toBeNull();

		// A c15t tab's transaction that read its list before the clear.
		storage.setItem(C15T_SAVES_KEY, JSON.stringify([legacyEntry]));
		releaseLock();
		await vi.waitFor(() => {
			expect(storage.getItem(C15T_SAVES_KEY)).toBeNull();
			expect(storage.getItem(SAVES_KEY)).toBeNull();
		});
		kernel.dispose();
	});

	test.each([
		{ label: 'invalid JSON', stored: '{not json' },
		{ label: 'a non-array value', stored: '{"payload":{}}' },
	])('resets a queue holding $label', async ({ stored }) => {
		const storage = memoryStorage();
		storage.setItem(SAVES_KEY, stored);
		const save = vi.fn().mockResolvedValue({ ok: true });
		const kernel = kernelOn(
			{ transport: { init: vi.fn().mockResolvedValue({}), save } },
			{ localStorage: () => storage, locks: () => null }
		);

		await kernel.commands.init();
		await vi.waitFor(() => {
			expect(storage.getItem(SAVES_KEY)).toBeNull();
		});
		expect(save).not.toHaveBeenCalled();
		kernel.dispose();
	});

	test('waits for the Web Lock another tab holds', async () => {
		const storage = memoryStorage();
		const { locks } = serialLocks();
		const kernel = kernelOn(
			{
				initialRecords: { subject: { subjectId: 'sub_fixed' } },
				transport: { save: offline() },
			},
			{ localStorage: () => storage, locks: () => locks }
		);
		let releaseLock: () => void = () => {};
		void locks.request(
			LOCK_NAME,
			() =>
				new Promise<void>((resolve) => {
					releaseLock = resolve;
				})
		);
		const completed: boolean[] = [];
		kernel.events.on('command:save:completed', ({ result }) => {
			completed.push(result.ok);
		});

		const pending = kernel.commands.save('all');
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});
		expect(storage.getItem(SAVES_KEY)).toBeNull();
		expect(completed).toEqual([]);

		releaseLock();
		await expect(pending).resolves.toMatchObject({ ok: false });
		expect(completed).toEqual([false]);
		expect(JSON.parse(storage.getItem(SAVES_KEY) ?? '[]')).toHaveLength(1);
		kernel.dispose();
	});

	test('a clear empties the queue before it returns, even while another tab holds the lock', async () => {
		// The page clearing the records can close before the lock is granted.
		// Its queued saves must not replay for the cleared subject on the
		// next page.
		const storage = memoryStorage();
		storage.setItem(SAVES_KEY, JSON.stringify([legacyEntry]));
		storage.setItem(
			REASSIGNMENTS_KEY,
			JSON.stringify([{ at: Date.now(), from: 'sub_old', to: 'sub_legacy' }])
		);
		const { locks } = serialLocks();
		void locks.request(
			LOCK_NAME,
			() =>
				new Promise<void>(() => {
					// Never released.
				})
		);
		const kernel = kernelOn(
			{ initialRecords: { subject: { subjectId: 'sub_legacy' } } },
			{ localStorage: () => storage, locks: () => locks }
		);

		clearKernelRecords(kernel);

		expect(storage.getItem(SAVES_KEY)).toBeNull();
		expect(storage.getItem(REASSIGNMENTS_KEY)).toBeNull();
		kernel.dispose();

		// The next page: the lock is free again, and nothing is left to replay.
		const save = vi.fn().mockResolvedValue({ ok: true });
		const next = kernelOn(
			{ transport: { init: vi.fn().mockResolvedValue({}), save } },
			{ localStorage: () => storage, locks: () => serialLocks().locks }
		);
		await next.commands.init();
		await vi.waitFor(() => {
			expect(storage.getItem(SAVES_KEY)).toBeNull();
		});
		expect(save).not.toHaveBeenCalled();
		next.dispose();
	});

	test('a clear runs again under the lock, after a transaction that read the queue before it', async () => {
		// Another tab's transaction can read the queue before the clear and
		// write it back after. The clear waits for the lock and empties it
		// again.
		const storage = memoryStorage();
		const { locks } = serialLocks();
		let releaseLock: () => void = () => {};
		void locks.request(
			LOCK_NAME,
			() =>
				new Promise<void>((resolve) => {
					releaseLock = resolve;
				})
		);
		const kernel = kernelOn(
			{ initialRecords: { subject: { subjectId: 'sub_legacy' } } },
			{ localStorage: () => storage, locks: () => locks }
		);
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});

		clearKernelRecords(kernel);
		storage.setItem(SAVES_KEY, JSON.stringify([legacyEntry]));
		releaseLock();

		await vi.waitFor(() => {
			expect(storage.getItem(SAVES_KEY)).toBeNull();
		});
		kernel.dispose();
	});

	test('runs unsynchronized when the lock request rejects', async () => {
		const storage = memoryStorage();
		const request = vi.fn().mockRejectedValue(new Error('lock aborted'));
		const save = vi
			.fn()
			.mockRejectedValueOnce(new Error('save offline'))
			.mockResolvedValue({ ok: true });
		const kernel = kernelOn(
			{ transport: { init: vi.fn().mockResolvedValue({}), save } },
			{
				localStorage: () => storage,
				locks: () => ({ request }) as unknown as LockManager,
			}
		);

		await kernel.commands.save('all');
		expect(request).toHaveBeenCalled();
		expect(JSON.parse(storage.getItem(SAVES_KEY) ?? '[]')).toHaveLength(1);

		await kernel.commands.init();
		await vi.waitFor(() => {
			expect(storage.getItem(SAVES_KEY)).toBeNull();
		});
		expect(save).toHaveBeenCalledTimes(2);
		kernel.dispose();
	});

	test('a save still settles when storage throws', async () => {
		const storage = memoryStorage();
		const fail = () => {
			throw new Error('storage blocked');
		};
		storage.getItem = fail;
		storage.setItem = fail;
		storage.removeItem = fail;
		const kernel = kernelOn(
			{ transport: { save: offline() } },
			{ localStorage: () => storage, locks: () => null }
		);

		await expect(kernel.commands.save('all')).resolves.toMatchObject({
			ok: false,
		});
		kernel.dispose();
	});

	test('keeps the queue in memory without localStorage', async () => {
		// A host with no localStorage (a server, blocked storage) still
		// retries a failed save for as long as the kernel lives.
		const save = vi
			.fn()
			.mockRejectedValueOnce(new Error('save offline'))
			.mockResolvedValue({ ok: true });
		const kernel = kernelOn(
			{ transport: { init: vi.fn().mockResolvedValue({}), save } },
			{ localStorage: () => null, locks: () => null }
		);

		await kernel.commands.save('all');
		await kernel.commands.init();
		await vi.waitFor(() => {
			expect(save).toHaveBeenCalledTimes(2);
		});
		expect(save.mock.calls[1]?.[0]).toEqual(save.mock.calls[0]?.[0]);
		kernel.dispose();
	});

	test('the default store reads window.localStorage', async () => {
		window.localStorage.setItem(SAVES_KEY, JSON.stringify([legacyEntry]));
		const save = vi.fn().mockResolvedValue({ ok: true });
		const kernel = createConsentKernel({
			transport: { init: vi.fn().mockResolvedValue({}), save },
		});
		try {
			await kernel.commands.init();
			await vi.waitFor(() => {
				expect(window.localStorage.getItem(SAVES_KEY)).toBeNull();
			});
			expect(save).toHaveBeenCalledWith(
				{ ...legacyEntry.payload, idempotencyKey: expect.any(String) },
				{ replay: true }
			);
		} finally {
			kernel.dispose();
			window.localStorage.removeItem(SAVES_KEY);
		}
	});
});

describe('the UUID the backend answers for a sub_ id', () => {
	const UUID = '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c';
	/** A second queued save of the same visitor, from a later action. */
	const laterEntry = {
		...legacyEntry,
		payload: {
			...legacyEntry.payload,
			confirmed: {
				actionAt: 1_700_000_100_000,
				categories: { measurement: false },
			},
			givenAt: 1_700_000_100_000,
		},
		queuedAt: legacyEntry.queuedAt + 1000,
	};
	const subjects = (save: ReturnType<typeof vi.fn>) =>
		save.mock.calls.map(([payload]) => (payload as SavePayload).subjectId);

	test('a replay moves the visitor and the rest of the queue to it', async () => {
		const storage = memoryStorage();
		storage.setItem(C15T_SAVES_KEY, JSON.stringify([legacyEntry, laterEntry]));
		const save = vi.fn().mockResolvedValue({ ok: true, subjectId: UUID });
		const kernel = kernelOn(
			{
				initialRecords: { subject: { subjectId: 'sub_legacy' } },
				transport: { init: vi.fn().mockResolvedValue({}), save },
			},
			{ localStorage: () => storage, locks: () => serialLocks().locks }
		);

		await kernel.commands.init();
		await vi.waitFor(() => {
			expect(storage.getItem(SAVES_KEY)).toBeNull();
		});
		expect(subjects(save)).toEqual(['sub_legacy', UUID]);
		expect(kernel.getSnapshot().subject?.subjectId).toBe(UUID);
		kernel.dispose();
	});

	test('a direct save moves the saves queued under the sub_ id to it', async () => {
		const storage = memoryStorage();
		storage.setItem(SAVES_KEY, JSON.stringify([legacyEntry]));
		const save = vi.fn().mockResolvedValue({ ok: true, subjectId: UUID });
		const kernel = kernelOn(
			{
				initialRecords: { subject: { subjectId: 'sub_legacy' } },
				transport: { save },
			},
			{ localStorage: () => storage, locks: () => serialLocks().locks }
		);

		await kernel.commands.save({ measurement: true });

		expect(subjects(save)).toEqual(['sub_legacy']);
		expect(kernel.getSnapshot().subject?.subjectId).toBe(UUID);
		const queued = JSON.parse(storage.getItem(SAVES_KEY) ?? '[]') as {
			payload: SavePayload;
		}[];
		expect(queued.map((entry) => entry.payload.subjectId)).toEqual([UUID]);
		kernel.dispose();
	});

	test.each([
		['another category', { measurement: true }],
		['the same category, superseding it', { marketing: false }],
	] as const)(
		'a save answered after a newer choice in %s still moves the visitor and the queue to it',
		async (_name, newer) => {
			const storage = memoryStorage();
			const marketing = Promise.withResolvers<SaveResult>();
			const save = vi
				.fn()
				.mockReturnValueOnce(marketing.promise)
				.mockRejectedValueOnce(new Error('offline'));
			const kernel = kernelOn(
				{
					initialRecords: { subject: { subjectId: 'sub_legacy' } },
					transport: { save },
				},
				{ localStorage: () => storage, locks: () => serialLocks().locks }
			);

			const held = kernel.commands.save({ marketing: true });
			await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
			await kernel.commands.save(newer);
			marketing.resolve({ ok: true, subjectId: UUID });
			await held;

			expect(subjects(save)).toEqual(['sub_legacy', 'sub_legacy']);
			expect(kernel.getSnapshot().subject?.subjectId).toBe(UUID);
			const queued = JSON.parse(storage.getItem(SAVES_KEY) ?? '[]') as {
				payload: SavePayload;
			}[];
			expect(queued.map((entry) => entry.payload.subjectId)).toEqual([UUID]);
			kernel.dispose();
		}
	);

	test('a link moves the visitor to it', async () => {
		const storage = memoryStorage();
		const kernel = kernelOn(
			{
				initialRecords: { subject: { subjectId: 'sub_legacy' } },
				transport: {
					identify: vi.fn().mockResolvedValue({ subjectId: UUID }),
				},
			},
			{ localStorage: () => storage, locks: () => serialLocks().locks }
		);

		await kernel.commands.identify({
			externalId: 'user-1',
			identityToken: 'token',
		});

		expect(kernel.getSnapshot().subject?.subjectId).toBe(UUID);
		kernel.dispose();
	});
});
