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
	optOutRule,
} from '../../../__tests__/fixtures/kernel-fixtures';
import { createKernel } from '../../../kernel';
import { storedChoiceNames } from '../../../libs/storage-keys';
import { hasStoredConsent } from '../../../runtime/deferred-boot';
import { serverScriptStart } from '../../../runtime/script-server-start';
import { testing } from '../../../testing';
import {
	encodeAccountChoicesCookie,
	encodeAccountOptOutCookie,
	encodeAccountVendorsCookie,
	readStoredAccountLayer,
	readStoredAccountLayerFromCookieHeader,
} from '../account-codec';
import { resolveAccountStorageKeys } from '../account-keys';
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
		const keys = resolveAccountStorageKeys();

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
		const keys = resolveAccountStorageKeys();
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
		const keys = resolveAccountStorageKeys();

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
		const keys = resolveAccountStorageKeys();
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

describe('persistence regressions (set 1)', () => {
	test('cross-tab reconcile ignores degraded/partial/equal-checkedAt reads and stale tab does not overwrite newer storage', async () => {
		const resolution = matchedResolution(optInRule());
		const fp = resolution.fingerprints.choice;
		const keys = resolveAccountStorageKeys();

		const tab1 = createKernel({
			initialPolicyResolution: resolution,
			initialUser: { externalId: 'user_a' },
			now: NOW,
		});
		const p1 = createPersistence({ kernel: tab1 });
		tab1.syncUserConsent(
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

		// Corrupt localStorage while tab1 is live: reconcile MUST NOT adopt a degraded read or wipe memory.
		window.localStorage.setItem(keys.accountState, '{corrupt');
		p1.reconcile();
		expect(tab1.getSnapshot().effectivePermissions.marketing).toBe(true);

		// Restore clean storage with a NEWER document from tab2 (checkedAt: NOW + 5000, marketing: false).
		const tab2 = createKernel({
			initialPolicyResolution: resolution,
			initialUser: { externalId: 'user_a' },
			now: NOW + 5000,
		});
		const p2 = createPersistence({ kernel: tab2 });
		tab2.syncUserConsent(
			makeUserConsent({
				checkedAt: NOW + 5000,
				choices: {
					marketing: {
						basis: { fingerprint: fp, kind: 'choice-v1' },
						confirmedAt: NOW + 4000,
						value: false,
					},
				},
				externalId: 'user_a',
			})
		);
		await flushMacrotasks();

		// Tab1 queues a stale write (checkedAt: NOW + 1000 < NOW + 5000) before reconciling: must NOT overwrite tab2's newer storage (#13)!
		tab1.syncUserConsent(
			makeUserConsent({
				checkedAt: NOW + 1000,
				choices: {
					marketing: {
						basis: { fingerprint: fp, kind: 'choice-v1' },
						confirmedAt: NOW + 500,
						value: true,
					},
				},
				externalId: 'user_a',
			})
		);
		await flushMacrotasks();
		expect(readStoredAccountLayer(undefined)?.checkedAt).toBe(NOW + 5000);
		expect(readStoredAccountLayer(undefined)?.choices.marketing?.value).toBe(
			false
		);

		p1.dispose();
		p2.dispose();
		tab1.dispose();
		tab2.dispose();
	});

	test('skipHydration recovers missing choices or opt-out from localStorage at equal checkedAt', async () => {
		const resolution = matchedResolution(optInRule());
		const fp = resolution.fingerprints.choice;

		// Persist full layer (choices + opt-out) to cookies + localStorage.
		const writer = createKernel({
			initialPolicyResolution: resolution,
			initialUser: { externalId: 'user_a' },
			now: NOW,
		});
		const p1 = createPersistence({ kernel: writer });
		writer.syncUserConsent(
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
				optOut: {
					method: 'button',
					recordedAt: NOW - 1000,
					rights: ['sale', 'share'],
				},
			})
		);
		await flushMacrotasks();
		p1.dispose();
		writer.dispose();

		// Seeded kernel mimics SSR where the choices & optOut cookies were missing (only vendors cookie present at same checkedAt).
		const seeded = createKernel({
			initialPolicyResolution: resolution,
			initialRecords: {
				accountLayer: {
					appliedAt: NOW,
					checkedAt: NOW,
					choices: {},
					externalId: 'user_a',
					optOut: null,
					skew: 0,
					vendors: {},
				},
				now: NOW,
			},
			initialUser: { externalId: 'user_a' },
			now: NOW,
		});
		const p2 = createPersistence({ kernel: seeded, skipHydration: true });
		expect(seeded.getAccountLayer()?.choices.marketing?.value).toBe(true);
		expect(seeded.getAccountLayer()?.optOut?.rights).toEqual(['sale', 'share']);
		p2.dispose();
		seeded.dispose();
	});

	test('opt-out lift survives reload even when cookie writes fail after the lift', async () => {
		const resolution = matchedResolution(optInRule());
		const SUBJECT = '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c';
		const first = createKernel({
			initialPolicyResolution: resolution,
			initialUser: { externalId: 'user_a', identityToken: 'tok_a' },
			now: NOW,
			transport: {
				identify: (_u, subjectId) =>
					Promise.resolve({ subjectId: subjectId ?? SUBJECT }),
				liftOptOut: (payload) =>
					Promise.resolve({
						ok: true,
						optOut: null,
						subjectId: payload.subjectId,
					}),
			},
		});
		const p1 = createPersistence({ kernel: first });
		first.syncUserConsent(
			makeUserConsent({
				checkedAt: NOW,
				externalId: 'user_a',
				optOut: {
					method: 'button',
					recordedAt: NOW - 1000,
					rights: ['sale', 'share'],
				},
			})
		);
		await flushMacrotasks();
		expect(readStoredAccountLayer(undefined)?.optOut?.rights).toEqual([
			'sale',
			'share',
		]);

		// Simulate cookie writes silently failing during the lift (cookies stay frozen at pre-lift values while localStorage updates).
		const preLiftCookies = document.cookie;
		const cookieDesc = Object.getOwnPropertyDescriptor(
			Document.prototype,
			'cookie'
		);
		vi.spyOn(document, 'cookie', 'set').mockImplementation(() => undefined);
		vi.spyOn(document, 'cookie', 'get').mockReturnValue(preLiftCookies);

		const lifted = await first.commands.optIn();
		expect(lifted).toEqual({ ok: true, optOut: null });
		await flushMacrotasks();
		p1.dispose();
		first.dispose();

		// Reload with the stale pre-lift cookies still present alongside the post-lift localStorage!
		const readAfterLift = readStoredAccountLayer(undefined);
		expect(readAfterLift?.optOut).toBeNull();
		if (cookieDesc) {
			Object.defineProperty(document, 'cookie', cookieDesc);
		}
	});

	test('denying ~150 vendors stays within cookie budget with explicit overflow marker, and browser recovers full list from localStorage', async () => {
		const resolution = matchedResolution(optInRule());
		const keys = resolveAccountStorageKeys();

		const vendors: UserConsent['sync']['vendors'] = {};
		for (let i = 0; i < 150; i += 1) {
			vendors[`long-denied-vendor-slug-${String(i).padStart(3, '0')}`] = {
				confirmedAt: NOW - 1000,
				value: false,
			};
		}

		const kernel = createKernel({
			initialPolicyResolution: resolution,
			initialUser: { externalId: 'user_overflow' },
			now: NOW,
		});
		const persistence = createPersistence({ kernel });
		kernel.syncUserConsent(
			makeUserConsent({
				checkedAt: NOW,
				externalId: 'user_overflow',
				vendors,
			})
		);
		await flushMacrotasks();

		const cookieMap = readCookieMap();
		const vendorsCookie = cookieMap.get(keys.accountVendors) ?? '';
		expect(vendorsCookie.length).toBeGreaterThan(0);
		expect(vendorsCookie.length).toBeLessThanOrEqual(2048);
		expect(vendorsCookie).toContain('ov=1');

		// Server read marks vendorsOverflow so serverStart won't run vendor-gated scripts blindly.
		const ssrLayer = readStoredAccountLayerFromCookieHeader(
			document.cookie,
			undefined
		);
		expect(ssrLayer?.vendorsOverflow).toBe(true);

		// Browser read recovers all 150 denied vendors from localStorage.
		const browserLayer = readStoredAccountLayer(undefined);
		expect(Object.keys(browserLayer?.vendors ?? {})).toHaveLength(150);
		expect(browserLayer?.vendorsOverflow).toBeUndefined();

		persistence.dispose();
		kernel.dispose();
	});

	test('inline serverStart uses account ordering time, guards decodeURIComponent, aborts on newer localStorage checkedAt, and skips vendor-gated scripts on overflow', () => {
		const rule = optOutRule({ prompt: 'none' });
		const resolution = matchedResolution(rule);
		const fp = resolution.fingerprints.choice;
		const keys = resolveAccountStorageKeys();
		const TEN_MIN = 10 * 60 * 1000;

		const runInline = (code: string | undefined): number => {
			if (!code) {
				return 0;
			}
			const w = window as unknown as {
				__inthRender?: { starts?: Record<string, number> };
			};
			delete w.__inthRender;
			// oxlint-disable-next-line no-new-func -- Testing generated serverStart inline script
			new Function(code)();
			return w.__inthRender?.starts?.ads === 1 ? 1 : 0;
		};

		const scripts = [
			{
				category: 'marketing' as const,
				id: 'ads',
				serverStart: () => ({ prelude: 'window.__adsRan = 1;' }),
				src: 'https://cdn.example.test/ads.js',
				vendor: 'ads-vendor',
			},
		];

		// 1. Server rendered with account grant at checkedAt=NOW; browser localStorage has a NEWER checkedAt=NOW+5000 (with grant omitted!).
		// Inline serverStart MUST abort (fail safe)!
		const serverGrantDoc = makeUserConsent({
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
		const code1 = serverScriptStart({
			consentCategories: ['marketing'],
			mode: testing({ policy: [rule] }),
			prefetch: {
				initialPolicyPending: false,
				initialPolicyResolution: resolution,
				initialRecords: { now: NOW },
				initialUser: { externalId: 'user_a' },
				initialUserConsent: serverGrantDoc,
				now: NOW,
			},
			scripts,
		});
		expect(code1).toBeDefined();
		// Positive control: without a newer localStorage copy, serverStart proceeds.
		expect(runInline(code1)).toBe(1);
		window.localStorage.setItem(
			keys.accountState,
			JSON.stringify({
				appliedAt: NOW + 5000,
				checkedAt: NOW + 5000,
				choices: {},
				externalId: 'user_a',
				optOut: null,
				rev: 'rev_newer',
				skew: 0,
				vendors: {},
				version: 1,
			})
		);
		expect(runInline(code1)).toBe(0);
		clearBrowserStorage();

		// 2. Server clock was 10 min ahead (skew=TEN_MIN): account cookie has denial at raw=NOW+TEN_MIN-5000 (ordering time = NOW-5000),
		// while browser already has a newer local grant at NOW-1000. Inline serverStart MUST NOT falsely abort because of raw > NOW-1000!
		const code2 = serverScriptStart({
			consentCategories: ['marketing'],
			mode: testing({ policy: [rule] }),
			prefetch: {
				initialPolicyPending: false,
				initialPolicyResolution: resolution,
				initialRecords: {
					choice: {
						categories: {
							marketing: {
								basis: { fingerprint: fp, kind: 'choice-v1' },
								confirmedAt: NOW - 1000,
								value: true,
							},
						},
						version: 3,
					},
					now: NOW,
				},
				initialUser: { externalId: 'user_a' },
				now: NOW,
			},
			scripts,
		});
		expect(code2).toBeDefined();
		document.cookie = `${keys.accountChoices}=${encodeAccountChoicesCookie(
			{
				appliedAt: NOW - 2000,
				checkedAt: NOW + TEN_MIN - 2000,
				choices: {
					marketing: {
						basis: { fingerprint: fp, kind: 'choice-v1' },
						rawConfirmedAt: NOW + TEN_MIN - 5000,
						value: false,
					},
				},
				externalId: 'user_a',
				optOut: null,
				skew: TEN_MIN,
				vendors: {},
			},
			'rev_skew'
		)}; path=/`;
		expect(runInline(code2)).toBe(1);
		clearBrowserStorage();

		// 3. Malformed percent-encoding in account vendors cookie must not throw (guards decodeURIComponent).
		document.cookie = `${keys.accountVendors}=v=1&r=r1&eid=user_a&c=${NOW}&s=0&a=${NOW}&d=%E0%A4%A.${NOW}; path=/`;
		expect(() => runInline(code2)).not.toThrow();
		expect(runInline(code2)).toBe(0);
		clearBrowserStorage();

		// 4. Server read with vendorsOverflow: true skips vendor-gated serverStart scripts!
		const codeOverflow = serverScriptStart({
			consentCategories: ['marketing'],
			mode: testing({ policy: [rule] }),
			prefetch: {
				initialPolicyPending: false,
				initialPolicyResolution: resolution,
				initialRecords: {
					accountLayer: {
						appliedAt: NOW,
						checkedAt: NOW,
						choices: {},
						externalId: 'user_a',
						optOut: null,
						skew: 0,
						vendors: {},
						vendorsOverflow: true,
					} as never,
					now: NOW,
				},
				initialUser: { externalId: 'user_a' },
				now: NOW,
			},
			scripts,
		});
		expect(codeOverflow).toBeUndefined();
	});
});
