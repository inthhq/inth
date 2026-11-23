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
import {
	encodeAccountChoicesCookie,
	encodeAccountLocalJson,
	encodeAccountOptOutCookie,
	encodeAccountVendorsCookie,
	readStoredAccountLayer,
} from '../../modules/persistence/account-codec';
import { resolveAccountStorageKeys } from '../../modules/persistence/account-keys';
import { resolveRequestConsent } from '../../server/request-consent';
import { testing } from '../../testing';
import { createConsentProviderRuntime, defaultRuntimeModules } from '../index';
import { createRuntimeKernel } from '../runtime-kernel';
import { serverScriptStart } from '../script-server-start';
import { streamPrefetchWith } from '../stream-mode';
import { resolveStreamedInit } from '../streamed-init';
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
