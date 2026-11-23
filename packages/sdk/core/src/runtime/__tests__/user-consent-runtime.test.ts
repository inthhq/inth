/**
 * @vitest-environment jsdom
 *
 * Runtime `userConsent` wiring: Promise hold & 3 s timeout, late result
 * syncing, older Promise fencing, per-user hold arming, synchronous user
 * switch/logout before lazy update, serverScriptStart disabling on Promise,
 * and SSR folding via `resolveRequestConsent`.
 */
import type { UserConsent } from '@inth/sdk-schema/types';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
	matchedResolution,
	NOW,
	optInRule,
	optOutRule,
} from '../../__tests__/fixtures/kernel-fixtures';
import { resolveStorageKeys } from '../../libs/storage-keys';
import {
	encodeAccountChoicesCookie,
	encodeAccountOptOutCookie,
	encodeAccountVendorsCookie,
} from '../../modules/persistence/account-codec';
import { resolveRequestConsent } from '../../server/request-consent';
import { testing } from '../../testing';
import { createConsentProviderRuntime, defaultRuntimeModules } from '../index';
import { createRuntimeKernel } from '../runtime-kernel';
import { serverScriptStart } from '../script-server-start';

const clearBrowserStorage = () => {
	window.localStorage.clear();
	for (const entry of document.cookie.split(';')) {
		const name = entry.split('=')[0]?.trim();
		if (name) {
			document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
		}
	}
};

const makeUserConsent = (
	overrides: Partial<UserConsent['sync']> & { externalId: string }
): UserConsent => ({
	categories: {},
	optOut: null,
	sync: {
		checkedAt: NOW,
		choices: {},
		optOut: null,
		vendors: {},
		...overrides,
	},
});

const flushMicrotasks = async () => {
	await Promise.resolve();
	await Promise.resolve();
};

beforeEach(() => {
	clearBrowserStorage();
	vi.useFakeTimers({ now: NOW });
});

afterEach(() => {
	vi.useRealTimers();
	clearBrowserStorage();
	vi.restoreAllMocks();
});

describe('runtime userConsent Promise hold, timeout, and fencing', () => {
	test('arms hold on first Promise, releases after 3s timeout, and late unfenced result still syncs', async () => {
		const rule = optOutRule();
		const resolution = matchedResolution(rule);
		const fp = resolution.fingerprints.choice;
		const deferred = Promise.withResolvers<UserConsent | null>();

		const runtime = createConsentProviderRuntime(
			{
				consentCategories: [
					'functionality',
					'experience',
					'measurement',
					'marketing',
				],
				mode: testing({ policy: [rule] }),
				prefetch: {
					initialPolicyPending: false,
					initialPolicyResolution: resolution,
					now: NOW,
				},
				user: { externalId: 'user_a' },
				userConsent: deferred.promise,
			},
			defaultRuntimeModules
		);

		// Pending hold masks optional permissions to false even under opt-out policy.
		expect(runtime.kernel.getSnapshot().userConsentPending).toBe(true);
		expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			false
		);

		runtime.start();
		expect(runtime.kernel.getSnapshot().userConsentPending).toBe(true);

		// Before 3 s: still pending.
		await vi.advanceTimersByTimeAsync(2_900);
		expect(runtime.kernel.getSnapshot().userConsentPending).toBe(true);

		// At 3 s: hold clears, opt-out default allows marketing.
		await vi.advanceTimersByTimeAsync(200);
		expect(runtime.kernel.getSnapshot().userConsentPending).toBe(false);
		expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			true
		);

		// Late result arrives after timeout: still syncs because no fence bumped!
		deferred.resolve(
			makeUserConsent({
				checkedAt: NOW + 3_500,
				choices: {
					marketing: {
						basis: { fingerprint: fp, kind: 'choice-v1' },
						confirmedAt: NOW - 1000,
						value: false,
					},
				},
				externalId: 'user_a',
			})
		);
		await flushMicrotasks();
		expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			false
		);
		runtime.dispose();
	});

	test('an older Promise resolving late is dropped; second Promise for same user does not re-arm hold', async () => {
		const rule = optOutRule();
		const resolution = matchedResolution(rule);
		const fp = resolution.fingerprints.choice;
		const first = Promise.withResolvers<UserConsent | null>();
		const second = Promise.withResolvers<UserConsent | null>();

		const base = {
			consentCategories: [
				'functionality',
				'experience',
				'measurement',
				'marketing',
			] as ('functionality' | 'experience' | 'measurement' | 'marketing')[],
			mode: testing({ policy: [rule] }),
			prefetch: {
				initialPolicyPending: false,
				initialPolicyResolution: resolution,
				now: NOW,
			},
			user: { externalId: 'user_a' },
		};

		const runtime = createConsentProviderRuntime(
			{
				...base,
				userConsent: first.promise,
			},
			defaultRuntimeModules
		);
		runtime.start();
		expect(runtime.kernel.getSnapshot().userConsentPending).toBe(true);

		// Resolve first Promise -> clears hold.
		first.resolve(
			makeUserConsent({
				checkedAt: NOW,
				choices: {
					marketing: {
						basis: { fingerprint: fp, kind: 'choice-v1' },
						confirmedAt: NOW - 2000,
						value: true,
					},
				},
				externalId: 'user_a',
			})
		);
		await flushMicrotasks();
		expect(runtime.kernel.getSnapshot().userConsentPending).toBe(false);

		// Second Promise for the SAME user does not re-arm hold.
		const third = Promise.withResolvers<UserConsent | null>();
		void runtime.update({ ...base, userConsent: second.promise });
		expect(runtime.kernel.getSnapshot().userConsentPending).toBe(false);

		// Third Promise supersedes second.
		void runtime.update({ ...base, userConsent: third.promise });

		// Third resolves with marketing: true; then older second resolves with marketing: false -> dropped!
		third.resolve(
			makeUserConsent({
				checkedAt: NOW + 2000,
				choices: {
					marketing: {
						basis: { fingerprint: fp, kind: 'choice-v1' },
						confirmedAt: NOW + 1000,
						value: true,
					},
				},
				externalId: 'user_a',
			})
		);
		await flushMicrotasks();

		second.resolve(
			makeUserConsent({
				checkedAt: NOW + 3000,
				choices: {
					marketing: {
						basis: { fingerprint: fp, kind: 'choice-v1' },
						confirmedAt: NOW + 2000,
						value: false,
					},
				},
				externalId: 'user_a',
			})
		);
		await flushMicrotasks();

		expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			true
		);
		runtime.dispose();
	});

	test('direct A -> B switch drops A synchronously, fences A Promise, deletes A storage, and arms hold for B', async () => {
		const rule = optInRule();
		const resolution = matchedResolution(rule);
		const fp = resolution.fingerprints.choice;
		const keys = resolveStorageKeys();
		const promiseA = Promise.withResolvers<UserConsent | null>();
		const promiseB = Promise.withResolvers<UserConsent | null>();

		const base = {
			consentCategories: [
				'functionality',
				'experience',
				'measurement',
				'marketing',
			] as ('functionality' | 'experience' | 'measurement' | 'marketing')[],
			mode: testing({ policy: [rule] }),
			prefetch: {
				initialPolicyPending: false,
				initialPolicyResolution: resolution,
				now: NOW,
			},
		};

		const runtime = createConsentProviderRuntime(
			{
				...base,
				user: { externalId: 'user_a' },
				userConsent: makeUserConsent({
					checkedAt: NOW,
					choices: {
						marketing: {
							basis: { fingerprint: fp, kind: 'choice-v1' },
							confirmedAt: NOW - 1000,
							value: true,
						},
					},
					externalId: 'user_a',
				}),
			},
			defaultRuntimeModules
		);
		runtime.start();
		await vi.advanceTimersByTimeAsync(20);
		expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			true
		);
		expect(window.localStorage.getItem(keys.accountState)).not.toBeNull();

		// Start a pending Promise for A, then switch directly to B with a Promise for B.
		void runtime.update({
			...base,
			user: { externalId: 'user_a' },
			userConsent: promiseA.promise,
		});
		void runtime.update({
			...base,
			user: { externalId: 'user_b' },
			userConsent: promiseB.promise,
		});

		// Synchronously BEFORE any lazy update or Promise settles:
		// A's account layer and storage are gone, and hold is armed for B!
		expect(runtime.kernel.getSnapshot().user?.externalId).toBe('user_b');
		expect(runtime.kernel.getSnapshot().hasAccountLayer).toBeUndefined();
		expect(runtime.kernel.getSnapshot().userConsentPending).toBe(true);
		expect(window.localStorage.getItem(keys.accountState)).toBeNull();

		// A's late Promise resolves: dropped!
		promiseA.resolve(
			makeUserConsent({
				checkedAt: NOW + 1000,
				choices: {
					marketing: {
						basis: { fingerprint: fp, kind: 'choice-v1' },
						confirmedAt: NOW,
						value: true,
					},
				},
				externalId: 'user_a',
			})
		);
		await flushMicrotasks();
		expect(runtime.kernel.getSnapshot().userConsentPending).toBe(true);
		expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			false
		);

		// B's Promise resolves: applies for B and clears hold!
		promiseB.resolve(
			makeUserConsent({
				checkedAt: NOW + 1000,
				choices: {
					measurement: {
						basis: { fingerprint: fp, kind: 'choice-v1' },
						confirmedAt: NOW,
						value: true,
					},
				},
				externalId: 'user_b',
			})
		);
		await flushMicrotasks();
		expect(runtime.kernel.getSnapshot().userConsentPending).toBe(false);
		expect(runtime.kernel.getSnapshot().effectivePermissions.measurement).toBe(
			true
		);
		expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			false
		);

		// Removing user clears kernel user synchronously!
		await runtime.identify(undefined);
		expect(runtime.kernel.getSnapshot().user).toBeNull();
		expect(runtime.kernel.getSnapshot().effectivePermissions.measurement).toBe(
			false
		);
		runtime.dispose();
	});

	test('Promise userConsent disables serverScriptStart for that render', () => {
		const rule = optOutRule({ prompt: 'none' });
		const resolution = matchedResolution(rule);
		const { promise } = Promise.withResolvers<UserConsent | null>();
		const scripts = [
			{
				category: 'marketing' as const,
				id: 'ads',
				serverStart: () => ({ prelude: 'window.__ads = 1;' }),
				src: 'https://cdn.example.test/ads.js',
			},
		];

		const withoutPromise = serverScriptStart({
			consentCategories: ['marketing'],
			mode: testing({ policy: [rule] }),
			prefetch: {
				initialPolicyPending: false,
				initialPolicyResolution: resolution,
				initialRecords: { now: NOW },
				now: NOW,
			},
			scripts,
			user: { externalId: 'user_a' },
		});
		expect(withoutPromise).toBeDefined();

		const withPromise = serverScriptStart({
			consentCategories: ['marketing'],
			mode: testing({ policy: [rule] }),
			prefetch: {
				initialPolicyPending: false,
				initialPolicyResolution: resolution,
				initialRecords: { now: NOW },
				now: NOW,
			},
			scripts,
			user: { externalId: 'user_a' },
			userConsent: promise,
		});
		expect(withPromise).toBeUndefined();
	});
});

describe('SSR folding via resolveRequestConsent', () => {
	test('resolved userConsent with no cookies: no banner, correct permissions, raw doc in boot payload', async () => {
		const rule = optInRule();
		const resolution = matchedResolution(rule);
		const fp = resolution.fingerprints.choice;
		const doc = makeUserConsent({
			checkedAt: NOW,
			choices: {
				experience: {
					basis: { fingerprint: fp, kind: 'choice-v1' },
					confirmedAt: NOW - 1000,
					value: true,
				},
				functionality: {
					basis: { fingerprint: fp, kind: 'choice-v1' },
					confirmedAt: NOW - 1000,
					value: true,
				},
				marketing: {
					basis: { fingerprint: fp, kind: 'choice-v1' },
					confirmedAt: NOW - 1000,
					value: true,
				},
				measurement: {
					basis: { fingerprint: fp, kind: 'choice-v1' },
					confirmedAt: NOW - 1000,
					value: false,
				},
			},
			externalId: 'user_a',
		});

		const state = await resolveRequestConsent({
			adapter: '@inth/test',
			mode: 'offline',
			now: NOW,
			offline: { policy: [rule] },
			request: { headers: new Headers() },
			user: { externalId: 'user_a' },
			userConsent: doc,
		});

		expect(state.initialUser).toEqual({ externalId: 'user_a' });
		expect(state.initialUserConsent).toBe(doc);

		// Boot kernel from server state: no banner, exact permissions!
		const kernel = createRuntimeKernel({
			consentCategories: [
				'functionality',
				'experience',
				'measurement',
				'marketing',
			],
			mode: testing({ policy: [rule] }),
			prefetch: state,
		});
		const snap = kernel.getSnapshot();
		expect(snap.activeUI).toBe('none');
		expect(snap.effectivePermissions.marketing).toBe(true);
		expect(snap.effectivePermissions.measurement).toBe(false);
		expect(snap.hasAccountLayer).toBe(true);
		kernel.dispose();
	});

	test('reload with account cookies and userConsent undefined reads cookies for matching user and ignores cookies for another user', async () => {
		const rule = optInRule();
		const resolution = matchedResolution(rule);
		const fp = resolution.fingerprints.choice;
		const keys = resolveStorageKeys();

		const layer = {
			appliedAt: NOW,
			checkedAt: NOW,
			choices: {
				experience: {
					basis: { fingerprint: fp, kind: 'choice-v1' as const },
					rawConfirmedAt: NOW - 1000,
					value: true,
				},
				functionality: {
					basis: { fingerprint: fp, kind: 'choice-v1' as const },
					rawConfirmedAt: NOW - 1000,
					value: true,
				},
				marketing: {
					basis: { fingerprint: fp, kind: 'choice-v1' as const },
					rawConfirmedAt: NOW - 1000,
					value: true,
				},
				measurement: {
					basis: { fingerprint: fp, kind: 'choice-v1' as const },
					rawConfirmedAt: NOW - 1000,
					value: true,
				},
			},
			externalId: 'user_a',
			optOut: null,
			skew: 0,
			vendors: {},
		};
		const cookie = [
			`${keys.accountChoices}=${encodeAccountChoicesCookie(layer, 'rev_1')}`,
			`${keys.accountVendors}=${encodeAccountVendorsCookie(layer, 'rev_1')}`,
			`${keys.accountOptOut}=${encodeAccountOptOutCookie(layer, 'rev_1')}`,
		].join('; ');

		// Matching server user A with userConsent: undefined -> reads cookies, no banner!
		const stateA = await resolveRequestConsent({
			adapter: '@inth/test',
			mode: 'offline',
			now: NOW,
			offline: { policy: [rule] },
			request: { cookie, headers: new Headers() },
			user: { externalId: 'user_a' },
		});
		expect(stateA.initialRecords?.accountLayer?.externalId).toBe('user_a');
		const kernelA = createRuntimeKernel({
			consentCategories: [
				'functionality',
				'experience',
				'measurement',
				'marketing',
			],
			mode: testing({ policy: [rule] }),
			prefetch: stateA,
		});
		expect(kernelA.getSnapshot().activeUI).toBe('none');
		expect(kernelA.getSnapshot().effectivePermissions.marketing).toBe(true);
		kernelA.dispose();

		// Server user B with user A's account cookies -> ignored!
		const stateB = await resolveRequestConsent({
			adapter: '@inth/test',
			mode: 'offline',
			now: NOW,
			offline: { policy: [rule] },
			request: { cookie, headers: new Headers() },
			user: { externalId: 'user_b' },
		});
		expect(stateB.initialRecords?.accountLayer).toBeUndefined();
		const kernelB = createRuntimeKernel({
			consentCategories: [
				'functionality',
				'experience',
				'measurement',
				'marketing',
			],
			mode: testing({ policy: [rule] }),
			prefetch: stateB,
		});
		expect(kernelB.getSnapshot().activeUI).toBe('banner');
		expect(kernelB.getSnapshot().effectivePermissions.marketing).toBe(false);
		kernelB.dispose();
	});
});
