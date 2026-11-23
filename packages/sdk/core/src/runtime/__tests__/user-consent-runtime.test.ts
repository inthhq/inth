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
import { isVendorAllowed } from '../../modules/has';
import {
	encodeAccountChoicesCookie,
	encodeAccountLocalJson,
	encodeAccountOptOutCookie,
	encodeAccountVendorsCookie,
	readStoredAccountLayer,
} from '../../modules/persistence/account-codec';
import { resolveAccountStorageKeys } from '../../modules/persistence/account-keys';
import { encodeVendorChoiceCompact } from '../../modules/persistence/writer/encode';
import { resolveRequestConsent } from '../../server/request-consent';
import { testing } from '../../testing';
import { createConsentProviderRuntime, defaultRuntimeModules } from '../index';
import { createRuntimeKernel } from '../runtime-kernel';
import { serverScriptStart } from '../script-server-start';
import { streamPrefetchWith } from '../stream-mode';
import { resolveStreamedInit } from '../streamed-init';
import { streamPrefetch } from '../streamed-prefetch';
import type { RuntimePrefetch } from '../types';

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
		const keys = resolveAccountStorageKeys();
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
		const keys = resolveAccountStorageKeys();

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

describe('runtime regressions (set 1)', () => {
	test('releasing userConsentPending and applying the resolved document happens in one atomic commit under opt-out policy', async () => {
		const rule = optOutRule({ prompt: 'none' });
		const resolution = matchedResolution(rule);
		const fp = resolution.fingerprints.choice;
		const deferred = Promise.withResolvers<UserConsent | null>();

		const runtime = createConsentProviderRuntime(
			{
				consentCategories: ['marketing'],
				mode: testing({ policy: [rule] }),
				persistence: false,
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

		const seen: { pending: boolean; marketing: boolean }[] = [];
		const unsub = runtime.kernel.subscribe((snap) => {
			seen.push({
				marketing: snap.effectivePermissions.marketing,
				pending: snap.userConsentPending,
			});
		});

		runtime.start();
		expect(runtime.kernel.getSnapshot().userConsentPending).toBe(true);
		expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			false
		);

		deferred.resolve(
			makeUserConsent({
				checkedAt: NOW,
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

		expect(runtime.kernel.getSnapshot().userConsentPending).toBe(false);
		expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			false
		);
		// Must NEVER emit an intermediate snapshot where pending is false and marketing is granted!
		expect(seen.some((entry) => !entry.pending && entry.marketing)).toBe(false);
		unsub();
		runtime.dispose();
	});

	test('a second unmemoized Promise for the same user still releases the hold at 3 s', async () => {
		const rule = optOutRule({ prompt: 'none' });
		const resolution = matchedResolution(rule);
		const first = Promise.withResolvers<UserConsent | null>();
		const second = Promise.withResolvers<UserConsent | null>();
		const base = {
			consentCategories: ['marketing'] as const,
			mode: testing({ policy: [rule] }),
			persistence: false as const,
			prefetch: {
				initialPolicyPending: false,
				initialPolicyResolution: resolution,
				now: NOW,
			},
			user: { externalId: 'user_a' },
		};

		const runtime = createConsentProviderRuntime(
			{ ...base, userConsent: first.promise },
			defaultRuntimeModules
		);
		runtime.start();
		expect(runtime.kernel.getSnapshot().userConsentPending).toBe(true);

		// At 1 s, an unmemoized re-render passes a fresh Promise that also never settles.
		await vi.advanceTimersByTimeAsync(1000);
		void runtime.update({ ...base, userConsent: second.promise });
		expect(runtime.kernel.getSnapshot().userConsentPending).toBe(true);

		// At 3 s from initial hold start, the hold MUST release!
		await vi.advanceTimersByTimeAsync(2000);
		expect(runtime.kernel.getSnapshot().userConsentPending).toBe(false);
		runtime.dispose();
	});

	test('passing userConsent: undefined during an in-flight Promise is a true no-op', async () => {
		const rule = optOutRule({ prompt: 'none' });
		const resolution = matchedResolution(rule);
		const fp = resolution.fingerprints.choice;
		const deferred = Promise.withResolvers<UserConsent | null>();
		const base = {
			consentCategories: ['marketing'] as const,
			mode: testing({ policy: [rule] }),
			persistence: false as const,
			prefetch: {
				initialPolicyPending: false,
				initialPolicyResolution: resolution,
				now: NOW,
			},
			user: { externalId: 'user_a' },
		};

		const runtime = createConsentProviderRuntime(
			{ ...base, userConsent: deferred.promise },
			defaultRuntimeModules
		);
		runtime.start();
		expect(runtime.kernel.getSnapshot().userConsentPending).toBe(true);

		// Updating with `userConsent: undefined` must NOT cancel the Promise or clear the hold!
		void runtime.update({ ...base, userConsent: undefined });
		expect(runtime.kernel.getSnapshot().userConsentPending).toBe(true);

		deferred.resolve(
			makeUserConsent({
				checkedAt: NOW,
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

		expect(runtime.kernel.getSnapshot().userConsentPending).toBe(false);
		expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			false
		);
		runtime.dispose();
	});

	test('prefetch.initialUserConsentPending alone does not lock userConsentPending permanently', () => {
		const rule = optOutRule({ prompt: 'none' });
		const resolution = matchedResolution(rule);
		const runtime = createConsentProviderRuntime(
			{
				consentCategories: ['marketing'],
				mode: testing({ policy: [rule] }),
				persistence: false,
				prefetch: {
					initialPolicyPending: false,
					initialPolicyResolution: resolution,
					initialUserConsentPending: true,
					now: NOW,
				},
				user: { externalId: 'user_a' },
			},
			defaultRuntimeModules
		);
		runtime.start();
		expect(runtime.kernel.getSnapshot().userConsentPending).toBe(false);
		expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			true
		);
		runtime.dispose();
	});

	test('user arriving after a memoized Promise applies A, and logout while the same Promise stays passed clears the hold', async () => {
		const rule = optOutRule({ prompt: 'none' });
		const resolution = matchedResolution(rule);
		const fp = resolution.fingerprints.choice;
		const base = {
			consentCategories: ['marketing'] as const,
			mode: testing({ policy: [rule] }),
			persistence: false as const,
			prefetch: {
				initialPolicyPending: false,
				initialPolicyResolution: resolution,
				now: NOW,
			},
		};

		// Subcase A: memoized Promise passed BEFORE user arrives.
		const promiseLateUser = Promise.withResolvers<UserConsent | null>();
		const rtLate = createConsentProviderRuntime(
			{ ...base, user: undefined, userConsent: promiseLateUser.promise },
			defaultRuntimeModules
		);
		rtLate.start();
		expect(rtLate.kernel.getSnapshot().userConsentPending).toBe(false);

		// User A arrives while the SAME memoized Promise reference is passed.
		void rtLate.update({
			...base,
			user: { externalId: 'user_a' },
			userConsent: promiseLateUser.promise,
		});
		expect(rtLate.kernel.getSnapshot().userConsentPending).toBe(true);

		promiseLateUser.resolve(
			makeUserConsent({
				checkedAt: NOW,
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
		expect(rtLate.kernel.getSnapshot().userConsentPending).toBe(false);
		expect(rtLate.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			false
		);
		rtLate.dispose();

		// Subcase B: logout while the SAME Promise reference stays passed clears hold immediately.
		const promiseLogout = Promise.withResolvers<UserConsent | null>();
		const rtLogout = createConsentProviderRuntime(
			{
				...base,
				user: { externalId: 'user_a' },
				userConsent: promiseLogout.promise,
			},
			defaultRuntimeModules
		);
		rtLogout.start();
		expect(rtLogout.kernel.getSnapshot().userConsentPending).toBe(true);

		void rtLogout.update({
			...base,
			user: undefined,
			userConsent: promiseLogout.promise,
		});
		expect(rtLogout.kernel.getSnapshot().userConsentPending).toBe(false);
		rtLogout.dispose();
	});

	test('signed-out SSR resolveRequestConsent with userConsent: null propagates null so client deletes leftover account storage', async () => {
		const rule = optInRule();
		const fp = matchedResolution(rule).fingerprints.choice;
		const keys = resolveAccountStorageKeys();

		// Pre-populate leftover account storage for user A on this browser.
		const staleLayer = {
			appliedAt: NOW - 1000,
			checkedAt: NOW - 1000,
			choices: {
				marketing: {
					basis: { fingerprint: fp, kind: 'choice-v1' as const },
					rawConfirmedAt: NOW - 2000,
					value: true,
				},
			},
			externalId: 'user_a',
			optOut: null,
			skew: 0,
			vendors: {},
		};
		window.localStorage.setItem(
			keys.accountState,
			encodeAccountLocalJson(staleLayer, 'rev_stale')
		);
		document.cookie = `${keys.accountChoices}=${encodeAccountChoicesCookie(staleLayer, 'rev_stale')}; path=/`;

		// Signed-out SSR request (no `user`) explicitly passes `userConsent: null`.
		const state = await resolveRequestConsent({
			adapter: '@inth/test',
			mode: 'offline',
			now: NOW,
			offline: { policy: [rule] },
			request: { headers: new Headers() },
			userConsent: null,
		});
		expect(state.initialUserConsent).toBeNull();

		const runtime = createConsentProviderRuntime(
			{
				consentCategories: ['marketing'],
				mode: testing({ policy: [rule] }),
				prefetch: state,
			},
			defaultRuntimeModules
		);
		runtime.start();
		expect(window.localStorage.getItem(keys.accountState)).toBeNull();
		expect(document.cookie).not.toContain(`${keys.accountChoices}=`);
		runtime.dispose();
	});

	test('streamed prefetch adopting initialUser and initialUserConsent after start applies and persists it', async () => {
		const rule = optInRule();
		const resolution = matchedResolution(rule);
		const fp = resolution.fingerprints.choice;
		const prefetchDeferred = Promise.withResolvers<RuntimePrefetch>();

		const runtime = createConsentProviderRuntime(
			{
				consentCategories: ['marketing'],
				mode: testing({ policy: [rule] }),
				prefetch: prefetchDeferred.promise,
			},
			{
				...defaultRuntimeModules,
				streamPrefetch: streamPrefetchWith(resolveStreamedInit),
			}
		);
		runtime.start();

		const doc = makeUserConsent({
			checkedAt: NOW,
			choices: {
				marketing: {
					basis: { fingerprint: fp, kind: 'choice-v1' },
					confirmedAt: NOW - 1000,
					value: true,
				},
			},
			externalId: 'user_a',
		});
		const resolvedPrefetch: RuntimePrefetch = {
			initialPolicyPending: false,
			initialPolicyResolution: resolution,
			initialUser: { externalId: 'user_a' },
			initialUserConsent: doc,
			now: NOW,
		};
		runtime.streamed?.adopt(resolvedPrefetch);
		prefetchDeferred.resolve(resolvedPrefetch);
		await vi.advanceTimersByTimeAsync(50);

		expect(runtime.kernel.getSnapshot().user?.externalId).toBe('user_a');
		expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			true
		);
		expect(readStoredAccountLayer(undefined)?.externalId).toBe('user_a');
		runtime.dispose();
	});
});

describe('runtime regressions (set 2)', () => {
	test('switching from user A (denied marketing) to user B with a pending Promise under opt-out never grants marketing or inserts marketing script', async () => {
		const rule = optOutRule({ prompt: 'none' });
		const resolution = matchedResolution(rule);
		const fp = resolution.fingerprints.choice;
		const docA = makeUserConsent({
			checkedAt: NOW,
			choices: {
				marketing: {
					basis: { fingerprint: fp, kind: 'choice-v1' },
					confirmedAt: NOW - 1000,
					value: false,
				},
			},
			externalId: 'user_a',
		});
		const base = {
			consentCategories: ['marketing'] as const,
			mode: testing({ policy: [rule] }),
			persistence: false as const,
			prefetch: {
				initialPolicyPending: false,
				initialPolicyResolution: resolution,
				now: NOW,
			},
			scripts: [
				{
					category: 'marketing' as const,
					id: 'mkt-script',
					src: 'https://cdn.example.test/mkt-s3.js',
				},
			],
		};

		const runtime = createConsentProviderRuntime(
			{ ...base, user: { externalId: 'user_a' }, userConsent: docA },
			defaultRuntimeModules
		);
		const seenMarketing: boolean[] = [];
		const unsub = runtime.kernel.subscribe((snap) => {
			seenMarketing.push(snap.effectivePermissions.marketing);
		});
		runtime.start();
		await vi.advanceTimersByTimeAsync(50);
		expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			false
		);
		expect(
			document.querySelector('script[src="https://cdn.example.test/mkt-s3.js"]')
		).toBeNull();

		// Switch to user B with a pending Promise: MUST commit user change + dropped A + userConsentPending: true atomically!
		const promiseB = Promise.withResolvers<UserConsent | null>();
		void runtime.update({
			...base,
			user: { externalId: 'user_b' },
			userConsent: promiseB.promise,
		});
		await vi.advanceTimersByTimeAsync(50);

		expect(runtime.kernel.getSnapshot().userConsentPending).toBe(true);
		expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			false
		);
		expect(seenMarketing.includes(true)).toBe(false);
		expect(
			document.querySelector('script[src="https://cdn.example.test/mkt-s3.js"]')
		).toBeNull();

		unsub();
		runtime.dispose();
	});

	test('clearRecords() during a pending SSR stream fences the streamed initialUserConsent', async () => {
		const rule = optInRule();
		const resolution = matchedResolution(rule);
		const fp = resolution.fingerprints.choice;
		const prefetchDeferred = Promise.withResolvers<RuntimePrefetch>();

		const runtime = createConsentProviderRuntime(
			{
				consentCategories: ['marketing'],
				mode: testing({ policy: [rule] }),
				prefetch: prefetchDeferred.promise,
			},
			{
				...defaultRuntimeModules,
				streamPrefetch: streamPrefetchWith(resolveStreamedInit),
			}
		);
		runtime.start();

		// Visitor clears records while SSR stream is still in flight.
		runtime.clearRecords();

		const doc = makeUserConsent({
			checkedAt: NOW,
			choices: {
				marketing: {
					basis: { fingerprint: fp, kind: 'choice-v1' },
					confirmedAt: NOW - 1000,
					value: true,
				},
			},
			externalId: 'user_a',
		});
		const resolvedPrefetch: RuntimePrefetch = {
			initialPolicyPending: false,
			initialPolicyResolution: resolution,
			initialUser: { externalId: 'user_a' },
			initialUserConsent: doc,
			now: NOW,
		};
		runtime.streamed?.adopt(resolvedPrefetch);
		prefetchDeferred.resolve(resolvedPrefetch);
		await vi.advanceTimersByTimeAsync(50);

		expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			false
		);
		expect(readStoredAccountLayer(undefined)).toBeNull();
		runtime.dispose();
	});

	test('streamed prefetch that settles before start() still applies and persists initialUserConsent on start()', async () => {
		const rule = optInRule();
		const resolution = matchedResolution(rule);
		const fp = resolution.fingerprints.choice;
		const prefetchDeferred = Promise.withResolvers<RuntimePrefetch>();

		const runtime = createConsentProviderRuntime(
			{
				consentCategories: ['marketing'],
				mode: testing({ policy: [rule] }),
				prefetch: prefetchDeferred.promise,
			},
			{
				...defaultRuntimeModules,
				streamPrefetch: streamPrefetchWith(resolveStreamedInit),
			}
		);

		// Prefetch settles BEFORE runtime.start() is called!
		const doc = makeUserConsent({
			checkedAt: NOW,
			choices: {
				marketing: {
					basis: { fingerprint: fp, kind: 'choice-v1' },
					confirmedAt: NOW - 1000,
					value: true,
				},
			},
			externalId: 'user_a',
		});
		const resolvedPrefetch: RuntimePrefetch = {
			initialPolicyPending: false,
			initialPolicyResolution: resolution,
			initialUser: { externalId: 'user_a' },
			initialUserConsent: doc,
			now: NOW,
		};
		prefetchDeferred.resolve(resolvedPrefetch);
		await flushMicrotasks();

		// Now start() runs.
		runtime.start();
		await vi.advanceTimersByTimeAsync(50);

		expect(runtime.kernel.getSnapshot().user?.externalId).toBe('user_a');
		expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			true
		);
		expect(readStoredAccountLayer(undefined)?.externalId).toBe('user_a');
		runtime.dispose();
	});

	test('memoized Promise that settles before start() is not overwritten by an older stored account layer', async () => {
		const rule = optInRule();
		const resolution = matchedResolution(rule);
		const fp = resolution.fingerprints.choice;
		const keys = resolveAccountStorageKeys();

		// Pre-populate storage with an OLDER account layer (`checkedAt: NOW - 5000`, marketing: false).
		const olderStored = {
			appliedAt: NOW - 5000,
			checkedAt: NOW - 5000,
			choices: {
				marketing: {
					basis: { fingerprint: fp, kind: 'choice-v1' as const },
					rawConfirmedAt: NOW - 6000,
					value: false,
				},
			},
			externalId: 'user_a',
			optOut: null,
			skew: 0,
			vendors: {},
		};
		window.localStorage.setItem(
			keys.accountState,
			encodeAccountLocalJson(olderStored, 'rev_old')
		);
		document.cookie = `${keys.accountChoices}=${encodeAccountChoicesCookie(olderStored, 'rev_old')}; path=/`;

		const deferred = Promise.withResolvers<UserConsent | null>();
		const base = {
			consentCategories: ['marketing'] as const,
			mode: testing({ policy: [rule] }),
			prefetch: {
				initialPolicyPending: false,
				initialPolicyResolution: resolution,
				now: NOW,
			},
			user: { externalId: 'user_a' },
		};
		const runtime = createConsentProviderRuntime(
			{ ...base, userConsent: deferred.promise },
			defaultRuntimeModules
		);

		// Pass the Promise and let it settle BEFORE runtime.start()!
		runtime.syncUserConsent(deferred.promise);
		deferred.resolve(
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
		expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			true
		);

		// Now start() mounts persistence and hydrates the older stored layer -> newer settled Promise MUST win!
		runtime.start();
		await vi.advanceTimersByTimeAsync(50);

		expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			true
		);
		expect(readStoredAccountLayer(undefined)?.checkedAt).toBe(NOW + 1000);
		runtime.dispose();
	});
});

describe('runtime regressions (set 3)', () => {
	test('switching from user A (denied marketing) to user B with a resolved document under opt-out never grants marketing or inserts marketing script', async () => {
		const rule = optOutRule({ prompt: 'none' });
		const resolution = matchedResolution(rule);
		const fp = resolution.fingerprints.choice;
		const docA = makeUserConsent({
			checkedAt: NOW,
			choices: {
				marketing: {
					basis: { fingerprint: fp, kind: 'choice-v1' },
					confirmedAt: NOW - 1000,
					value: false,
				},
			},
			externalId: 'user_a',
		});
		const base = {
			consentCategories: ['marketing'] as const,
			mode: testing({ policy: [rule] }),
			persistence: false as const,
			prefetch: {
				initialPolicyPending: false,
				initialPolicyResolution: resolution,
				now: NOW,
			},
			scripts: [
				{
					category: 'marketing' as const,
					id: 'mkt-script',
					src: 'https://cdn.example.test/mkt-s3.js',
				},
			],
		};

		const runtime = createConsentProviderRuntime(
			{ ...base, user: { externalId: 'user_a' }, userConsent: docA },
			defaultRuntimeModules
		);
		const append = vi.spyOn(document.head, 'appendChild');
		const seenMarketing: boolean[] = [];
		const unsub = runtime.kernel.subscribe((snap) => {
			seenMarketing.push(snap.effectivePermissions.marketing);
		});
		runtime.start();
		await vi.advanceTimersByTimeAsync(50);
		expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			false
		);
		expect(
			document.querySelector('script[src="https://cdn.example.test/mkt-s3.js"]')
		).toBeNull();

		const docB = makeUserConsent({ ...docA.sync, externalId: 'user_b' });
		void runtime.update({
			...base,
			user: { externalId: 'user_b' },
			userConsent: docB,
		});
		await vi.advanceTimersByTimeAsync(50);

		expect(runtime.kernel.getSnapshot().userConsentPending).toBe(false);
		expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			false
		);
		expect(
			append.mock.calls.some(
				([node]) =>
					node instanceof HTMLScriptElement &&
					node.src === 'https://cdn.example.test/mkt-s3.js'
			)
		).toBe(false);
		expect(seenMarketing.includes(true)).toBe(false);
		expect(
			document.querySelector('script[src="https://cdn.example.test/mkt-s3.js"]')
		).toBeNull();

		unsub();
		runtime.dispose();
	});

	test('logging out while SSR prefetch is pending fences the stream', async () => {
		const rule = optInRule();
		const resolution = matchedResolution(rule);
		const prefetch = Promise.withResolvers<RuntimePrefetch>();
		const mode = testing({ policy: [rule] });
		const base = {
			consentCategories: ['marketing'] as const,
			mode,
			prefetch: prefetch.promise,
		};
		const runtime = createConsentProviderRuntime(
			{ ...base, user: { externalId: 'user_a' } },
			{
				...defaultRuntimeModules,
				streamPrefetch: streamPrefetchWith(resolveStreamedInit),
			}
		);
		try {
			runtime.start();
			await runtime.update(base);
			expect(runtime.kernel.getSnapshot().user).toBeNull();
			const cfg: RuntimePrefetch = {
				initialPolicyPending: false,
				initialPolicyResolution: resolution,
				initialUser: { externalId: 'user_a' },
				initialUserConsent: makeUserConsent({
					choices: {
						marketing: {
							basis: {
								fingerprint: resolution.fingerprints.choice,
								kind: 'choice-v1',
							},
							confirmedAt: NOW - 500,
							value: true,
						},
					},
					externalId: 'user_a',
				}),
				now: NOW,
			};
			prefetch.resolve(cfg);
			await vi.advanceTimersByTimeAsync(50);
			expect(runtime.kernel.getSnapshot().user).toBeNull();
			expect(readStoredAccountLayer(undefined)).toBeNull();
		} finally {
			runtime.dispose();
		}
	});

	test('clearing after streamed config adoption but before start fences raw SSR document', async () => {
		const rule = optInRule();
		const resolution = matchedResolution(rule);
		const prefetch = Promise.withResolvers<RuntimePrefetch>();
		const mode = testing({ policy: [rule] });
		const runtime = createConsentProviderRuntime(
			{
				consentCategories: ['marketing'],
				mode,
				prefetch: prefetch.promise,
			},
			{
				...defaultRuntimeModules,
				streamPrefetch: streamPrefetchWith(resolveStreamedInit),
			}
		);
		try {
			const cfg: RuntimePrefetch = {
				initialPolicyPending: false,
				initialPolicyResolution: resolution,
				initialUser: { externalId: 'user_a' },
				initialUserConsent: makeUserConsent({
					choices: {
						marketing: {
							basis: {
								fingerprint: resolution.fingerprints.choice,
								kind: 'choice-v1',
							},
							confirmedAt: NOW - 500,
							value: true,
						},
					},
					externalId: 'user_a',
				}),
				now: NOW,
			};
			runtime.streamed?.adopt(cfg);
			prefetch.resolve(cfg);
			await flushMicrotasks();
			expect(runtime.kernel.getSnapshot().user?.externalId).toBe('user_a');
			runtime.clearRecords();
			expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
				false
			);
			runtime.start();
			await vi.advanceTimersByTimeAsync(50);
			expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
				false
			);
			expect(readStoredAccountLayer(undefined)).toBeNull();
		} finally {
			runtime.dispose();
		}
	});

	test('replaying the exact stored SSR document keeps its established clock conversion', () => {
		const rule = optInRule();
		const resolution = matchedResolution(rule);
		const basis = {
			fingerprint: resolution.fingerprints.choice,
			kind: 'choice-v1' as const,
		};
		const skew = 300_000;
		const appliedAt = NOW - 10_000;
		const checkedAt = appliedAt + skew;
		const rawConfirmedAt = checkedAt - 100;
		const user = { externalId: 'user_a' };
		const runtime = createConsentProviderRuntime(
			{
				consentCategories: ['marketing'],
				mode: testing({ policy: [rule] }),
				persistence: false,
				prefetch: {
					initialPolicyPending: false,
					initialPolicyResolution: resolution,
					initialRecords: {
						accountLayer: {
							...user,
							appliedAt,
							checkedAt,
							choices: {
								marketing: { basis, rawConfirmedAt, value: false },
							},
							optOut: null,
							skew,
							vendors: {},
						},
						choice: {
							categories: {
								marketing: { basis, confirmedAt: NOW - 5000, value: true },
							},
							version: 3,
						},
						now: NOW,
					},
					initialUser: user,
					initialUserConsent: makeUserConsent({
						checkedAt,
						choices: {
							marketing: { basis, confirmedAt: rawConfirmedAt, value: false },
						},
						externalId: 'user_a',
					}),
					now: NOW,
				},
				user,
			},
			defaultRuntimeModules
		);
		try {
			expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
				true
			);
			runtime.start();
			expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
				true
			);
		} finally {
			runtime.dispose();
		}
	});

	test('setUser does not arm userConsentPending when consentSource is configured', () => {
		const rule = optOutRule({ prompt: 'none' });
		const resolution = matchedResolution(rule);
		const pendingConsent = Promise.withResolvers<UserConsent | null>();
		const consentSource = {
			getPermissions: () => ({ marketing: true }),
			subscribe: () => () => undefined,
		};
		const base = {
			consentCategories: ['marketing'] as const,
			consentSource,
			mode: testing({ policy: [rule] }),
			persistence: false as const,
			prefetch: {
				initialPolicyPending: false,
				initialPolicyResolution: resolution,
				now: NOW,
			},
		};
		const runtime = createConsentProviderRuntime(
			{ ...base, user: undefined },
			defaultRuntimeModules
		);
		try {
			runtime.start();
			void runtime.update({
				...base,
				user: { externalId: 'user_a' },
				userConsent: pendingConsent.promise,
			});
			expect(runtime.kernel.getSnapshot().userConsentPending).toBe(false);
		} finally {
			runtime.dispose();
		}
	});
});

describe('runtime regressions (set 4)', () => {
	const runtimeFixture = (rule = optInRule()) => {
		const resolution = matchedResolution(rule);
		const base = {
			consentCategories: ['marketing'] as const,
			mode: testing({ policy: [rule] }),
			prefetch: {
				initialPolicyPending: false,
				initialPolicyResolution: resolution,
				now: NOW,
			},
		};
		const documentFor = (externalId: string, value: boolean) =>
			makeUserConsent({
				choices: {
					marketing: {
						basis: {
							fingerprint: resolution.fingerprints.choice,
							kind: 'choice-v1',
						},
						confirmedAt: NOW - 1000,
						value,
					},
				},
				externalId,
			});
		return { base, documentFor, resolution };
	};

	test('streamed adoption never starts marketing before applying the paired denial', async () => {
		const rule = optOutRule({ prompt: 'none' });
		const { base, documentFor } = runtimeFixture(rule);
		const pending = Promise.withResolvers<RuntimePrefetch>();
		const start = vi.fn();
		const runtime = createConsentProviderRuntime(
			{
				...base,
				prefetch: pending.promise,
				scripts: [
					{
						category: 'marketing',
						id: 'marketing',
						onBeforeLoad: start,
						src: 'https://example.test/marketing.js',
					},
				],
				user: { externalId: 'a' },
			},
			{
				...defaultRuntimeModules,
				streamPrefetch: streamPrefetchWith(resolveStreamedInit),
			}
		);
		try {
			runtime.start();
			expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
				false
			);
			expect(start).not.toHaveBeenCalled();
			const config: RuntimePrefetch = {
				...base.prefetch,
				initialUser: { externalId: 'a' },
				initialUserConsent: documentFor('a', false),
			};
			pending.resolve(config);
			runtime.streamed?.adopt(config);
			await flushMicrotasks();
			expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
				false
			);
			expect(start).not.toHaveBeenCalled();
		} finally {
			runtime.dispose();
		}
	});

	test('updating from absent user option to SSR-active user A with cached pre-lift or older doc keeps lift and newer synced doc', async () => {
		const rule = optOutRule({ prompt: 'none' });
		const resolution = matchedResolution(rule);
		const fp = resolution.fingerprints.choice;
		const preLiftDoc = makeUserConsent({
			checkedAt: NOW,
			choices: {
				marketing: {
					basis: { fingerprint: fp, kind: 'choice-v1' },
					confirmedAt: NOW - 2000,
					value: false,
				},
			},
			externalId: 'user_a',
			optOut: {
				method: 'button',
				recordedAt: NOW - 5000,
				rights: ['sale'],
			},
		});
		const base = {
			consentCategories: ['marketing'] as const,
			mode: Object.assign(
				() => ({
					identify: (_u: unknown, id: string | null) =>
						Promise.resolve({ subjectId: id ?? 'sub_a' }),
					liftOptOut: () => Promise.resolve({ ok: true, optOut: null }),
				}),
				{ kind: 'offline' as const }
			),
			persistence: false as const,
			prefetch: {
				initialPolicyPending: false,
				initialPolicyResolution: resolution,
				initialRecords: { now: NOW, subject: { subjectId: 'sub_a' } },
				initialUser: { externalId: 'user_a' },
				initialUserConsent: preLiftDoc,
				now: NOW,
			},
		};
		// Client starts with user: undefined (SSR seeded initialUser: user_a).
		const runtime = createConsentProviderRuntime(base, defaultRuntimeModules);
		try {
			runtime.start();
			// First, link and lift via kernel (simulating an identified session).
			await runtime.identify({
				externalId: 'user_a',
				identityToken: 'tok_a',
			});
			expect(await runtime.kernel.commands.optIn()).toEqual({
				ok: true,
				optOut: null,
			});
			expect(runtime.kernel.getSnapshot().optOut).toBeNull();

			// Client props now pass user A + token and cached pre-lift doc: MUST keep the lift!
			void runtime.update({
				...base,
				user: { externalId: 'user_a', identityToken: 'tok_a' },
				userConsent: structuredClone(preLiftDoc),
			});
			expect(runtime.kernel.getSnapshot().optOut).toBeNull();

			// Sync a newer document, then pass the older doc again via update -> MUST NOT roll back!
			runtime.syncUserConsent(
				makeUserConsent({
					checkedAt: NOW + 5000,
					choices: {
						marketing: {
							basis: { fingerprint: fp, kind: 'choice-v1' },
							confirmedAt: NOW + 4000,
							value: true,
						},
					},
					externalId: 'user_a',
				})
			);
			expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
				true
			);
			void runtime.update({
				...base,
				user: { externalId: 'user_a', identityToken: 'tok_a_2' },
				userConsent: structuredClone(preLiftDoc),
			});
			expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
				true
			);
		} finally {
			runtime.dispose();
		}
	});

	test('re-enabling with a resolved new-user denial never starts scripts under prior account', async () => {
		const { base, documentFor } = runtimeFixture();
		const start = vi.fn();
		const options = {
			...base,
			scripts: [],
			user: { externalId: 'a' },
			userConsent: documentFor('a', true),
		};
		const runtime = createConsentProviderRuntime(
			{ ...options, enabled: false },
			defaultRuntimeModules
		);
		try {
			runtime.start();
			await flushMicrotasks();
			start.mockClear();
			await runtime.update({
				...options,
				enabled: true,
				scripts: [
					{
						category: 'marketing',
						id: 'marketing',
						onBeforeLoad: start,
						src: 'https://example.test/marketing.js',
					},
				],
				user: { externalId: 'b' },
				userConsent: documentFor('b', false),
			});
			expect(start).not.toHaveBeenCalled();
		} finally {
			runtime.dispose();
		}
	});

	test('a cleared eager value is not reapplied at start', () => {
		const { base, documentFor } = runtimeFixture();
		const runtime = createConsentProviderRuntime(
			{
				...base,
				user: { externalId: 'a' },
				userConsent: documentFor('a', true),
			},
			defaultRuntimeModules
		);
		try {
			expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
				true
			);
			runtime.clearRecords();
			expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
				false
			);
			runtime.start();
			expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
				false
			);
		} finally {
			runtime.dispose();
		}
	});

	test('a cleared memoized Promise that already settled is not replayed at start', async () => {
		const { base, documentFor } = runtimeFixture();
		const pending = Promise.withResolvers<UserConsent>();
		const runtime = createConsentProviderRuntime(
			{
				...base,
				user: { externalId: 'a' },
			},
			defaultRuntimeModules
		);
		try {
			void runtime.update({
				...base,
				user: { externalId: 'a' },
				userConsent: pending.promise,
			});
			pending.resolve(documentFor('a', true));
			await flushMicrotasks();
			expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
				true
			);
			runtime.clearRecords();
			expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
				false
			);
			runtime.start();
			expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
				false
			);
		} finally {
			runtime.dispose();
		}
	});

	test('a signed-out null fences an older SSR stream with a user only in its payload', async () => {
		const { base, documentFor } = runtimeFixture();
		const pending = Promise.withResolvers<RuntimePrefetch>();
		const runtime = createConsentProviderRuntime(
			{
				...base,
				prefetch: pending.promise,
			},
			{
				...defaultRuntimeModules,
				streamPrefetch: streamPrefetchWith(resolveStreamedInit),
			}
		);
		try {
			runtime.start();
			await runtime.update({
				...base,
				prefetch: pending.promise,
				userConsent: null,
			});
			expect(runtime.kernel.getSnapshot().user).toBeNull();
			pending.resolve({
				...base.prefetch,
				initialUser: { externalId: 'a' },
				initialUserConsent: documentFor('a', true),
			});
			await flushMicrotasks();
			expect(runtime.kernel.getSnapshot().user).toBeNull();
		} finally {
			runtime.dispose();
		}
	});
});

describe('runtime regressions (set 5): identity epoch', () => {
	const r1Fixture = (rule = optInRule()) => {
		const resolution = matchedResolution(rule);
		const base = {
			consentCategories: ['marketing'] as const,
			mode: testing({ policy: [rule] }),
			prefetch: {
				initialPolicyPending: false,
				initialPolicyResolution: resolution,
				now: NOW,
			},
		};
		const documentFor = (externalId: string, value: boolean) =>
			makeUserConsent({
				choices: {
					marketing: {
						basis: {
							fingerprint: resolution.fingerprints.choice,
							kind: 'choice-v1',
						},
						confirmedAt: NOW - 1000,
						value,
					},
				},
				externalId,
			});
		return { base, documentFor };
	};

	test('SSR-streamed user with no user option survives an unrelated update', async () => {
		const rule = optOutRule({ prompt: 'none' });
		const { base, documentFor } = r1Fixture(rule);
		const pending = Promise.withResolvers<RuntimePrefetch>();
		const runtime = createConsentProviderRuntime(
			{ ...base, prefetch: pending.promise },
			{
				...defaultRuntimeModules,
				streamPrefetch: streamPrefetchWith(resolveStreamedInit),
			}
		);
		try {
			runtime.start();
			const config: RuntimePrefetch = {
				...base.prefetch,
				initialUser: { externalId: 'a' },
				initialUserConsent: documentFor('a', false),
			};
			pending.resolve(config);
			runtime.streamed?.adopt(config);
			await flushMicrotasks();
			expect(runtime.kernel.getSnapshot().user?.externalId).toBe('a');
			expect(runtime.kernel.getSnapshot().hasAccountLayer).toBe(true);
			expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
				false
			);
			// An unrelated re-render: same options, new object.
			await runtime.update({ ...base, prefetch: pending.promise });
			expect(runtime.kernel.getSnapshot().user?.externalId).toBe('a');
			expect(runtime.kernel.getSnapshot().hasAccountLayer).toBe(true);
			expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
				false
			);
		} finally {
			runtime.dispose();
		}
	});

	test('identify() user with no user option survives an unrelated update', async () => {
		const { base } = r1Fixture();
		const runtime = createConsentProviderRuntime(
			{ ...base },
			defaultRuntimeModules
		);
		try {
			runtime.start();
			await runtime.identify({ externalId: 'a' });
			expect(runtime.kernel.getSnapshot().user?.externalId).toBe('a');
			await runtime.update({
				...base,
				consentCategories: ['marketing', 'measurement'],
			});
			expect(runtime.kernel.getSnapshot().user?.externalId).toBe('a');
		} finally {
			runtime.dispose();
		}
	});

	test('stream adopted before start never starts marketing before the paired denial', async () => {
		const rule = optOutRule({ prompt: 'none' });
		const { base, documentFor } = r1Fixture(rule);
		const pending = Promise.withResolvers<RuntimePrefetch>();
		const start = vi.fn();
		const seen: [boolean, boolean][] = [];
		const runtime = createConsentProviderRuntime(
			{
				...base,
				prefetch: pending.promise,
				scripts: [
					{
						category: 'marketing',
						id: 'marketing',
						onBeforeLoad: start,
						src: 'https://example.test/marketing.js',
					},
				],
				user: { externalId: 'a' },
			},
			{
				...defaultRuntimeModules,
				streamPrefetch: streamPrefetchWith(resolveStreamedInit),
			}
		);
		try {
			const unsub = runtime.kernel.subscribe((s) => {
				seen.push([s.policyPending, s.effectivePermissions.marketing]);
			});
			const config: RuntimePrefetch = {
				...base.prefetch,
				initialUser: { externalId: 'a' },
				initialUserConsent: documentFor('a', false),
			};
			runtime.streamed?.adopt(config);
			pending.resolve(config);
			await flushMicrotasks();
			runtime.start();
			await flushMicrotasks();
			await vi.advanceTimersByTimeAsync(50);
			unsub();
			expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
				false
			);
			expect(seen.filter(([pp, m]) => !pp && m)).toEqual([]);
			expect(start).not.toHaveBeenCalled();
			expect(readStoredAccountLayer(undefined)?.externalId).toBe('a');
		} finally {
			runtime.dispose();
		}
	});

	test('re-enable with new user B keeps and persists B layer', async () => {
		const { base, documentFor } = r1Fixture();
		const options = {
			...base,
			user: { externalId: 'a' },
			userConsent: documentFor('a', true),
		};
		const runtime = createConsentProviderRuntime(
			{ ...options, enabled: false },
			defaultRuntimeModules
		);
		try {
			runtime.start();
			await flushMicrotasks();
			await runtime.update({
				...options,
				enabled: true,
				user: { externalId: 'b' },
				userConsent: documentFor('b', false),
			});
			await vi.advanceTimersByTimeAsync(50);
			const s = runtime.kernel.getSnapshot();
			expect(s.user?.externalId).toBe('b');
			expect(s.hasAccountLayer).toBe(true);
			expect(s.effectivePermissions.marketing).toBe(false);
			expect(readStoredAccountLayer(undefined)?.externalId).toBe('b');
		} finally {
			runtime.dispose();
		}
	});

	test('re-enable with same user and newer doc keeps the newer doc', async () => {
		const { base, documentFor } = r1Fixture();
		const older = documentFor('a', true);
		const docFalse = documentFor('a', false);
		const marketingChoice = docFalse.sync.choices.marketing;
		expect(marketingChoice).toBeDefined();
		if (!marketingChoice) {
			return;
		}
		const newer: UserConsent = {
			...docFalse,
			sync: {
				...docFalse.sync,
				checkedAt: NOW + 5000,
				choices: {
					marketing: {
						...marketingChoice,
						confirmedAt: NOW + 4000,
					},
				},
			},
		};
		const options = {
			...base,
			user: { externalId: 'a' },
			userConsent: older,
		};
		const runtime = createConsentProviderRuntime(
			{ ...options, enabled: false },
			defaultRuntimeModules
		);
		try {
			runtime.start();
			await flushMicrotasks();
			await runtime.update({
				...options,
				enabled: true,
				userConsent: newer,
			});
			await vi.advanceTimersByTimeAsync(50);
			const s = runtime.kernel.getSnapshot();
			expect(s.effectivePermissions.marketing).toBe(false);
			expect(readStoredAccountLayer(undefined)?.externalId).toBe('a');
		} finally {
			runtime.dispose();
		}
	});

	test('a scripts update keeps the account identity supplied by SSR', async () => {
		const { base, documentFor } = r1Fixture(optOutRule({ prompt: 'none' }));
		const options = {
			...base,
			prefetch: {
				...base.prefetch,
				initialUser: { externalId: 'a' },
				initialUserConsent: documentFor('a', false),
			},
		};
		const beforeLoad = vi.fn();
		const runtime = createConsentProviderRuntime(
			options,
			defaultRuntimeModules
		);
		try {
			runtime.start();
			expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
				false
			);
			await runtime.update({
				...options,
				scripts: [
					{
						category: 'marketing',
						id: 'marketing',
						onBeforeLoad: beforeLoad,
						src: 'https://example.test/script.js',
					},
				],
			});
			expect({
				loads: beforeLoad.mock.calls.length,
				marketing: runtime.kernel.getSnapshot().effectivePermissions.marketing,
				user: runtime.kernel.getSnapshot().user?.externalId,
			}).toEqual({ loads: 0, marketing: false, user: 'a' });
		} finally {
			runtime.dispose();
		}
	});

	test('a clear while started remains cleared after disabling and re-enabling', () => {
		const { base, documentFor } = r1Fixture();
		const options = {
			...base,
			user: { externalId: 'a' },
			userConsent: documentFor('a', true),
		};
		const runtime = createConsentProviderRuntime(
			options,
			defaultRuntimeModules
		);
		try {
			runtime.start();
			expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
				true
			);
			runtime.clearRecords();
			expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
				false
			);
			runtime.setEnabled(false);
			runtime.setEnabled(true);
			expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
				false
			);
		} finally {
			runtime.dispose();
		}
	});

	test('an initial signed-out null fences an SSR stream with a user only in its payload', async () => {
		const { base, documentFor } = r1Fixture();
		const pending = Promise.withResolvers<RuntimePrefetch>();
		const runtime = createConsentProviderRuntime(
			{
				...base,
				prefetch: pending.promise,
				userConsent: null,
			},
			{
				...defaultRuntimeModules,
				streamPrefetch: streamPrefetchWith(resolveStreamedInit),
			}
		);
		try {
			runtime.start();
			expect(runtime.kernel.getSnapshot().user).toBeNull();
			const config: RuntimePrefetch = {
				...base.prefetch,
				initialUser: { externalId: 'a' },
				initialUserConsent: documentFor('a', true),
			};
			pending.resolve(config);
			runtime.streamed?.adopt(config);
			await flushMicrotasks();
			expect(runtime.kernel.getSnapshot().user).toBeNull();
		} finally {
			runtime.dispose();
		}
	});

	test('streaming account cookies can seed the user and the account without a raw /check value', async () => {
		const rule = optOutRule({ prompt: 'none' });
		const { base, documentFor } = r1Fixture(rule);
		const choice = documentFor('a', false).sync.choices.marketing;
		expect(choice).toBeDefined();
		if (!choice) {
			return;
		}
		const layer = {
			appliedAt: NOW,
			checkedAt: NOW,
			choices: {
				marketing: {
					basis: choice.basis,
					rawConfirmedAt: choice.confirmedAt,
					value: false,
				},
			},
			externalId: 'a',
			optOut: null,
			skew: 0,
			vendors: {},
		};
		const keys = resolveAccountStorageKeys();
		for (const cookie of [
			`${keys.accountChoices}=${encodeAccountChoicesCookie(layer, 'rev_1')}`,
			`${keys.accountVendors}=${encodeAccountVendorsCookie(layer, 'rev_1')}`,
			`${keys.accountOptOut}=${encodeAccountOptOutCookie(layer, 'rev_1')}`,
		]) {
			document.cookie = `${cookie}; path=/`;
		}
		const state = await resolveRequestConsent({
			adapter: '@inth/test',
			mode: 'offline',
			now: NOW,
			offline: { policy: [rule] },
			request: { cookie: document.cookie, headers: new Headers() },
			user: { externalId: 'a' },
		});
		expect(state.initialRecords?.accountLayer?.externalId).toBe('a');
		const pending = Promise.withResolvers<RuntimePrefetch>();
		const beforeLoad = vi.fn();
		const runtime = createConsentProviderRuntime(
			{
				...base,
				prefetch: pending.promise,
				scripts: [
					{
						category: 'marketing',
						id: 'marketing',
						onBeforeLoad: beforeLoad,
						src: 'https://example.test/script.js',
					},
				],
			},
			{
				...defaultRuntimeModules,
				streamPrefetch: streamPrefetchWith(resolveStreamedInit),
			}
		);
		try {
			runtime.start();
			const applied = new Promise<void>((resolve) => {
				runtime.kernel.events.on('init:applied', () => resolve());
			});
			pending.resolve({
				...base.prefetch,
				initialRecords: state.initialRecords,
				initialUser: state.initialUser,
			});
			await applied;
			expect({
				account: runtime.kernel.getSnapshot().hasAccountLayer,
				loads: beforeLoad.mock.calls.length,
				marketing: runtime.kernel.getSnapshot().effectivePermissions.marketing,
				user: runtime.kernel.getSnapshot().user?.externalId,
			}).toEqual({ account: true, loads: 0, marketing: false, user: 'a' });
		} finally {
			runtime.dispose();
		}
	});

	test('a streamed user arms and follows an explicit pending consent Promise', async () => {
		const { base, documentFor } = r1Fixture(optOutRule({ prompt: 'none' }));
		const pending = Promise.withResolvers<RuntimePrefetch>();
		const consent = Promise.withResolvers<UserConsent>();
		const beforeLoad = vi.fn();
		const runtime = createConsentProviderRuntime(
			{
				...base,
				prefetch: pending.promise,
				scripts: [
					{
						category: 'marketing',
						id: 'marketing',
						onBeforeLoad: beforeLoad,
						src: 'https://example.test/script.js',
					},
				],
				userConsent: consent.promise,
			},
			{
				...defaultRuntimeModules,
				streamPrefetch: streamPrefetchWith(resolveStreamedInit),
			}
		);
		try {
			runtime.start();
			const config: RuntimePrefetch = {
				...base.prefetch,
				initialUser: { externalId: 'a' },
			};
			pending.resolve(config);
			runtime.streamed?.adopt(config);
			await flushMicrotasks();
			const held = runtime.kernel.getSnapshot().userConsentPending;
			consent.resolve(documentFor('a', false));
			await flushMicrotasks();
			expect({
				held,
				loads: beforeLoad.mock.calls.length,
				marketing: runtime.kernel.getSnapshot().effectivePermissions.marketing,
			}).toEqual({ held: true, loads: 0, marketing: false });
		} finally {
			runtime.dispose();
		}
	});

	test('a routine update preserves the identity and denial set through public runtime methods', async () => {
		const { base, documentFor } = r1Fixture(optOutRule({ prompt: 'none' }));
		const runtime = createConsentProviderRuntime(base, defaultRuntimeModules);
		try {
			runtime.start();
			await runtime.identify({ externalId: 'a' });
			runtime.syncUserConsent(documentFor('a', false));
			expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
				false
			);
			await runtime.update({ ...base });
			expect(runtime.kernel.getSnapshot().user?.externalId).toBe('a');
			expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
				false
			);
		} finally {
			runtime.dispose();
		}
	});
});

describe('runtime regressions (set 6)', () => {
	const r3Fixture = (rule = optInRule()) => {
		const resolution = matchedResolution(rule);
		const base = {
			consentCategories: ['marketing'] as const,
			mode: testing({ policy: [rule] }),
			prefetch: {
				initialPolicyPending: false,
				initialPolicyResolution: resolution,
				now: NOW,
			},
		};
		const documentFor = (externalId: string, value: boolean) =>
			makeUserConsent({
				choices: {
					marketing: {
						basis: {
							fingerprint: resolution.fingerprints.choice,
							kind: 'choice-v1',
						},
						confirmedAt: NOW - 1000,
						value,
					},
				},
				externalId,
			});
		return { base, documentFor, resolution };
	};

	test('a stream identity adopted by the Promise listener keeps account-cookie decisions when the UI adopts the same stream', async () => {
		const rule = optOutRule({ prompt: 'none' });
		const { base, documentFor } = r3Fixture(rule);
		const choice = documentFor('a', false).sync.choices.marketing;
		expect(choice).toBeDefined();
		if (!choice) {
			return;
		}
		const layer = {
			appliedAt: NOW,
			checkedAt: NOW,
			choices: {
				marketing: {
					basis: choice.basis,
					rawConfirmedAt: choice.confirmedAt,
					value: false,
				},
			},
			externalId: 'a',
			optOut: null,
			skew: 0,
			vendors: {},
		};
		const pending = Promise.withResolvers<RuntimePrefetch>();
		const runtime = createConsentProviderRuntime(
			{ ...base, prefetch: pending.promise },
			{
				...defaultRuntimeModules,
				streamPrefetch: streamPrefetchWith(resolveStreamedInit),
			}
		);
		try {
			const config: RuntimePrefetch = {
				...base.prefetch,
				initialRecords: { accountLayer: layer, now: NOW },
				initialUser: { externalId: 'a' },
			};
			pending.resolve(config);
			await runtime.streamed?.settled;
			expect(runtime.kernel.getSnapshot().user?.externalId).toBe('a');
			runtime.streamed?.adopt(config);
			expect({
				account: runtime.kernel.getSnapshot().hasAccountLayer,
				marketing: runtime.kernel.getSnapshot().effectivePermissions.marketing,
			}).toEqual({ account: true, marketing: false });
		} finally {
			runtime.dispose();
		}
	});

	test('a null Promise result fences an older stream for the same identity', async () => {
		const { base, documentFor } = r3Fixture(optOutRule({ prompt: 'none' }));
		const choice = documentFor('a', false).sync.choices.marketing;
		expect(choice).toBeDefined();
		if (!choice) {
			return;
		}
		const layer = {
			appliedAt: NOW,
			checkedAt: NOW,
			choices: {
				marketing: {
					basis: choice.basis,
					rawConfirmedAt: choice.confirmedAt,
					value: false,
				},
			},
			externalId: 'a',
			optOut: null,
			skew: 0,
			vendors: {},
		};
		const pending = Promise.withResolvers<RuntimePrefetch>();
		const consent = Promise.withResolvers<UserConsent | null>();
		const runtime = createConsentProviderRuntime(
			{
				...base,
				prefetch: pending.promise,
				user: { externalId: 'a' },
				userConsent: consent.promise,
			},
			{
				...defaultRuntimeModules,
				streamPrefetch: streamPrefetchWith(resolveStreamedInit),
			}
		);
		try {
			runtime.start();
			consent.resolve(null);
			await flushMicrotasks();
			expect(runtime.kernel.getSnapshot().userConsentPending).toBe(false);
			const config: RuntimePrefetch = {
				...base.prefetch,
				initialRecords: { accountLayer: layer, now: NOW },
				initialUser: { externalId: 'a' },
			};
			pending.resolve(config);
			runtime.streamed?.adopt(config);
			expect(Boolean(runtime.kernel.getSnapshot().hasAccountLayer)).toBe(false);
			expect(runtime.kernel.getAccountLayer()).toBeNull();
		} finally {
			runtime.dispose();
		}
	});

	test('startup does not replay an option document from before an explicit sign-out', () => {
		const { base, documentFor } = r3Fixture(optOutRule({ prompt: 'none' }));
		const runtime = createConsentProviderRuntime(
			{
				...base,
				user: { externalId: 'a' },
				userConsent: documentFor('a', false),
			},
			defaultRuntimeModules
		);
		try {
			expect(runtime.kernel.getSnapshot().hasAccountLayer).toBe(true);
			runtime.syncUserConsent(null);
			expect(runtime.kernel.getSnapshot().hasAccountLayer).toBeFalsy();
			runtime.start();
			expect(runtime.kernel.getSnapshot().hasAccountLayer).toBeFalsy();
		} finally {
			runtime.dispose();
		}
	});

	test('the default streamed init path cannot install cookie records after explicit signed-out null', async () => {
		const { base, documentFor } = r3Fixture(optOutRule({ prompt: 'none' }));
		const choice = documentFor('a', false).sync.choices.marketing;
		expect(choice).toBeDefined();
		if (!choice) {
			return;
		}
		const layer = {
			appliedAt: NOW,
			checkedAt: NOW,
			choices: {
				marketing: {
					basis: choice.basis,
					rawConfirmedAt: choice.confirmedAt,
					value: false,
				},
			},
			externalId: 'a',
			optOut: null,
			skew: 0,
			vendors: {},
		};
		const pending = Promise.withResolvers<RuntimePrefetch>();
		const runtime = createConsentProviderRuntime(
			{
				...base,
				prefetch: pending.promise,
				user: { externalId: 'a' },
			},
			{
				...defaultRuntimeModules,
				streamPrefetch: streamPrefetchWith(resolveStreamedInit),
			}
		);
		try {
			runtime.start();
			runtime.syncUserConsent(null);
			const applied = new Promise<void>((resolve) => {
				runtime.kernel.events.on('init:applied', () => {
					resolve();
				});
			});
			pending.resolve({
				...base.prefetch,
				initialRecords: { accountLayer: layer, now: NOW },
				initialUser: { externalId: 'a' },
			});
			await applied;
			expect(runtime.kernel.getSnapshot().hasAccountLayer).toBeFalsy();
		} finally {
			runtime.dispose();
		}
	});

	test('a newer cookie-only vendor record cannot inherit grants from the older localStorage record', () => {
		const { base } = r3Fixture(optOutRule({ prompt: 'none' }));
		const keys = resolveStorageKeys();
		const stale = { confirmedAt: NOW - 1000, denied: [], version: 1 as const };
		window.localStorage.setItem(
			keys.vendors,
			JSON.stringify({ ...stale, vendorTimes: { x: NOW - 1000 } })
		);
		document.cookie = `${keys.vendors}=${encodeVendorChoiceCompact(stale)}; path=/`;
		const runtime = createConsentProviderRuntime(
			{
				...base,
				user: { externalId: 'a' },
				userConsent: makeUserConsent({
					externalId: 'a',
					vendors: { x: { confirmedAt: NOW - 4000, value: false } },
				}),
				vendors: [{ category: 'marketing', id: 'x' }],
			},
			defaultRuntimeModules
		);
		try {
			runtime.start();
			expect(isVendorAllowed(runtime.kernel.getSnapshot(), 'x')).toBe(true);
			document.cookie = `${keys.vendors}=${encodeVendorChoiceCompact({
				confirmedAt: NOW,
				denied: ['y'],
				version: 1,
			})}; path=/`;
			runtime.reconcileStorage();
			const browser = runtime.kernel.getBrowserRecords();
			expect(browser.vendorChoice?.confirmedAt).toBe(NOW);
			expect({
				allowed: isVendorAllowed(runtime.kernel.getSnapshot(), 'x'),
				times: browser.vendorTimes ?? null,
			}).toEqual({ allowed: false, times: null });
		} finally {
			runtime.dispose();
		}
	});

	test('streamed.adopt() keeps initialRecords.accountLayer after Promise listener installs streamed user', async () => {
		const rule = optOutRule();
		const optOutResolution = matchedResolution(rule);
		const pending = Promise.withResolvers<RuntimePrefetch>();

		const runtime = createConsentProviderRuntime(
			{
				mode: Object.assign(() => ({ init: () => Promise.resolve({}) }), {
					kind: 'testing' as const,
				}),
				persistence: false,
				prefetch: pending.promise,
			},
			{ ...defaultRuntimeModules, streamPrefetch }
		);

		try {
			const streamedConfig: RuntimePrefetch = {
				initialPolicyResolution: optOutResolution,
				initialRecords: {
					accountLayer: {
						appliedAt: NOW,
						checkedAt: NOW,
						choices: {
							marketing: {
								basis: {
									fingerprint: optOutResolution.fingerprints.choice,
									kind: 'choice-v1' as const,
								},
								rawConfirmedAt: NOW - 1000,
								value: false,
							},
						},
						externalId: 'user-a',
						optOut: null,
						skew: 0,
						vendors: {},
					},
					now: NOW,
				},
				initialUser: { externalId: 'user-a' },
				now: NOW,
			};

			pending.resolve(streamedConfig);
			const settledConfig = await runtime.streamed?.settled;
			expect(settledConfig).toBeDefined();
			if (settledConfig) {
				runtime.streamed?.adopt(settledConfig);
			}

			expect(runtime.kernel.getSnapshot().user?.externalId).toBe('user-a');
			expect(runtime.kernel.getSnapshot().policyPending).toBe(false);
			expect(runtime.kernel.getSnapshot().hasAccountLayer).toBe(true);
			expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
				false
			);
		} finally {
			runtime.dispose();
		}
	});

	test('resolveStreamedInit does not install streamed initialRecords.accountLayer when constructed with userConsent: null', async () => {
		const rule = optOutRule();
		const optOutResolution = matchedResolution(rule);
		const pending = Promise.withResolvers<RuntimePrefetch>();

		const runtime = createConsentProviderRuntime(
			{
				mode: Object.assign(() => ({ init: () => Promise.resolve({}) }), {
					kind: 'testing' as const,
				}),
				persistence: false,
				prefetch: pending.promise,
				user: { externalId: 'user-a' },
				userConsent: null,
			},
			{ ...defaultRuntimeModules, streamPrefetch }
		);

		try {
			runtime.start();
			pending.resolve({
				initialPolicyResolution: optOutResolution,
				initialRecords: {
					accountLayer: {
						appliedAt: NOW,
						checkedAt: NOW,
						choices: {
							marketing: {
								basis: {
									fingerprint: optOutResolution.fingerprints.choice,
									kind: 'choice-v1' as const,
								},
								rawConfirmedAt: NOW - 1000,
								value: false,
							},
						},
						externalId: 'user-a',
						optOut: null,
						skew: 0,
						vendors: {},
					},
					now: NOW,
				},
				initialUser: { externalId: 'user-a' },
				now: NOW,
			});
			await flushMicrotasks();
			await flushMicrotasks();

			expect(runtime.kernel.getSnapshot().policyPending).toBe(false);
			expect(Boolean(runtime.kernel.getSnapshot().hasAccountLayer)).toBe(false);
			expect(runtime.kernel.getAccountLayer()).toBeNull();
			expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
				true
			);
		} finally {
			runtime.dispose();
		}
	});

	test('resolveStreamedInit does not install streamed initialRecords.accountLayer after update({ user, userConsent: null }) fences the stream', async () => {
		const rule = optOutRule();
		const optOutResolution = matchedResolution(rule);
		const pending = Promise.withResolvers<RuntimePrefetch>();

		const runtime = createConsentProviderRuntime(
			{
				mode: Object.assign(() => ({ init: () => Promise.resolve({}) }), {
					kind: 'testing' as const,
				}),
				persistence: false,
				prefetch: pending.promise,
			},
			{ ...defaultRuntimeModules, streamPrefetch }
		);

		try {
			runtime.start();
			await runtime.update({
				mode: Object.assign(() => ({ init: () => Promise.resolve({}) }), {
					kind: 'testing' as const,
				}),
				persistence: false,
				prefetch: pending.promise,
				user: { externalId: 'user-a' },
				userConsent: null,
			});

			pending.resolve({
				initialPolicyResolution: optOutResolution,
				initialRecords: {
					accountLayer: {
						appliedAt: NOW,
						checkedAt: NOW,
						choices: {
							marketing: {
								basis: {
									fingerprint: optOutResolution.fingerprints.choice,
									kind: 'choice-v1' as const,
								},
								rawConfirmedAt: NOW - 1000,
								value: false,
							},
						},
						externalId: 'user-a',
						optOut: null,
						skew: 0,
						vendors: {},
					},
					now: NOW,
				},
				initialUser: { externalId: 'user-a' },
				now: NOW,
			});
			await flushMicrotasks();
			await flushMicrotasks();

			expect(runtime.kernel.getSnapshot().policyPending).toBe(false);
			expect(Boolean(runtime.kernel.getSnapshot().hasAccountLayer)).toBe(false);
			expect(runtime.kernel.getAccountLayer()).toBeNull();
			expect(runtime.kernel.getSnapshot().effectivePermissions.marketing).toBe(
				true
			);
		} finally {
			runtime.dispose();
		}
	});
});
