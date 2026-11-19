/** @vitest-environment jsdom */
/**
 * The runtime a page builds, against a fake `/v1` backend: a visitor a c15t
 * client consented for, and a device clock that moves back.
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
	v1Error,
} from '../../transports/v1/__tests__/fixtures';
import { createConsentRuntime } from '../index';
import type { ConsentRuntime } from '../types';

const CATEGORIES = ['necessary', 'measurement', 'marketing'] as const;
const policy: PolicyResolution = matchedResolution(optInRule());
const runtimes: ConsentRuntime[] = [];
interface SentRecord {
	answer: { categories: Record<string, { confirmedAt: number }> };
	givenAt: number;
	subjectId: string;
}
let records: SentRecord[] = [];
const answerRecord = (init?: RequestInit) =>
	Promise.resolve(Response.json(recordAnswer(init)));
/** How the backend answers the next saves. */
let recordsAnswer: (init?: RequestInit) => Promise<Response> = answerRecord;

const backend: typeof globalThis.fetch = (input, init) => {
	const { pathname } = new URL(String(input));
	if (pathname === '/v1/consent/records') {
		records.push(JSON.parse(String(init?.body)) as SentRecord);
		return recordsAnswer(init);
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
const load = async (): Promise<ConsentRuntime> => {
	const runtime = createConsentRuntime({
		consentCategories: [...CATEGORIES],
		mode: hosted({ fetch: backend, projectUrl: 'https://consent.example.com' }),
		prefetch: { initRetry: false },
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

test('a save refused for a clock that ran ahead does not hold later saves in the future', async () => {
	const realNow = 1_800_000_000_000;
	const ahead = realNow + 3_600_000;
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(realNow);
	const page = await load();
	// The backend refuses a givenAt more than ten minutes past its clock.
	recordsAnswer = (init) =>
		(JSON.parse(String(init?.body)) as SentRecord).givenAt > realNow + 600_000
			? Promise.resolve(v1Error(400, 'invalid_request'))
			: answerRecord(init);

	vi.setSystemTime(ahead);
	await page.kernel.commands.save({ marketing: true, measurement: true });
	vi.setSystemTime(realNow + 1000);
	await page.kernel.commands.save({ marketing: false });
	await settle();

	expect(records.map((record) => record.givenAt)).toEqual([
		ahead,
		realNow + 1000,
	]);
	expect(records[1]?.answer.categories.measurement?.confirmedAt).toBe(
		realNow + 1000
	);
	expect(localStorage.getItem(PENDING_SAVES_STORAGE_KEY)).toBeNull();
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
