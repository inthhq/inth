/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
	matchedResolution,
	NOW,
	noticeRule,
	optOutRule,
} from '../../../__tests__/fixtures/kernel-fixtures';
import { createConsentKernel } from '../../../index';
import {
	C15T_STORAGE_KEY,
	PENDING_SAVES_STORAGE_KEY,
	STORAGE_KEY_V2,
	SUBJECT_REASSIGNMENTS_STORAGE_KEY,
} from '../../../libs/storage-keys';
import { readStoredRecordsFromCookieHeader } from '../hydrate';
import { createPersistence } from '../index';
import type { StorageConfig } from '../index';
import {
	clearStoredConsentRecords,
	writeStoredNoticeDismissal,
	writeStoredVendorChoice,
} from './record-writes';

/**
 * Run the macrotask write scheduler without firing the kernel's expiry
 * deadline timer, which would move the fake clock past the grant lifetime.
 */
const flushWrites = function flushWrites(): void {
	vi.advanceTimersByTime(0);
};

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
	localStorage.clear();
	clearStoredConsentRecords();
	// A clear keeps its epoch and the subject ID; start every test without
	// either.
	for (const key of [STORAGE_KEY_V2, C15T_STORAGE_KEY]) {
		document.cookie = `${key}-epoch=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
	}
	document.cookie = `${C15T_STORAGE_KEY}-sid=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
});

afterEach(() => {
	clearStoredConsentRecords();
	vi.useRealTimers();
});

const cookieNames = function cookieNames(): string[] {
	return document.cookie
		.split(';')
		.map((part) => part.trim().split('=')[0] ?? '')
		.filter(Boolean)
		.sort();
};

describe('persistence: hydration', () => {
	test('does nothing when nothing is stored', () => {
		const kernel = createConsentKernel({ now: NOW });
		const handle = createPersistence({ kernel });
		expect(kernel.getSnapshot().explicitChoice).toBeNull();
		expect(kernel.getSnapshot().explicitChoice).toBeNull();
		handle.dispose();
	});

	test('hydrates a stored choice into a fresh kernel', async () => {
		const pre = createConsentKernel({ now: NOW });
		const seed = createPersistence({ kernel: pre });
		await pre.commands.save({ marketing: true, measurement: true });
		flushWrites();
		seed.dispose();

		const kernel = createConsentKernel({ now: NOW });
		createPersistence({ kernel });
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(true);
		expect(kernel.getSnapshot().effectivePermissions.measurement).toBe(true);
		expect(
			Object.keys(kernel.getSnapshot().explicitChoice?.categories ?? {})
		).not.toHaveLength(0);
		expect(kernel.getSnapshot().subject?.subjectId ?? null).toBe(
			pre.getSnapshot().subject?.subjectId ?? null
		);
		expect(kernel.getSnapshot().explicitChoice).toEqual(
			pre.getSnapshot().explicitChoice
		);
	});

	test('hydration never calls transport.save or records a choice', async () => {
		const pre = createConsentKernel({ now: NOW });
		const seed = createPersistence({ kernel: pre });
		await pre.commands.save({ marketing: true });
		flushWrites();
		seed.dispose();

		const save = vi.fn().mockResolvedValue({ ok: true });
		const kernel = createConsentKernel({ now: NOW, transport: { save } });
		const choiceRecorded = vi.fn();
		kernel.events.on('choice:recorded', choiceRecorded);
		createPersistence({ kernel });

		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(true);
		expect(save).not.toHaveBeenCalled();
		expect(choiceRecorded).not.toHaveBeenCalled();
	});

	test('skipHydration skips the read', async () => {
		const pre = createConsentKernel({ now: NOW });
		const seed = createPersistence({ kernel: pre });
		await pre.commands.save('all');
		flushWrites();
		seed.dispose();

		const kernel = createConsentKernel({ now: NOW });
		createPersistence({ kernel, skipHydration: true });
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
		expect(kernel.getSnapshot().explicitChoice).toBeNull();
	});
});

describe('persistence: write path', () => {
	test('a staged draft never writes', () => {
		const kernel = createConsentKernel({ now: NOW });
		createPersistence({ kernel });
		kernel.set.draft({ marketing: true });
		flushWrites();
		expect(localStorage.getItem(STORAGE_KEY_V2)).toBeNull();
		// Startup stores nothing, not even the subject ID.
		expect(cookieNames()).toEqual([]);
	});

	test('writes the v3 envelope after save()', async () => {
		const kernel = createConsentKernel({ now: NOW });
		createPersistence({ kernel });
		await kernel.commands.save({ marketing: true, measurement: true });
		flushWrites();

		expect(localStorage.getItem(STORAGE_KEY_V2)).toContain('"version":3');
		expect(document.cookie).toContain(`${STORAGE_KEY_V2}=v=3&`);
		const read = createConsentKernel({ now: NOW });
		createPersistence({ kernel: read });
		expect(read.getSnapshot().effectivePermissions.marketing).toBe(true);
		expect(read.getSnapshot().effectivePermissions.measurement).toBe(true);
	});

	test('stores the recorded choice before its save request leaves', async () => {
		// The save outbox sends no earlier than the macrotask after the
		// commit; the write scheduled from the commit runs first.
		let storedAtSend: string | null = null;
		const save = vi.fn(() => {
			storedAtSend = localStorage.getItem(STORAGE_KEY_V2);
			return Promise.resolve({ ok: true });
		});
		const kernel = createConsentKernel({ now: NOW, transport: { save } });
		createPersistence({ kernel });

		const pending = kernel.commands.save({ marketing: true });
		await vi.advanceTimersByTimeAsync(0);
		await pending;

		expect(save).toHaveBeenCalledTimes(1);
		expect(storedAtSend).toContain('"version":3');
	});

	test('an unchanged repeat save still refreshes the confirmed receipts', async () => {
		const kernel = createConsentKernel({ now: NOW });
		createPersistence({ kernel });
		await kernel.commands.save('all');
		flushWrites();

		vi.setSystemTime(NOW + 1000);
		await kernel.commands.save({ marketing: true });
		flushWrites();

		const read = createConsentKernel({ now: NOW + 1000 });
		createPersistence({ kernel: read });
		const categories = read.getSnapshot().explicitChoice?.categories ?? {};
		expect(categories.marketing?.confirmedAt).toBe(NOW + 1000);
		expect(categories.measurement?.confirmedAt).toBe(NOW);
	});

	test('rapid saves are written once, after the interaction, with the final receipts', () => {
		const kernel = createConsentKernel({ now: NOW });
		createPersistence({ kernel });

		void kernel.commands.save({ marketing: true });
		vi.setSystemTime(NOW + 1);
		void kernel.commands.save({ marketing: false });
		vi.setSystemTime(NOW + 2);
		void kernel.commands.save({ marketing: true });
		// Nothing is written on the interaction path.
		expect(localStorage.getItem(STORAGE_KEY_V2)).toBeNull();
		flushWrites();

		const read = createConsentKernel({ now: NOW + 2 });
		createPersistence({ kernel: read });
		expect(read.getSnapshot().effectivePermissions.marketing).toBe(true);
		expect(
			read.getSnapshot().explicitChoice?.categories.marketing?.confirmedAt
		).toBe(NOW + 2);
	});

	test('a notice dismissal writes only the notice record and its projection', async () => {
		const kernel = createConsentKernel({
			initialPolicyResolution: matchedResolution(noticeRule()),
			now: NOW,
		});
		createPersistence({ kernel });
		expect(kernel.getSnapshot().promptRequirement.kind).toBe('notice');

		await kernel.commands.dismissNotice();
		flushWrites();

		expect(localStorage.getItem(STORAGE_KEY_V2)).toBeNull();
		expect(localStorage.getItem(`${STORAGE_KEY_V2}-notice`)).toContain(
			'"version":1'
		);
		// The ID from first load is bound to the acknowledgement in a
		// companion cookie; the v1 notice cookie keeps its format.
		expect(cookieNames()).toEqual([
			`${STORAGE_KEY_V2}-notice`,
			`${STORAGE_KEY_V2}-notice-subject`,
		]);

		const read = createConsentKernel({
			initialPolicyResolution: matchedResolution(noticeRule()),
			now: NOW + 1000,
		});
		createPersistence({ kernel: read });
		expect(read.getSnapshot().promptRequirement).toEqual({ kind: 'none' });
		expect(read.getSnapshot().explicitChoice).toBeNull();
		expect(read.getSnapshot().subject?.subjectId).toBe(
			kernel.getSnapshot().subject?.subjectId
		);
	});

	test('GPC restricts only while the signal is live and is never stored', () => {
		const rule = optOutRule({
			privacySignals: { gpc: { denyCategories: ['marketing'] } },
			prompt: 'none',
		});
		const kernel = createConsentKernel({
			initialPolicyResolution: matchedResolution(rule),
			now: NOW,
		});
		const handle = createPersistence({ kernel });
		kernel.set.privacySignals({ gpc: true });
		flushWrites();

		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
		expect(kernel.getSnapshot().restrictions.marketing).toEqual(['gpc']);
		expect(Object.keys(localStorage)).toEqual([]);
		expect(cookieNames()).toEqual([]);

		// The browser stops sending the signal: the restriction goes with it.
		kernel.set.privacySignals({ gpc: false });
		flushWrites();
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(true);
		expect(kernel.getSnapshot().restrictions.marketing).toBeUndefined();
		handle.dispose();

		// A fresh runtime over the same storage has nothing to restore.
		const read = createConsentKernel({
			initialPolicyResolution: matchedResolution(rule),
			now: NOW + 1000,
		});
		createPersistence({ kernel: read });
		expect(read.getSnapshot().effectivePermissions.marketing).toBe(true);
		expect(read.getSnapshot().restrictions).toEqual({});
	});
});

describe('persistence: clear', () => {
	test('removes every record, cancels queued writes and resets the kernel', async () => {
		const kernel = createConsentKernel({
			initialPolicyResolution: matchedResolution(
				noticeRule({
					privacySignals: { gpc: { denyCategories: ['marketing'] } },
				})
			),
			now: NOW,
		});
		const handle = createPersistence({ kernel });
		await kernel.commands.save({ marketing: false });
		await kernel.commands.dismissNotice();
		kernel.set.privacySignals({ gpc: true });
		localStorage.setItem(PENDING_SAVES_STORAGE_KEY, '[]');
		// A subject reassignment would otherwise tie the next subject to the
		// cleared one.
		localStorage.setItem(SUBJECT_REASSIGNMENTS_STORAGE_KEY, '[]');
		// A standing directive an earlier v3 alpha stored. Clearing still
		// removes it so the old value does not linger.
		localStorage.setItem(
			`${STORAGE_KEY_V2}-privacy`,
			JSON.stringify({
				directives: [
					{ categories: ['marketing'], recordedAt: NOW - 1, source: 'gpc' },
				],
				version: 1,
			})
		);
		document.cookie = `${STORAGE_KEY_V2}-privacy=v=1&d=gpc.${NOW - 1}.mk; path=/`;
		const subjectId = kernel.getSnapshot().subject?.subjectId;
		// Writes are still queued: clear must cancel them, not flush them.
		handle.clear();
		flushWrites();

		expect(localStorage.getItem(STORAGE_KEY_V2)).toBeNull();
		expect(localStorage.getItem(`${STORAGE_KEY_V2}-notice`)).toBeNull();
		expect(localStorage.getItem(PENDING_SAVES_STORAGE_KEY)).toBeNull();
		expect(localStorage.getItem(SUBJECT_REASSIGNMENTS_STORAGE_KEY)).toBeNull();
		const snap = kernel.getSnapshot();
		expect(snap.explicitChoice).toBeNull();
		expect(snap.noticeDismissal).toBeNull();
		// The subject ID stays in memory, so the visitor can still be reached.
		expect(snap.subject).toEqual({ subjectId });
		expect(snap.promptRequirement).toEqual({
			kind: 'notice',
			reason: 'missing',
		});
		// Only the clear epoch stays behind, so no record comes back. The
		// live signal alone keeps masking the permission.
		expect(Object.keys(localStorage).sort()).toEqual([
			`${STORAGE_KEY_V2}-epoch`,
		]);
		expect(cookieNames()).toEqual([`${STORAGE_KEY_V2}-epoch`]);
		expect(snap.effectivePermissions.marketing).toBe(false);
		expect(snap.restrictions.marketing).toEqual(['gpc']);
	});

	test('clear without a live signal leaves nothing behind', async () => {
		const kernel = createConsentKernel({
			initialPolicyResolution: matchedResolution(noticeRule()),
			now: NOW,
		});
		const handle = createPersistence({ kernel });
		await kernel.commands.save({ marketing: false });
		await kernel.commands.dismissNotice();
		flushWrites();
		expect(cookieNames()).toEqual([
			STORAGE_KEY_V2,
			`${STORAGE_KEY_V2}-notice`,
			`${STORAGE_KEY_V2}-notice-subject`,
		]);

		handle.clear();
		flushWrites();
		expect(Object.keys(localStorage).sort()).toEqual([
			`${STORAGE_KEY_V2}-epoch`,
		]);
		expect(cookieNames()).toEqual([`${STORAGE_KEY_V2}-epoch`]);
		expect(kernel.getSnapshot().explicitChoice).toBeNull();
	});
});

describe('persistence: records c15t stored', () => {
	const C15T = { storageKey: C15T_STORAGE_KEY };

	const saveUnder = async function saveUnder(
		storageConfig: StorageConfig | undefined,
		marketing: boolean
	): Promise<void> {
		const kernel = createConsentKernel({ now: NOW });
		const handle = createPersistence({ kernel, storageConfig });
		await kernel.commands.save({ marketing });
		flushWrites();
		handle.dispose();
	};

	const hydrated = function hydrated(storageConfig?: StorageConfig) {
		const kernel = createConsentKernel({ now: NOW });
		createPersistence({ kernel, storageConfig });
		return kernel.getSnapshot();
	};

	const deleteCookieNamed = function deleteCookieNamed(name: string): void {
		document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
	};

	test('storageKey c15t writes and reads the c15t family', async () => {
		await saveUnder(C15T, true);

		expect(cookieNames()).toContain(C15T_STORAGE_KEY);
		expect(cookieNames()).not.toContain(STORAGE_KEY_V2);
		expect(localStorage.getItem(C15T_STORAGE_KEY)).not.toBeNull();
		expect(localStorage.getItem(STORAGE_KEY_V2)).toBeNull();
		expect(hydrated(C15T).effectivePermissions.marketing).toBe(true);
	});

	test.each([
		['cookie', () => localStorage.removeItem(C15T_STORAGE_KEY)],
		['localStorage copy', () => deleteCookieNamed(C15T_STORAGE_KEY)],
	])(
		'the default key reads a choice from the c15t %s, and leaves it as it was',
		async (_name, keepOne) => {
			await saveUnder(C15T, true);
			keepOne();
			const stored = [document.cookie, localStorage.getItem(C15T_STORAGE_KEY)];

			expect(hydrated().effectivePermissions.marketing).toBe(true);
			flushWrites();
			expect([document.cookie, localStorage.getItem(C15T_STORAGE_KEY)]).toEqual(
				stored
			);
		}
	);

	test('an Inth record wins over a c15t one', async () => {
		await saveUnder(C15T, true);
		await saveUnder(undefined, false);

		expect(hydrated().effectivePermissions.marketing).toBe(false);
		expect(hydrated(C15T).effectivePermissions.marketing).toBe(true);
	});

	test('a server seed from a newer c15t cookie yields to an Inth record only localStorage holds', async () => {
		const inth = createConsentKernel({ now: NOW });
		const inthHandle = createPersistence({ kernel: inth });
		await inth.commands.save({ marketing: false, measurement: true });
		flushWrites();
		inthHandle.dispose();
		// The Inth cookie write was dropped; its localStorage copy landed.
		deleteCookieNamed(STORAGE_KEY_V2);
		vi.setSystemTime(NOW + 1000);
		const c15t = createConsentKernel({ now: NOW + 1000 });
		const c15tHandle = createPersistence({
			kernel: c15t,
			storageConfig: C15T,
		});
		await c15t.commands.save({ marketing: true, measurement: false });
		flushWrites();
		c15tHandle.dispose();

		const initialRecords = readStoredRecordsFromCookieHeader(
			document.cookie,
			undefined,
			NOW + 1000
		);
		expect(initialRecords.choice?.categories.marketing?.value).toBe(true);
		const kernel = createConsentKernel({ initialRecords, now: NOW + 1000 });
		createPersistence({ kernel, skipHydration: true });

		const { effectivePermissions } = kernel.getSnapshot();
		expect(effectivePermissions.marketing).toBe(false);
		expect(effectivePermissions.measurement).toBe(true);
		expect(effectivePermissions).toEqual(hydrated().effectivePermissions);
	});

	test.each([
		['Inth', undefined],
		['c15t', C15T],
	])(
		'a server seed from %s records read before another tab cleared keeps none of them',
		async (_name, storageConfig) => {
			await saveUnder(storageConfig, true);
			writeStoredVendorChoice(
				{ confirmedAt: NOW, denied: ['meta-pixel'], version: 1 },
				storageConfig,
				NOW
			);
			writeStoredNoticeDismissal(
				{ dismissedAt: NOW, fingerprint: 'notice', version: 1 },
				storageConfig,
				NOW
			);
			const initialRecords = readStoredRecordsFromCookieHeader(
				document.cookie,
				undefined,
				NOW
			);
			expect(initialRecords).toMatchObject({
				choice: { categories: { marketing: { value: true } } },
				noticeDismissal: { dismissedAt: NOW },
				vendorChoice: { denied: ['meta-pixel'] },
			});
			vi.setSystemTime(NOW + 1000);
			const other = createConsentKernel({ now: NOW + 1000 });
			createPersistence({ kernel: other }).clear();
			flushWrites();

			const kernel = createConsentKernel({ initialRecords, now: NOW + 1000 });
			createPersistence({ kernel, skipHydration: true });
			flushWrites();

			expect(kernel.getSnapshot()).toMatchObject({
				explicitChoice: null,
				noticeDismissal: null,
				vendorChoice: null,
			});
			expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
			expect(hydrated().explicitChoice).toBeNull();
		}
	);

	const seededKinds = [
		[
			'choice',
			'explicitChoice',
			(storageConfig?: StorageConfig) => saveUnder(storageConfig, true),
		],
		[
			'notice dismissal',
			'noticeDismissal',
			(storageConfig?: StorageConfig) =>
				writeStoredNoticeDismissal(
					{ dismissedAt: NOW, fingerprint: 'notice', version: 1 },
					storageConfig,
					NOW
				),
		],
		[
			'vendor denials',
			'vendorChoice',
			(storageConfig?: StorageConfig) =>
				writeStoredVendorChoice(
					{ confirmedAt: NOW, denied: ['meta-pixel'], version: 1 },
					storageConfig,
					NOW
				),
		],
	] as const;

	const serverSeed = function serverSeed() {
		return readStoredRecordsFromCookieHeader(document.cookie, undefined, NOW);
	};

	/** Lets a c15t tab clear, then mounts on a seed read before the clear. */
	const mountAfterC15tClear = function mountAfterC15tClear(
		initialRecords: ReturnType<typeof serverSeed>
	) {
		vi.setSystemTime(NOW + 1000);
		const c15tTab = createConsentKernel({ now: NOW + 1000 });
		createPersistence({ kernel: c15tTab, storageConfig: C15T }).clear();
		flushWrites();
		expect(cookieNames()).toContain(`${C15T_STORAGE_KEY}-epoch`);

		const kernel = createConsentKernel({ initialRecords, now: NOW + 1000 });
		createPersistence({ kernel, skipHydration: true });
		flushWrites();
		return kernel.getSnapshot();
	};

	test.each(seededKinds)(
		'a server seed from a c15t %s that a c15t tab cleared before mount keeps none of it',
		async (_name, field, store) => {
			await store(C15T);
			const initialRecords = serverSeed();
			expect(
				initialRecords[field === 'explicitChoice' ? 'choice' : field]
			).not.toBeNull();

			expect(mountAfterC15tClear(initialRecords)[field]).toBeNull();
		}
	);

	test('a server seed from a c15t grant a c15t tab cleared before mount yields to an Inth denial only localStorage holds', async () => {
		vi.setSystemTime(NOW - 1000);
		const inth = createConsentKernel({ now: NOW - 1000 });
		const inthHandle = createPersistence({ kernel: inth });
		await inth.commands.save({ marketing: false, measurement: true });
		flushWrites();
		inthHandle.dispose();
		// The Inth cookie write was dropped; its localStorage copy landed.
		deleteCookieNamed(STORAGE_KEY_V2);
		vi.setSystemTime(NOW);
		await saveUnder(C15T, true);
		const initialRecords = serverSeed();
		expect(initialRecords.choice?.categories.marketing?.value).toBe(true);

		const { effectivePermissions } = mountAfterC15tClear(initialRecords);
		expect(effectivePermissions.marketing).toBe(false);
		expect(effectivePermissions.measurement).toBe(true);
	});

	test.each([
		['', false],
		[' that a c15t tab cleared before mount', true],
	])(
		'a server seed from a c15t notice dismissal%s yields to an Inth dismissal only localStorage holds',
		(_name, cleared) => {
			vi.setSystemTime(NOW - 1000);
			writeStoredNoticeDismissal(
				{ dismissedAt: NOW - 1000, fingerprint: 'inth-notice', version: 1 },
				undefined,
				NOW - 1000
			);
			// The Inth notice cookie write was dropped; localStorage took it.
			for (const name of cookieNames().filter((cookie) =>
				cookie.startsWith(`${STORAGE_KEY_V2}-notice`)
			)) {
				deleteCookieNamed(name);
			}
			vi.setSystemTime(NOW);
			writeStoredNoticeDismissal(
				{ dismissedAt: NOW, fingerprint: 'c15t-notice', version: 1 },
				C15T,
				NOW
			);
			const initialRecords = serverSeed();
			expect(initialRecords.noticeDismissal?.fingerprint).toBe('c15t-notice');

			const snapshot = cleared
				? mountAfterC15tClear(initialRecords)
				: (() => {
						const kernel = createConsentKernel({ initialRecords, now: NOW });
						createPersistence({ kernel, skipHydration: true });
						return kernel.getSnapshot();
					})();
			expect(snapshot.noticeDismissal?.fingerprint).toBe('inth-notice');
		}
	);

	test('a c15t clear before mount never voids a seeded Inth choice', async () => {
		const first = createConsentKernel({ now: NOW });
		const firstHandle = createPersistence({ kernel: first });
		await first.commands.save({ marketing: false, measurement: true });
		flushWrites();
		firstHandle.dispose();
		const initialRecords = serverSeed();
		// An Inth tab grants after the server read. A stored grant never
		// lands on a seed it did not void, so only a void seed would take it.
		vi.setSystemTime(NOW + 500);
		const other = createConsentKernel({ now: NOW + 500 });
		const otherHandle = createPersistence({ kernel: other });
		await other.commands.save({ marketing: true, measurement: true });
		flushWrites();
		otherHandle.dispose();

		const { effectivePermissions } = mountAfterC15tClear(initialRecords);
		expect(effectivePermissions.measurement).toBe(true);
		expect(effectivePermissions.marketing).toBe(false);
	});

	test("a c15t tab's clear reaches an open page through its epoch alone", async () => {
		await saveUnder(C15T, true);
		localStorage.removeItem(C15T_STORAGE_KEY);
		const kernel = createConsentKernel({ now: NOW });
		const handle = createPersistence({ kernel });
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(true);

		vi.setSystemTime(NOW + 1000);
		const c15tTab = createConsentKernel({ now: NOW + 1000 });
		createPersistence({ kernel: c15tTab, storageConfig: C15T }).clear();
		flushWrites();
		window.dispatchEvent(
			new StorageEvent('storage', { key: `${C15T_STORAGE_KEY}-epoch` })
		);
		await vi.advanceTimersByTimeAsync(0);
		flushWrites();

		expect(kernel.getSnapshot().explicitChoice).toBeNull();
		handle.dispose();
	});

	test('a custom storageKey does not read c15t records', async () => {
		await saveUnder(C15T, true);

		expect(hydrated({ storageKey: 'shop' }).explicitChoice).toBeNull();
	});

	test('clear() leaves nothing of c15t to fall back to, even written back', async () => {
		await saveUnder(C15T, true);
		const written = localStorage.getItem(C15T_STORAGE_KEY);
		const kernel = createConsentKernel({ now: NOW });
		const handle = createPersistence({ kernel });
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(true);

		handle.clear();
		flushWrites();

		expect(localStorage.getItem(C15T_STORAGE_KEY)).toBeNull();
		expect(cookieNames()).toEqual([`${STORAGE_KEY_V2}-epoch`]);
		expect(hydrated().explicitChoice).toBeNull();
		// A c15t page still open writes its record back: the clear epoch
		// voids the decisions made before the clear.
		localStorage.setItem(C15T_STORAGE_KEY, written ?? '');
		expect(hydrated().explicitChoice).toBeNull();
	});
});

describe('persistence: dispose', () => {
	test('stops writing after dispose', async () => {
		const kernel = createConsentKernel({ now: NOW });
		const handle = createPersistence({ kernel });
		await kernel.commands.save('all');
		flushWrites();

		handle.dispose();

		await kernel.commands.save({ marketing: false });
		flushWrites();

		const read = createConsentKernel({ now: NOW });
		createPersistence({ kernel: read });
		expect(read.getSnapshot().effectivePermissions.marketing).toBe(true);
	});
});

test.each([false, true])(
	'save acknowledgement persists canonical subject only on success = %s',
	async (ok) => {
		const response = Promise.withResolvers<{
			ok: boolean;
			subjectId: string;
		}>();
		const kernel = createConsentKernel({
			initialPolicyResolution: matchedResolution(optOutRule()),
			initialRecords: { subject: { subjectId: 'sub_2VZxR7YmNpKq3WfLs8TgHd' } },
			transport: { save: () => response.promise },
		});
		const persistence = createPersistence({ kernel, skipHydration: true });
		const choices = vi.fn();
		kernel.events.on('choice:recorded', choices);
		const pending = kernel.commands.save({ marketing: false });
		const original = kernel.getSnapshot().explicitChoice;
		const provisionalSubject = kernel.getSnapshot().subject?.subjectId;
		await vi.advanceTimersByTimeAsync(0);
		vi.setSystemTime(NOW + 1000);
		response.resolve({ ok, subjectId: '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c' });
		await pending;
		flushWrites();
		const restored = createConsentKernel({
			initialPolicyResolution: matchedResolution(optOutRule()),
		});
		const reader = createPersistence({ kernel: restored });
		expect(restored.getSnapshot().explicitChoice).toEqual(original);
		expect(restored.getSnapshot().subject?.subjectId).toBe(
			ok ? '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c' : provisionalSubject
		);
		expect(choices).toHaveBeenCalledTimes(1);
		reader.dispose();
		restored.dispose();
		persistence.dispose();
		kernel.dispose();
	}
);

test('clear cancels a queued canonical subject write', async () => {
	const kernel = createConsentKernel({
		initialPolicyResolution: matchedResolution(optOutRule()),
		initialRecords: { subject: { subjectId: 'sub_2VZxR7YmNpKq3WfLs8TgHd' } },
		transport: {
			save: () =>
				Promise.resolve({
					ok: true,
					subjectId: '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c',
				}),
		},
	});
	const persistence = createPersistence({ kernel, skipHydration: true });
	kernel.events.on('subject:resolved', () => persistence.clear());
	const pending = kernel.commands.save({ marketing: false });
	await vi.advanceTimersByTimeAsync(0);
	await pending;
	flushWrites();
	// The clear keeps the subject ID in memory, and nothing else of the
	// subject.
	expect(kernel.getSnapshot().subject).toEqual({
		subjectId: '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c',
	});
	const restored = createConsentKernel();
	const reader = createPersistence({ kernel: restored });
	expect(restored.getSnapshot().explicitChoice).toBeNull();
	// No queued write brought the cleared record back under the canonical ID.
	expect(restored.getSnapshot().subject?.subjectId).not.toBe(
		'0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c'
	);
	reader.dispose();
	restored.dispose();
	persistence.dispose();
	kernel.dispose();
});
