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
import { C15T_STORAGE_KEY, STORAGE_KEY_V2 } from '../../libs/storage-keys';
import { createPersistence } from '../../modules/persistence';
import { clearStoredConsentRecords } from '../../modules/persistence/__tests__/record-writes';
import { hosted } from '../../transports/mode';
import {
	LEGACY_SUBJECT,
	recordAnswer,
	SUBJECT,
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

const backend: typeof globalThis.fetch = (input, init) => {
	const { pathname } = new URL(String(input));
	if (pathname === '/v1/consent/records') {
		records.push(JSON.parse(String(init?.body)) as SentRecord);
		return Promise.resolve(Response.json(recordAnswer(init)));
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

beforeEach(() => {
	localStorage.clear();
	clearStoredConsentRecords();
	records = [];
});

afterEach(() => {
	for (const runtime of runtimes.splice(0)) {
		unload(runtime);
	}
	clearStoredConsentRecords();
	vi.useRealTimers();
});

test('a visitor with only c15t storage is not asked again, and saves under the UUID from then on', async () => {
	// What a c15t client left: its consent cookie and storage, and a sub_ id.
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
