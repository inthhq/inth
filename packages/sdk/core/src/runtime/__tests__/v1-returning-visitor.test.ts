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
import type { ConsentRuntime, ConsentRuntimeOptions } from '../types';

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
/** What the backend holds per category: a value and the time it stored. */
let backendHolds: Record<string, { at: number; value?: boolean }> = {};

/**
 * The backend's ordering of saves. The last save to arrive wins for the
 * categories it confirmed. A `givenAt` ahead of the backend's clock is stored
 * as the backend's time. A carried receipt is accepted whatever its time,
 * and never overwrites a newer stored value.
 */
const backendStores = function backendStores(record: SentRecord): void {
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

	expect(result.ok).toBe(true);
	expect(errors).toEqual([]);
	expect(records).toHaveLength(1);
	expect(records[0]?.givenAt).toBe(ahead);
	expect(backendHolds.marketing).toEqual({ at: SERVER_NOW, value: true });
	expect(localStorage.getItem(PENDING_SAVES_STORAGE_KEY)).toBeNull();
});
