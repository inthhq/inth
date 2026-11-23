/**
 * @vitest-environment jsdom
 *
 * Account consent layer persistence: split cookies + localStorage, shared
 * revision coherence, cookie size budget with large vendor maps, synchronous
 * logout deletion, lazy-writer cancellation, cross-tab reconciliation,
 * `hasStoredConsent` vs `storedChoiceNames`, and SSR cookie-header reading.
 */
import type { UserConsent } from '@inth/sdk-schema/types';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
	matchedResolution,
	NOW,
	optInRule,
} from '../../../__tests__/fixtures/kernel-fixtures';
import { createKernel } from '../../../kernel';
import {
	resolveStorageKeys,
	storedChoiceNames,
} from '../../../libs/storage-keys';
import { hasStoredConsent } from '../../../runtime/deferred-boot';
import {
	encodeAccountChoicesCookie,
	encodeAccountOptOutCookie,
	encodeAccountVendorsCookie,
	readStoredAccountLayer,
	readStoredAccountLayerFromCookieHeader,
} from '../account-codec';
import {
	readStoredRecords,
	readStoredRecordsFromCookieHeader,
} from '../hydrate';
import { createPersistence } from '../index';
import { mountPersistence } from '../mount';
import type { WriterModule } from '../writer-loader';

const clearBrowserStorage = () => {
	window.localStorage.clear();
	for (const entry of document.cookie.split(';')) {
		const name = entry.split('=')[0]?.trim();
		if (name) {
			document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
		}
	}
};

const flushMacrotasks = () =>
	new Promise<void>((resolve) => {
		setTimeout(resolve, 10);
	});

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

beforeEach(() => {
	clearBrowserStorage();
	vi.spyOn(Date, 'now').mockReturnValue(NOW);
});

afterEach(() => {
	clearBrowserStorage();
	vi.restoreAllMocks();
});

const readCookieMap = () =>
	new Map(
		document.cookie.split('; ').map((pair) => {
			const idx = pair.indexOf('=');
			return [pair.slice(0, idx), pair.slice(idx + 1)] as const;
		})
	);

describe('account layer split cookies and localStorage persistence', () => {
	test('large vendor map stays within cookie limits: denied IDs in cookie, full map in localStorage', async () => {
		const resolution = matchedResolution(optInRule());
		const fp = resolution.fingerprints.choice;
		const keys = resolveStorageKeys();

		const vendors: UserConsent['sync']['vendors'] = {};
		for (let i = 0; i < 200; i += 1) {
			vendors[`vendor-${i}`] = {
				confirmedAt: NOW - 1000,
				value: i !== 7 && i !== 42,
			};
		}

		const kernel = createKernel({
			initialPolicyResolution: resolution,
			initialUser: { externalId: 'user_large' },
			now: NOW,
		});
		const persistence = createPersistence({ kernel });

		kernel.syncUserConsent(
			makeUserConsent({
				checkedAt: NOW,
				choices: {
					marketing: {
						basis: { fingerprint: fp, kind: 'choice-v1' },
						confirmedAt: NOW - 1000,
						expiresAt: NOW + 86_400_000,
						value: true,
					},
				},
				externalId: 'user_large',
				vendors,
			})
		);
		await flushMacrotasks();

		// Inspect raw cookies: each must be compact and well below 4096 bytes.
		const cookieMap = readCookieMap();
		const choicesCookie = cookieMap.get(keys.accountChoices) ?? '';
		const vendorsCookie = cookieMap.get(keys.accountVendors) ?? '';
		const optOutCookie = cookieMap.get(keys.accountOptOut) ?? '';

		expect(choicesCookie.length).toBeGreaterThan(0);
		expect(choicesCookie.length).toBeLessThan(512);
		expect(vendorsCookie.length).toBeGreaterThan(0);
		expect(vendorsCookie.length).toBeLessThan(512);
		// Empty opt-out part is written explicitly so it differs from a failed write.
		expect(optOutCookie.length).toBeGreaterThan(0);
		expect(optOutCookie).not.toContain('&o=');

		// Only the 2 denied vendors appear in the vendor cookie.
		expect(vendorsCookie).toContain('vendor-7');
		expect(vendorsCookie).toContain('vendor-42');
		expect(vendorsCookie).not.toContain('vendor-0');

		// Browser read gets all 200 vendors from localStorage.
		const fullRead = readStoredAccountLayer(undefined);
		expect(Object.keys(fullRead?.vendors ?? {})).toHaveLength(200);
		expect(fullRead?.vendors['vendor-7']?.value).toBe(false);
		expect(fullRead?.vendors['vendor-0']?.value).toBe(true);
		expect(fullRead?.choices.marketing?.expiresAt).toBe(NOW + 86_400_000);

		// SSR cookie header read gets choices + denied vendors without localStorage.
		const ssrRead = readStoredRecordsFromCookieHeader(
			document.cookie,
			undefined,
			NOW
		);
		expect(ssrRead.accountLayer).toMatchObject({
			choices: { marketing: { value: true } },
			externalId: 'user_large',
			optOut: null,
			vendors: {
				'vendor-42': { value: false },
				'vendor-7': { value: false },
			},
		});

		persistence.dispose();
		kernel.dispose();
	});

	test('a part with a mismatched revision is treated as missing', () => {
		const keys = resolveStorageKeys();
		const layer = {
			appliedAt: NOW,
			checkedAt: NOW,
			choices: {
				marketing: {
					basis: { fingerprint: 'fp_1', kind: 'choice-v1' as const },
					rawConfirmedAt: NOW - 1000,
					value: false,
				},
			},
			externalId: 'user_rev',
			optOut: {
				method: 'button' as const,
				rawRecordedAt: NOW - 1000,
				rights: ['sale' as const, 'share' as const],
			},
			skew: 0,
			vendors: {
				'meta-pixel': { rawConfirmedAt: NOW - 1000, value: false },
			},
		};

		// Choices and vendors share rev_2, while optOut carries stale rev_1.
		const header = [
			`${keys.accountChoices}=${encodeAccountChoicesCookie(layer, 'rev_2')}`,
			`${keys.accountVendors}=${encodeAccountVendorsCookie(layer, 'rev_2')}`,
			`${keys.accountOptOut}=${encodeAccountOptOutCookie({ ...layer, checkedAt: NOW - 5000 }, 'rev_1')}`,
		].join('; ');

		const decoded = readStoredAccountLayerFromCookieHeader(header, undefined);
		expect(decoded).not.toBeNull();
		expect(decoded?.choices.marketing?.value).toBe(false);
		expect(decoded?.vendors['meta-pixel']?.value).toBe(false);
		// Mismatched opt-out part is treated as missing!
		expect(decoded?.optOut).toBeNull();
	});

	test('logout deletes account cookies and localStorage synchronously and cancels queued lazy-writer write', async () => {
		const resolution = matchedResolution(optInRule());
		const fp = resolution.fingerprints.choice;
		const keys = resolveStorageKeys();

		// First persist A's account layer with a normal persistence handle.
		const first = createKernel({
			initialPolicyResolution: resolution,
			initialUser: { externalId: 'user_a' },
			now: NOW,
		});
		const p1 = createPersistence({ kernel: first });
		first.syncUserConsent(
			makeUserConsent({
				checkedAt: NOW,
				choices: {
					marketing: {
						basis: { fingerprint: fp, kind: 'choice-v1' },
						confirmedAt: NOW - 1000,
						value: true,
					},
				},
				externalId: 'user_a',
			})
		);
		await flushMacrotasks();
		expect(window.localStorage.getItem(keys.accountState)).not.toBeNull();
		expect(document.cookie).toContain(`${keys.accountChoices}=`);
		p1.dispose();
		first.dispose();

		// Mount with a lazy writer that has NOT loaded yet.
		const loaderDeferred = Promise.withResolvers<WriterModule>();
		const second = createKernel({
			initialPolicyResolution: resolution,
			initialUser: { externalId: 'user_a' },
			now: NOW + 1000,
		});
		const p2 = mountPersistence(
			{ kernel: second },
			{
				load: () => loaderDeferred.promise,
				module: undefined,
			}
		);

		// Queue an account write while writer is still loading, then log out synchronously.
		second.syncUserConsent(
			makeUserConsent({
				checkedAt: NOW + 1000,
				choices: {
					marketing: {
						basis: { fingerprint: fp, kind: 'choice-v1' },
						confirmedAt: NOW + 500,
						value: false,
					},
				},
				externalId: 'user_a',
			})
		);
		second.set.user(null);

		// Deleted SYNCHRONOUSLY before writer even loads!
		expect(window.localStorage.getItem(keys.accountState)).toBeNull();
		expect(document.cookie).not.toContain(`${keys.accountChoices}=`);
		expect(document.cookie).not.toContain(`${keys.accountVendors}=`);
		expect(document.cookie).not.toContain(`${keys.accountOptOut}=`);

		// When the lazy writer finally lands, the cancelled write MUST NOT recreate account storage.
		loaderDeferred.resolve(await import('../writer/writer'));
		await flushMacrotasks();
		expect(window.localStorage.getItem(keys.accountState)).toBeNull();
		expect(document.cookie).not.toContain(`${keys.accountChoices}=`);

		p2.dispose();
		second.dispose();
	});

	test('cold reload with A cookies and no user ignores A account layer', async () => {
		const resolution = matchedResolution(optInRule());
		const fp = resolution.fingerprints.choice;

		const first = createKernel({
			initialPolicyResolution: resolution,
			initialUser: { externalId: 'user_a' },
			now: NOW,
		});
		const p1 = createPersistence({ kernel: first });
		first.syncUserConsent(
			makeUserConsent({
				checkedAt: NOW,
				choices: {
					marketing: {
						basis: { fingerprint: fp, kind: 'choice-v1' },
						confirmedAt: NOW - 1000,
						value: true,
					},
				},
				externalId: 'user_a',
			})
		);
		await flushMacrotasks();
		p1.dispose();
		first.dispose();

		// Cold reload with NO user: cookies exist, but identity gate ignores them.
		const anon = createKernel({
			initialPolicyResolution: resolution,
			now: NOW + 1000,
		});
		const p2 = createPersistence({ kernel: anon });
		expect(anon.getAccountLayer()).toBeNull();
		expect(anon.getSnapshot().effectivePermissions.marketing).toBe(false);
		expect(anon.getSnapshot().explicitChoice).toBeNull();
		p2.dispose();
		anon.dispose();
	});

	test('hasStoredConsent sees account keys while storedChoiceNames omits them', async () => {
		const resolution = matchedResolution(optInRule());
		const keys = resolveStorageKeys();
		expect(storedChoiceNames().choice).not.toContain(keys.accountChoices);
		expect(storedChoiceNames().choice).not.toContain(keys.accountState);
		expect(hasStoredConsent()).toBe(false);

		const kernel = createKernel({
			initialPolicyResolution: resolution,
			initialUser: { externalId: 'user_a' },
			now: NOW,
		});
		const persistence = createPersistence({ kernel });
		kernel.syncUserConsent(
			makeUserConsent({
				checkedAt: NOW,
				externalId: 'user_a',
			})
		);
		await flushMacrotasks();

		expect(hasStoredConsent()).toBe(true);
		expect(readStoredRecords(undefined, NOW).found).toBe(true);

		// clear() wipes account keys too.
		persistence.clear();
		expect(hasStoredConsent()).toBe(false);
		expect(kernel.getAccountLayer()).toBeNull();

		persistence.dispose();
		kernel.dispose();
	});

	test('skipHydration (applyNewerStoredRecords) hydrates account layer when matching user', async () => {
		const resolution = matchedResolution(optInRule());
		const fp = resolution.fingerprints.choice;

		const writerKernel = createKernel({
			initialPolicyResolution: resolution,
			initialUser: { externalId: 'user_a' },
			now: NOW,
		});
		const p1 = createPersistence({ kernel: writerKernel });
		writerKernel.syncUserConsent(
			makeUserConsent({
				checkedAt: NOW,
				choices: {
					marketing: {
						basis: { fingerprint: fp, kind: 'choice-v1' },
						confirmedAt: NOW - 1000,
						value: true,
					},
				},
				externalId: 'user_a',
			})
		);
		await flushMacrotasks();
		p1.dispose();
		writerKernel.dispose();

		// A seeded kernel using skipHydration: true still adopts the stored account layer.
		const seeded = createKernel({
			initialPolicyResolution: resolution,
			initialUser: { externalId: 'user_a' },
			now: NOW + 1000,
		});
		const p2 = createPersistence({ kernel: seeded, skipHydration: true });
		expect(seeded.getAccountLayer()?.externalId).toBe('user_a');
		expect(seeded.getSnapshot().effectivePermissions.marketing).toBe(true);
		p2.dispose();
		seeded.dispose();
	});
});
