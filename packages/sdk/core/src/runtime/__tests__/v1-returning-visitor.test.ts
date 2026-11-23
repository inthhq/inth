/** @vitest-environment jsdom */
/**
 * The runtime a page builds, against a fake `/v1` backend: a visitor a c15t
 * client consented for, and a device clock that is wrong.
 */
import type { PolicyResolution } from '@inth/sdk-schema/types';
import { writePolicyResolutionWire } from '@inth/sdk-schema/types';
import { translations } from '@inth/sdk-translations/en';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import {
	matchedResolution,
	optInRule,
} from '../../__tests__/fixtures/kernel-fixtures';
import { createConsentKernel } from '../../index';
import {
	C15T_STORAGE_KEY,
	PENDING_SAVES_STORAGE_KEY,
	STORAGE_KEY_V2,
} from '../../libs/storage-keys';
import { createPersistence } from '../../modules/persistence';
import { clearStoredConsentRecords } from '../../modules/persistence/__tests__/record-writes';
import { hosted } from '../../transports/mode';
import {
	LEGACY_SUBJECT,
	recordAnswer,
	SUBJECT,
} from '../../transports/v1/__tests__/fixtures';
import { createConsentRuntime } from '../index';
import type { ConsentRuntime, ConsentRuntimeOptions } from '../consent-runtime.model';

const CATEGORIES = ['necessary', 'measurement', 'marketing'] as const;
const policy: PolicyResolution = matchedResolution(optInRule());
const runtimes: ConsentRuntime[] = [];
interface SentRecord {
	answer: {
		categories: Record<string, { confirmedAt: number; value?: boolean }>;
	};
	confirmed: string[];
	givenAt: number;
	idempotencyKey: string;
	subjectId: string;
	vendorChoice?: { confirmedAt: number };
}
let records: SentRecord[] = [];
/** The backend's clock, which the device clock does not move. */
const SERVER_NOW = 1_800_000_000_000;
const HOUR = 3_600_000;
/** What the backend holds per category: a value and the time it stored. */
let backendHolds: Record<string, { at: number; value?: boolean }> = {};
/** The idempotency keys of the saves the backend stored. */
let storedKeys = new Set<string>();

/**
 * The backend's ordering of saves. It models the rule the hosted API is
 * about to adopt, not the one it runs today. A save whose key it already
 * stored changes nothing. The last save to arrive wins for the categories
 * it confirmed. A `givenAt` ahead of the backend's clock is stored as the
 * backend's time. A carried receipt is accepted whatever its time, and
 * never overwrites a newer stored value.
 */
const backendStores = function backendStores(record: SentRecord): void {
	if (storedKeys.has(record.idempotencyKey)) {
		return;
	}
	storedKeys.add(record.idempotencyKey);
	const at = Math.min(record.givenAt, SERVER_NOW);
	for (const [category, receipt] of Object.entries(record.answer.categories)) {
		if (record.confirmed.includes(category)) {
			backendHolds[category] = { at, value: receipt.value };
		} else if ((backendHolds[category]?.at ?? -1) < receipt.confirmedAt) {
			backendHolds[category] = {
				at: Math.min(receipt.confirmedAt, SERVER_NOW),
				value: receipt.value,
			};
		}
	}
};
const answerRecord = (init?: RequestInit) =>
	Promise.resolve(Response.json(recordAnswer(init)));
/** How the backend answers the next saves. */
let recordsAnswer: (init?: RequestInit) => Promise<Response> = answerRecord;
/** No request reaches the backend. */
let offline = false;

const backend: typeof globalThis.fetch = (input, init) => {
	const { pathname } = new URL(String(input));
	if (pathname === '/v1/consent/records') {
		if (offline) {
			return Promise.reject(new TypeError('offline'));
		}
		const record = JSON.parse(String(init?.body)) as SentRecord;
		records.push(record);
		return recordsAnswer(init).then((response) => {
			if (response.ok) {
				backendStores(record);
			}
			return response;
		});
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
const loadWith = async (
	options: Pick<ConsentRuntimeOptions, 'vendors'> = {}
): Promise<ConsentRuntime> => {
	const runtime = createConsentRuntime({
		consentCategories: [...CATEGORIES],
		mode: hosted({ fetch: backend, projectUrl: 'https://consent.example.com' }),
		prefetch: { initRetry: false },
		...options,
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

const load = () => loadWith();

const unload = (runtime: ConsentRuntime): void => {
	runtime.dispose();
	runtime.kernel.dispose();
};

/** Persistence writes after the action's macrotask. */
const settle = () =>
	new Promise((resolve) => {
		setTimeout(resolve, 0);
	});

const subjectOf = (runtime: ConsentRuntime) =>
	runtime.kernel.getSnapshot().subject?.subjectId;

/** The categories each save in the stored queue confirmed, in queue order. */
const queuedChoices = () =>
	(
		JSON.parse(localStorage.getItem(PENDING_SAVES_STORAGE_KEY) ?? '[]') as {
			payload: { confirmed: { categories: Record<string, boolean> } };
		}[]
	).map(({ payload }) => payload.confirmed.categories);

/** What the backend received for marketing, in order of arrival. */
const sentMarketing = () =>
	records.map((record) => record.answer.categories.marketing?.value);

interface StoredState {
	cookie: string;
	local: [string, string][];
}

/**
 * Watches writes to the stored queue, and keeps localStorage and cookies as
 * they stand at the first one `at` picks: before a removal, after a write.
 */
const watchQueue = function watchQueue(
	at: (write: { removed: boolean; value?: string }) => boolean
) {
	let state: StoredState | undefined;
	const real = window.localStorage;
	const keep = () => {
		state ??= { cookie: document.cookie, local: Object.entries({ ...real }) };
	};
	const watched = {
		clear: () => real.clear(),
		getItem: (key: string) => real.getItem(key),
		key: (index: number) => real.key(index),
		get length() {
			return real.length;
		},
		removeItem(key: string) {
			if (key === PENDING_SAVES_STORAGE_KEY && at({ removed: true })) {
				keep();
			}
			real.removeItem(key);
		},
		setItem(key: string, value: string) {
			real.setItem(key, value);
			if (key === PENDING_SAVES_STORAGE_KEY && at({ removed: false, value })) {
				keep();
			}
		},
	} as Storage;
	const getter = vi
		.spyOn(window, 'localStorage', 'get')
		.mockReturnValue(watched);
	return {
		state: () => {
			if (!state) {
				throw new Error('the queue was never written that way');
			}
			return state;
		},
		stop: () => getter.mockRestore(),
	};
};

/** A page load from storage as it stood in `state`, as after a crash. */
const loadFrom = function loadFrom(state: StoredState) {
	localStorage.clear();
	clearStoredConsentRecords();
	for (const [key, value] of state.local) {
		localStorage.setItem(key, value);
	}
	for (const cookie of state.cookie.split('; ')) {
		if (cookie) {
			document.cookie = `${cookie}; path=/`;
		}
	}
	return load();
};

/** What a c15t client left: its consent cookie and storage, and a sub_ id. */
const leaveC15tVisitor = async () => {
	const c15t = createConsentKernel({
		consentCategories: [...CATEGORIES],
		initialPolicyResolution: policy,
	});
	const c15tStorage = createPersistence({
		kernel: c15t,
		storageConfig: { storageKey: C15T_STORAGE_KEY },
	});
	c15t.set.subjectId(LEGACY_SUBJECT);
	await c15t.commands.save({ marketing: false, measurement: true });
	await settle();
	c15tStorage.dispose();
	c15t.dispose();
};

beforeEach(() => {
	localStorage.clear();
	clearStoredConsentRecords();
	records = [];
	backendHolds = {};
	storedKeys = new Set();
	offline = false;
	recordsAnswer = answerRecord;
});

afterEach(() => {
	for (const runtime of runtimes.splice(0)) {
		unload(runtime);
	}
	clearStoredConsentRecords();
	vi.useRealTimers();
});

test('a visitor with only c15t storage is not asked again, and saves under the UUID from then on', async () => {
	await leaveC15tVisitor();
	expect(localStorage.getItem(STORAGE_KEY_V2)).toBeNull();

	const page = await load();
	expect(page.kernel.getSnapshot().activeUI).toBe('none');
	expect(page.kernel.getSnapshot().effectivePermissions.measurement).toBe(true);
	expect(subjectOf(page)).toBe(LEGACY_SUBJECT);

	await page.kernel.commands.save({ marketing: true });
	await page.kernel.commands.save({ marketing: false });
	await settle();
	// The sub_ id goes out once; the backend's UUID replaces it.
	expect(records.map((record) => record.subjectId)).toEqual([
		LEGACY_SUBJECT,
		SUBJECT,
	]);
	expect(subjectOf(page)).toBe(SUBJECT);
	unload(page);

	const next = await load();
	expect(subjectOf(next)).toBe(SUBJECT);
	expect(next.kernel.getSnapshot().activeUI).toBe('none');
});

test('a save queued offline is sent after the device clock moved back', async () => {
	const queuedAt = 1_800_000_000_000;
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(queuedAt);
	const page = await load();
	recordsAnswer = () => Promise.reject(new TypeError('offline'));
	await page.kernel.commands.save({ marketing: false, measurement: true });

	vi.setSystemTime(queuedAt - 1000);
	recordsAnswer = answerRecord;
	window.dispatchEvent(new Event('online'));

	await vi.waitFor(() => expect(records).toHaveLength(2));
	expect(records[1]).toEqual(records[0]);
});

test.each([
	['another category', { measurement: true }],
	['the same category, superseding it', { marketing: false }],
] as const)(
	'a c15t visitor whose first save is answered after a newer choice in %s moves to the UUID, with the queued save',
	async (_name, newer) => {
		await leaveC15tVisitor();
		const page = await load();
		const first = Promise.withResolvers<Response>();
		recordsAnswer = () => first.promise;
		const held = page.kernel.commands.save({ marketing: true });
		await vi.waitFor(() => expect(records).toHaveLength(1));
		recordsAnswer = () => Promise.reject(new TypeError('offline'));
		await page.kernel.commands.save(newer);
		first.resolve(Response.json(recordAnswer({ body: '{}' })));
		await held;

		expect(subjectOf(page)).toBe(SUBJECT);
		recordsAnswer = answerRecord;
		window.dispatchEvent(new Event('online'));
		await vi.waitFor(() => expect(records).toHaveLength(3));
		expect(records.map((record) => record.subjectId)).toEqual([
			LEGACY_SUBJECT,
			LEGACY_SUBJECT,
			SUBJECT,
		]);
	}
);

test("a withdrawal sent from a device clock that moved back is the backend's last word", async () => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(SERVER_NOW);
	const page = await load();
	await page.kernel.commands.save({ marketing: true });

	vi.setSystemTime(SERVER_NOW - 3_600_000);
	await page.kernel.commands.save({ marketing: false });

	// Dated by the device clock alone, earlier than the grant it replaces.
	expect(records.map((record) => record.givenAt)).toEqual([
		SERVER_NOW,
		SERVER_NOW - 3_600_000,
	]);
	expect(backendHolds.marketing?.value).toBe(false);
	expect(
		page.kernel.getSnapshot().explicitChoice?.categories.marketing?.value
	).toBe(false);
});

test('a save from a device clock one hour ahead is accepted', async () => {
	const ahead = SERVER_NOW + 3_600_000;
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(ahead);
	const page = await load();
	const errors: unknown[] = [];
	page.kernel.events.on('command:error', ({ error }) => errors.push(error));

	const result = await page.kernel.commands.save({ marketing: true });
	await settle();

	// Dated by the device clock, nothing refused, nothing left queued.
	expect(result.ok).toBe(true);
	expect(errors).toEqual([]);
	expect(records).toHaveLength(1);
	expect(records[0]?.givenAt).toBe(ahead);
	expect(localStorage.getItem(PENDING_SAVES_STORAGE_KEY)).toBeNull();
});

test('a withdrawal queued after the clock was corrected replaces the grant queued while it ran ahead', async () => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(SERVER_NOW + 2 * HOUR);
	const page = await load();
	offline = true;
	await page.kernel.commands.save({ marketing: true });
	vi.setSystemTime(SERVER_NOW);
	await page.kernel.commands.save({ marketing: false });

	expect(queuedChoices()).toEqual([{ marketing: false }]);

	offline = false;
	window.dispatchEvent(new Event('online'));
	await vi.waitFor(() => expect(records).toHaveLength(1));
	await settle();
	expect(sentMarketing()).toEqual([false]);
	expect(backendHolds.marketing?.value).toBe(false);
	expect(localStorage.getItem(PENDING_SAVES_STORAGE_KEY)).toBeNull();
});

test('a withdrawal sent after the clock was corrected leaves nothing of the grant queued while it ran ahead', async () => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(SERVER_NOW + 2 * HOUR);
	const page = await load();
	offline = true;
	await page.kernel.commands.save({ marketing: true });
	vi.setSystemTime(SERVER_NOW);
	offline = false;
	await page.kernel.commands.save({ marketing: false });

	expect(localStorage.getItem(PENDING_SAVES_STORAGE_KEY)).toBeNull();
	window.dispatchEvent(new Event('online'));
	await settle();
	expect(sentMarketing()).toEqual([false]);
	expect(backendHolds.marketing?.value).toBe(false);
});

test('after a grant queued with the clock a minute fast and a withdrawal sent, the next page replays nothing', async () => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(SERVER_NOW + 60_000);
	const page = await load();
	offline = true;
	await page.kernel.commands.save({ marketing: true });
	vi.setSystemTime(SERVER_NOW);
	offline = false;
	await page.kernel.commands.save({ marketing: false });
	await settle();
	unload(page);

	await load();
	await settle();
	expect(sentMarketing()).toEqual([false]);
	expect(backendHolds.marketing?.value).toBe(false);
	expect(localStorage.getItem(PENDING_SAVES_STORAGE_KEY)).toBeNull();
});

test('two saves in flight under a sub_ ID end under the UUID, stored and not resent', async () => {
	await leaveC15tVisitor();
	const page = await load();
	const answers = [
		Promise.withResolvers<Response>(),
		Promise.withResolvers<Response>(),
	];
	recordsAnswer = () => answers[records.length - 1]?.promise ?? answerRecord();
	const first = page.kernel.commands.save({ marketing: true });
	await vi.waitFor(() => expect(records).toHaveLength(1));
	const second = page.kernel.commands.save({ measurement: false });
	await vi.waitFor(() => expect(records).toHaveLength(2));
	answers[0]?.resolve(Response.json(recordAnswer({ body: '{}' })));
	await first;
	answers[1]?.resolve(Response.json(recordAnswer({ body: '{}' })));
	await second;
	await settle();

	expect(records.map((record) => record.subjectId)).toEqual([
		LEGACY_SUBJECT,
		LEGACY_SUBJECT,
	]);
	expect(subjectOf(page)).toBe(SUBJECT);
	expect(localStorage.getItem(PENDING_SAVES_STORAGE_KEY)).toBeNull();
	unload(page);

	recordsAnswer = answerRecord;
	const next = await load();
	await settle();
	expect(subjectOf(next)).toBe(SUBJECT);
	expect(records).toHaveLength(2);
});

test('a reload as an accepted save leaves the queue resends it once under its key, and the answer moves the page to the UUID', async () => {
	await leaveC15tVisitor();
	const page = await load();
	const watch = watchQueue(({ removed }) => removed);
	await page.kernel.commands.save({ marketing: true });
	watch.stop();
	unload(page);

	const next = await loadFrom(watch.state());
	await vi.waitFor(() => expect(records).toHaveLength(2));
	await vi.waitFor(() => expect(subjectOf(next)).toBe(SUBJECT));
	// The backend took the same key twice and stored it once.
	expect(records[1]?.idempotencyKey).toBe(records[0]?.idempotencyKey);
	expect(storedKeys.size).toBe(1);
	expect(localStorage.getItem(PENDING_SAVES_STORAGE_KEY)).toBeNull();
});

test('a reload between the move of the queue to the UUID and the cookie write keeps the sub_ ID until the next save', async () => {
	await leaveC15tVisitor();
	const page = await load();
	offline = true;
	await page.kernel.commands.save({ marketing: true });
	offline = false;
	// The queue holds the grant under the UUID; the cookie still has sub_.
	const watch = watchQueue(
		({ value }) => value?.includes(`"subjectId":"${SUBJECT}"`) === true
	);
	await page.kernel.commands.save({ measurement: true });
	watch.stop();
	unload(page);

	const next = await loadFrom(watch.state());
	await vi.waitFor(() => expect(records).toHaveLength(2));
	await settle();
	// The replay went out under the UUID; the page stays on the sub_ ID,
	// which the backend maps to the same UUID.
	expect(records[1]?.subjectId).toBe(SUBJECT);
	expect(subjectOf(next)).toBe(LEGACY_SUBJECT);

	await next.kernel.commands.save({ marketing: false });
	expect(records[2]?.subjectId).toBe(LEGACY_SUBJECT);
	await vi.waitFor(() => expect(subjectOf(next)).toBe(SUBJECT));
	expect(backendHolds.marketing?.value).toBe(false);
});
