/** @vitest-environment jsdom */
/**
 * The runtime a page builds, against a fake `/v1` backend: a visitor a c15t
 * client consented for, and a device clock that moves back.
 */
import type { PolicyResolution } from '@inth/sdk-schema/types';
import { writePolicyResolutionWire } from '@inth/sdk-schema/types';
import { translations } from '@inth/sdk-translations/en';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

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
	v1Error,
} from '../../transports/v1/__tests__/fixtures';
import { createConsentRuntime } from '../index';
import type { ConsentRuntime, ConsentRuntimeOptions } from '../types';

const CATEGORIES = ['necessary', 'measurement', 'marketing'] as const;
const policy: PolicyResolution = matchedResolution(optInRule());
const runtimes: ConsentRuntime[] = [];
interface SentRecord {
	answer: {
		categories: Record<string, { confirmedAt: number; value?: boolean }>;
	};
	givenAt: number;
	idempotencyKey: string;
	subjectId: string;
	vendorChoice?: { confirmedAt: number };
}
let records: SentRecord[] = [];
/** The saves the backend answered with a 2xx. */
let accepted: SentRecord[] = [];
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
				accepted.push(record);
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

/** The backend's clock, which the device clock does not move. */
const SERVER_NOW = 1_800_000_000_000;

/** The backend refuses a `givenAt` more than ten minutes past its clock. */
const refusingTheFuture = (init?: RequestInit) =>
	(JSON.parse(String(init?.body)) as SentRecord).givenAt > SERVER_NOW + 600_000
		? Promise.resolve(v1Error(400, 'invalid_request'))
		: answerRecord(init);

/** Answers held until the test gives them, in request order. */
const holdAnswers = () => {
	const pending: ((response: Response | Error) => void)[] = [];
	recordsAnswer = () =>
		new Promise<Response>((resolve, reject) => {
			pending.push((answer) =>
				answer instanceof Error ? reject(answer) : resolve(answer)
			);
		});
	return {
		answer: (index: number, response: Response | Error) =>
			pending[index]?.(response),
		count: () => pending.length,
	};
};

/** What the backend keeps per category: the receipt with the later time. */
const backendWord = (category: string, saves: SentRecord[]) => {
	let kept: { confirmedAt: number; value?: boolean } | undefined;
	for (const record of saves) {
		const receipt = record.answer.categories[category];
		if (receipt && (!kept || receipt.confirmedAt >= kept.confirmedAt)) {
			kept = receipt;
		}
	}
	return kept?.value;
};

/** The saves the outbox holds in storage, oldest first. */
const queuedSaves = () =>
	(
		JSON.parse(localStorage.getItem(PENDING_SAVES_STORAGE_KEY) ?? '[]') as {
			payload: {
				confirmed: { categories: Record<string, boolean> };
				givenAt: number;
			};
		}[]
	).map(({ payload }) => ({
		categories: payload.confirmed.categories,
		givenAt: payload.givenAt,
	}));

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
	accepted = [];
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

test('a device clock that moved back dates the next save after the last one sent', async () => {
	const sentAt = 1_800_000_000_000;
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(sentAt);
	const page = await load();
	await page.kernel.commands.save({ marketing: true, measurement: true });

	vi.setSystemTime(sentAt - 3_600_000);
	await page.kernel.commands.save({ marketing: false, measurement: true });

	const withdrawal = records.at(-1);
	expect(withdrawal?.givenAt).toBe(sentAt + 1);
	expect(withdrawal?.answer.categories.marketing?.confirmedAt).toBe(sentAt + 1);
});

test('the next page reads the last givenAt sent from storage', async () => {
	const sentAt = 1_800_000_000_000;
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(sentAt);
	const page = await load();
	await page.kernel.commands.save({ marketing: true, measurement: true });
	await settle();
	unload(page);

	const next = await load();
	await next.kernel.commands.save({ marketing: false, measurement: true });

	expect(records.at(-1)?.givenAt).toBe(sentAt + 1);
});

test('a replay that moves a c15t visitor to the UUID carries the floor to it', async () => {
	const sentAt = 1_800_000_000_000;
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(sentAt);
	await leaveC15tVisitor();
	recordsAnswer = () => Promise.resolve(v1Error(500, 'server_error'));
	const page = await load();
	await page.kernel.commands.save({ marketing: true });
	await settle();
	unload(page);

	recordsAnswer = answerRecord;
	const next = await load();
	await vi.waitFor(() => expect(subjectOf(next)).toBe(SUBJECT));
	vi.setSystemTime(sentAt - 3_600_000);
	await next.kernel.commands.save({ marketing: false });

	expect(records.map((record) => record.subjectId)).toEqual([
		LEGACY_SUBJECT,
		LEGACY_SUBJECT,
		SUBJECT,
	]);
	expect(records.at(-1)?.givenAt).toBe(sentAt + 1);
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

describe('one time per choice', () => {
	const T = SERVER_NOW;

	test.each([1000, 100_000])(
		'A: a withdrawal made offline after the clock moved back %ims is the newer save, in storage and on the backend',
		async (back) => {
			vi.useFakeTimers({ toFake: ['Date'] });
			vi.setSystemTime(T);
			const page = await load();
			recordsAnswer = () => Promise.reject(new TypeError('offline'));
			await page.kernel.commands.save({ marketing: true });
			vi.setSystemTime(T - back);
			await page.kernel.commands.save({ marketing: false });

			// The withdrawal replaced the grant in the queue, dated after it.
			expect(queuedSaves()).toEqual([
				{ categories: { marketing: false }, givenAt: T + 1 },
			]);
			expect(
				page.kernel.getSnapshot().explicitChoice?.categories.marketing
			).toMatchObject({ confirmedAt: T + 1, value: false });

			recordsAnswer = answerRecord;
			window.dispatchEvent(new Event('online'));
			await vi.waitFor(() => expect(accepted).toHaveLength(1));
			expect(backendWord('marketing', accepted)).toBe(false);
		}
	);

	test('B(i): two saves in flight under a sub_ ID end under the UUID, stored and not resent', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(T);
		await leaveC15tVisitor();
		const page = await load();
		const held = holdAnswers();
		const first = page.kernel.commands.save({ marketing: true });
		await vi.waitFor(() => expect(held.count()).toBe(1));
		const second = page.kernel.commands.save({ measurement: false });
		await vi.waitFor(() => expect(held.count()).toBe(2));
		held.answer(0, Response.json(recordAnswer({ body: '{}' })));
		await first;
		held.answer(1, Response.json(recordAnswer({ body: '{}' })));
		await second;
		await settle();

		expect(subjectOf(page)).toBe(SUBJECT);
		expect(page.kernel.getSnapshot().subjectDates?.acceptedGivenAt).toBe(
			records[1]?.givenAt
		);
		expect(localStorage.getItem(PENDING_SAVES_STORAGE_KEY)).toBeNull();
		unload(page);

		recordsAnswer = answerRecord;
		const next = await load();
		await settle();
		expect(subjectOf(next)).toBe(SUBJECT);
		expect(next.kernel.getSnapshot().subjectDates?.acceptedGivenAt).toBe(
			records[1]?.givenAt
		);
		expect(records).toHaveLength(2);
	});

	test('B(ii): a second save refused as too far ahead does not hold the floor', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(T);
		await leaveC15tVisitor();
		const page = await load();
		const held = holdAnswers();
		const first = page.kernel.commands.save({ marketing: true });
		await vi.waitFor(() => expect(held.count()).toBe(1));
		vi.setSystemTime(T + 3_600_000);
		const second = page.kernel.commands.save({ measurement: true });
		await vi.waitFor(() => expect(held.count()).toBe(2));
		held.answer(0, Response.json(recordAnswer({ body: '{}' })));
		await first;
		recordsAnswer = refusingTheFuture;
		held.answer(1, v1Error(400, 'invalid_request'));
		await second;

		vi.setSystemTime(T + 5000);
		await page.kernel.commands.save({ marketing: false });
		expect(records.at(-1)).toMatchObject({
			givenAt: T + 5000,
			subjectId: SUBJECT,
		});
		expect(backendWord('marketing', accepted)).toBe(false);
	});

	test('C: a far-future save superseded before it is sent never holds the floor', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(T + 3_600_000);
		const page = await load();
		offline = true;
		await page.kernel.commands.save({ marketing: true });
		await page.kernel.commands.save({ marketing: false });

		vi.setSystemTime(T);
		offline = false;
		recordsAnswer = refusingTheFuture;
		window.dispatchEvent(new Event('online'));
		await vi.waitFor(() => expect(accepted).toHaveLength(1));
		vi.setSystemTime(T + 1000);
		await page.kernel.commands.save({ measurement: true });

		expect(
			records.filter(
				(record) => record.answer.categories.marketing?.value === true
			)
		).toEqual([]);
		// Re-dated by the corrected clock, which waiting moved on a little.
		const [withdrawal, later] = accepted;
		expect(withdrawal?.givenAt).toBeGreaterThanOrEqual(T);
		expect(withdrawal?.givenAt).toBeLessThan(T + 1000);
		expect(later?.givenAt).toBe(T + 1000);
		expect(backendWord('marketing', accepted)).toBe(false);
	});

	test('D: a reload right after the move to the UUID keeps the accepted time', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(T);
		await leaveC15tVisitor();
		const page = await load();
		// Storage as it stands the moment the save leaves the queue.
		let atRemoval: { cookie: string; local: [string, string][] } | undefined;
		const real = window.localStorage;
		const watched = {
			clear: () => real.clear(),
			getItem: (key: string) => real.getItem(key),
			key: (index: number) => real.key(index),
			get length() {
				return real.length;
			},
			removeItem(key: string) {
				if (key === PENDING_SAVES_STORAGE_KEY && !atRemoval) {
					atRemoval = {
						cookie: document.cookie,
						local: Object.entries({ ...real }),
					};
				}
				real.removeItem(key);
			},
			setItem: (key: string, value: string) => real.setItem(key, value),
		} as Storage;
		const getter = vi
			.spyOn(window, 'localStorage', 'get')
			.mockReturnValue(watched);
		await page.kernel.commands.save({ marketing: true });
		getter.mockRestore();
		expect(atRemoval).toBeDefined();
		unload(page);

		localStorage.clear();
		clearStoredConsentRecords();
		for (const [key, value] of atRemoval?.local ?? []) {
			localStorage.setItem(key, value);
		}
		for (const cookie of (atRemoval?.cookie ?? '').split('; ')) {
			if (cookie) {
				document.cookie = `${cookie}; path=/`;
			}
		}
		vi.setSystemTime(T - 1000);
		const next = await load();
		await next.kernel.commands.save({ marketing: false });

		expect(records.at(-1)).toMatchObject({
			givenAt: T + 1,
			subjectId: SUBJECT,
		});
	});

	test('E: with localStorage blocked, the cookie keeps the accepted time across a reload', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(T);
		vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
			throw new DOMException('Storage blocked', 'SecurityError');
		});
		const page = await load();
		await page.kernel.commands.save({ marketing: true });
		await settle();
		unload(page);

		vi.setSystemTime(T - 1000);
		const next = await load();
		expect(
			next.kernel.getSnapshot().explicitChoice?.categories.marketing?.value
		).toBe(true);
		await next.kernel.commands.save({ marketing: false });
		expect(records.at(-1)?.givenAt).toBe(T + 1);
	});

	test("F: a tab's refused denial does not overtake another tab's later grant", async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(T);
		const tabA = await load();
		await tabA.kernel.commands.save({ measurement: true });
		await settle();
		const tabB = await load();
		expect(subjectOf(tabB)).toBe(subjectOf(tabA));

		recordsAnswer = refusingTheFuture;
		vi.setSystemTime(T + 3_600_000);
		await tabA.kernel.commands.save({ marketing: false });
		vi.setSystemTime(T + 2000);
		await tabB.kernel.commands.save({ marketing: true });
		vi.setSystemTime(T + 3000);
		await tabA.kernel.commands.save({ measurement: false });

		expect(records.at(-1)?.answer.categories.marketing).toBeUndefined();
		expect(backendWord('marketing', accepted)).toBe(true);
	});

	test('G: a receipt and a vendor choice accepted after the device clock are carried with that time', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(T);
		const page = await loadWith({
			vendors: [
				{
					category: 'marketing',
					id: 'ads-one',
					name: 'Ads One',
					privacyPolicyUrl: 'https://example.com/privacy',
				},
			],
		});
		await page.kernel.commands.save({ measurement: true });
		// The same millisecond: dated one after the save before it.
		await page.kernel.commands.save(
			{ marketing: true },
			{ vendors: { 'ads-one': false } }
		);
		expect(accepted.at(-1)?.givenAt).toBe(T + 1);
		vi.setSystemTime(T - 5000);
		await page.kernel.commands.save({ measurement: false });

		const carried = records.at(-1);
		expect(carried?.givenAt).toBe(T + 2);
		expect(carried?.answer.categories.marketing?.confirmedAt).toBe(T + 1);
		expect(carried?.vendorChoice?.confirmedAt).toBe(T + 1);
	});

	test('H: a withdrawal refused for a clock ten minutes and 1ms ahead is re-dated and recorded', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(T);
		const page = await load();
		await page.kernel.commands.save({ marketing: true });
		const held = holdAnswers();
		vi.setSystemTime(T + 600_001);
		const withdrawal = page.kernel.commands.save({ marketing: false });
		await vi.waitFor(() => expect(held.count()).toBe(1));
		// The answer arrives after the visitor corrected the clock.
		vi.setSystemTime(T + 2000);
		recordsAnswer = refusingTheFuture;
		held.answer(0, v1Error(400, 'invalid_request'));
		await withdrawal;
		await vi.waitFor(() => expect(accepted).toHaveLength(2));

		const [refused, redated] = records.slice(-2);
		expect(refused?.givenAt).toBe(T + 600_001);
		expect(redated?.givenAt).toBe(T + 2000);
		expect(redated?.idempotencyKey).not.toBe(refused?.idempotencyKey);
		expect(
			page.kernel.getSnapshot().explicitChoice?.categories.marketing
		).toMatchObject({ confirmedAt: T + 2000, value: false });
		expect(backendWord('marketing', accepted)).toBe(false);
	});

	test("a re-date keeps a carried vendor choice's time", async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(T);
		const page = await loadWith({
			vendors: [
				{
					category: 'marketing',
					id: 'ads-one',
					name: 'Ads One',
					privacyPolicyUrl: 'https://example.com/privacy',
				},
			],
		});
		await page.kernel.commands.save(
			{ marketing: true },
			{ vendors: { 'ads-one': false } }
		);
		const held = holdAnswers();
		vi.setSystemTime(T + 600_001);
		const later = page.kernel.commands.save({ measurement: true });
		await vi.waitFor(() => expect(held.count()).toBe(1));
		vi.setSystemTime(T + 2000);
		recordsAnswer = refusingTheFuture;
		held.answer(0, v1Error(400, 'invalid_request'));
		await later;
		await vi.waitFor(() => expect(accepted).toHaveLength(2));

		expect(records.map((record) => record.vendorChoice?.confirmedAt)).toEqual([
			T,
			T,
			T,
		]);
		expect(records.at(-1)?.givenAt).toBe(T + 2000);
		expect(page.kernel.getSnapshot().vendorChoice?.confirmedAt).toBe(T);
	});

	test('a far-future save refused after the move from sub_ is re-dated under the UUID', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(T);
		await leaveC15tVisitor();
		const page = await load();
		const held = holdAnswers();
		const first = page.kernel.commands.save({ measurement: true });
		await vi.waitFor(() => expect(held.count()).toBe(1));
		vi.setSystemTime(T + 600_001);
		const second = page.kernel.commands.save({ marketing: true });
		await vi.waitFor(() => expect(held.count()).toBe(2));
		held.answer(0, Response.json(recordAnswer({ body: '{}' })));
		await first;
		expect(subjectOf(page)).toBe(SUBJECT);
		vi.setSystemTime(T + 2000);
		recordsAnswer = refusingTheFuture;
		held.answer(1, v1Error(400, 'invalid_request'));
		await second;
		await vi.waitFor(() => expect(accepted).toHaveLength(2));

		expect(accepted.at(-1)).toMatchObject({
			givenAt: T + 2000,
			subjectId: SUBJECT,
		});
		expect(backendWord('marketing', accepted)).toBe(true);
	});

	test.each([100_000, 300_000])(
		'a choice queued with the clock %ims fast stands after a reload with the clock corrected',
		async (fast) => {
			vi.useFakeTimers({ toFake: ['Date'] });
			vi.setSystemTime(T + fast);
			const page = await load();
			offline = true;
			await page.kernel.commands.save({ marketing: true, measurement: true });
			await settle();
			unload(page);

			vi.setSystemTime(T);
			offline = false;
			const next = await load();
			expect(next.kernel.getSnapshot().explicitChoice).not.toBeNull();
			expect(next.kernel.getSnapshot().activeUI).toBe('none');
			await vi.waitFor(() => expect(accepted).toHaveLength(1));
			expect(accepted[0]?.givenAt).toBe(T + fast);
		}
	);
});
