/**
 * @vitest-environment jsdom
 *
 * Cross-domain `userConsent` kernel behavior: two-layer separation, by-function
 * read split, clock skew & expiry, basis compatibility, identity fencing,
 * server opt-out routing & lift, GPC, vendors, and pending hold across gates.
 */
import type { OptOutRecord, UserConsent } from '@inth/sdk-schema/types';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
	iabRule,
	matchedResolution,
	NOW,
	optInRule,
	optOutRule,
} from '../../__tests__/fixtures/kernel-fixtures';
import { createClearOnRevocation } from '../../modules/clear-on-revocation';
import { isVendorAllowed } from '../../modules/has';
import { createIframeBlocker } from '../../modules/iframe-blocker';
import { createNetworkBlocker } from '../../modules/network-blocker';
import { createPersistence } from '../../modules/persistence';
import { readStoredAccountLayer } from '../../modules/persistence/account-codec';
import { readStoredRecordsFromCookieHeader } from '../../modules/persistence/hydrate';
import { createScriptLoader } from '../../modules/script-loader';
import { createPreferenceDraft } from '../../preference-draft';
import { canDeferEngine } from '../../surface-actions/defer-engine';
import { kernelOnly } from '../../surface-actions/instant-commit';
import { createV1RecordTransport } from '../../transports/v1/records';
import type {
	KernelTransport,
	LiftOptOutPayload,
	OptOutPayload,
	SavePayload,
} from '../../types';
import { clearKernelRecords } from '../clear-records';
import { createKernel } from '../index';
import { createMemoryOutboxStore } from '../save-outbox';

const SUBJECT_UUID = '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c';
const RECORD_UUID = '0193e5a8-7c1e-7b7a-9d7e-2f0c9a3b4d5e';

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

describe('userConsent two-layer read split and re-POST prevention', () => {
	test('sync, reload, save one unrelated category: POST has no account receipts and no vendor map', async () => {
		const rule = optInRule();
		const resolution = matchedResolution(rule);
		const fp = resolution.fingerprints.choice;
		const savedPayloads: SavePayload[] = [];
		const transport: KernelTransport = {
			save: (payload) => {
				savedPayloads.push(payload);
				return Promise.resolve({ ok: true, subjectId: payload.subjectId });
			},
		};

		const first = createKernel(
			{
				initialPolicyResolution: resolution,
				initialUser: { externalId: 'user_a' },
				initialVendors: {
					declared: [
						{
							category: 'marketing',
							id: 'meta-pixel',
							presentable: true,
							source: 'config',
						},
						{
							category: 'measurement',
							id: 'posthog',
							presentable: true,
							source: 'config',
						},
					],
					listVersion: 'v1',
				},
				now: NOW,
				transport,
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		const p1 = createPersistence({ kernel: first });

		first.syncUserConsent(
			makeUserConsent({
				checkedAt: NOW,
				choices: {
					marketing: {
						basis: { fingerprint: fp, kind: 'choice-v1' },
						confirmedAt: NOW - 5000,
						value: true,
					},
				},
				externalId: 'user_a',
				vendors: {
					'meta-pixel': { confirmedAt: NOW - 5000, value: false },
				},
			})
		);
		await flushMacrotasks();
		expect(first.getSnapshot().effectivePermissions.marketing).toBe(true);
		expect(first.getSnapshot().vendorChoice?.denied).toEqual(['meta-pixel']);
		p1.dispose();
		first.dispose();

		// Reload on the same domain with the same user.
		const reloaded = createKernel(
			{
				initialPolicyResolution: resolution,
				initialUser: { externalId: 'user_a' },
				initialVendors: {
					declared: [
						{
							category: 'marketing',
							id: 'meta-pixel',
							presentable: true,
							source: 'config',
						},
						{
							category: 'measurement',
							id: 'posthog',
							presentable: true,
							source: 'config',
						},
					],
					listVersion: 'v1',
				},
				now: NOW + 1000,
				transport,
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		const p2 = createPersistence({ kernel: reloaded });
		expect(
			reloaded.getSnapshot().explicitChoice?.categories.marketing?.value
		).toBe(true);
		expect(reloaded.getSnapshot().vendorChoice?.denied).toEqual(['meta-pixel']);

		// Save one unrelated category: POST carries only measurement, no account marketing receipt, no vendor map.
		vi.spyOn(Date, 'now').mockReturnValue(NOW + 2000);
		const saveResult = await reloaded.commands.save({ measurement: true });
		expect(saveResult.ok).toBe(true);
		expect(savedPayloads).toHaveLength(1);
		expect(Object.keys(savedPayloads[0]?.choice.categories ?? {})).toEqual([
			'measurement',
		]);
		expect(savedPayloads[0]?.vendorChoice).toBeUndefined();
		// Account vendor denial still holds after category-only save.
		expect(reloaded.getSnapshot().vendorChoice?.denied).toEqual(['meta-pixel']);

		// Now save one vendor (posthog: false): account vendor denial (meta-pixel) is confirmed, not overwritten.
		vi.spyOn(Date, 'now').mockReturnValue(NOW + 3000);
		await reloaded.commands.save({ vendors: { posthog: false } });
		expect(savedPayloads).toHaveLength(2);
		expect(savedPayloads[1]?.vendorChoice?.grants).toEqual({
			'meta-pixel': false,
			posthog: false,
		});
		expect(reloaded.getSnapshot().vendorChoice?.denied).toEqual([
			'meta-pixel',
			'posthog',
		]);

		p2.dispose();
		reloaded.dispose();
	});

	test('no-input save() and preference draft show and confirm account choices on a fresh domain', async () => {
		const rule = optInRule();
		const resolution = matchedResolution(rule);
		const fp = resolution.fingerprints.choice;
		const savedPayloads: SavePayload[] = [];
		const kernel = createKernel(
			{
				consentCategories: [
					'functionality',
					'experience',
					'measurement',
					'marketing',
				],
				initialPolicyResolution: resolution,
				initialUser: { externalId: 'user_a' },
				now: NOW,
				transport: {
					save: (payload) => {
						savedPayloads.push(payload);
						return Promise.resolve({ ok: true, subjectId: payload.subjectId });
					},
				},
			},
			{ outboxStore: createMemoryOutboxStore() }
		);

		kernel.syncUserConsent(
			makeUserConsent({
				checkedAt: NOW,
				choices: {
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
			})
		);

		const draft = createPreferenceDraft(kernel);
		expect(draft.getState().values.marketing).toBe(true);
		expect(draft.getState().values.measurement).toBe(false);

		const res = await kernel.commands.save();
		expect(res.ok).toBe(true);
		expect(savedPayloads[0]?.choice.categories.marketing?.value).toBe(true);
		expect(savedPayloads[0]?.choice.categories.measurement?.value).toBe(false);
		kernel.dispose();
	});

	test('instant commit and defer engine route through kernel when account layer exists', () => {
		const resolution = matchedResolution(optInRule());
		const kernel = createKernel({
			initialPolicyResolution: resolution,
			initialUser: { externalId: 'user_a' },
			initialUserConsent: makeUserConsent({ externalId: 'user_a' }),
			now: NOW,
		});
		const snap = kernel.getSnapshot();
		expect(snap.hasAccountLayer).toBe(true);
		expect(kernelOnly(snap)).toBe(true);
		expect(canDeferEngine(snap, {}, NOW)).toBe(false);

		// Also when userConsent option is passed without an account layer yet.
		const anon = createKernel({
			initialPolicyResolution: resolution,
			now: NOW,
		});
		expect(canDeferEngine(anon.getSnapshot(), { userConsent: null }, NOW)).toBe(
			false
		);
		anon.dispose();
		kernel.dispose();
	});
});

describe('clock skew, expiry, and basis compatibility', () => {
	test('server ahead 10 min: local grant clicked after account denial wins across reloads', async () => {
		const rule = optInRule();
		const resolution = matchedResolution(rule);
		const fp = resolution.fingerprints.choice;
		const TEN_MIN = 10 * 60 * 1000;

		const first = createKernel(
			{
				initialPolicyResolution: resolution,
				initialUser: { externalId: 'user_a' },
				now: NOW,
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		const p1 = createPersistence({ kernel: first });

		// Server clock is 10 minutes ahead of local NOW.
		first.syncUserConsent(
			makeUserConsent({
				checkedAt: NOW + TEN_MIN,
				choices: {
					marketing: {
						basis: { fingerprint: fp, kind: 'choice-v1' },
						confirmedAt: NOW + TEN_MIN - 1000,
						value: false,
					},
				},
				externalId: 'user_a',
			})
		);
		expect(first.getSnapshot().effectivePermissions.marketing).toBe(false);

		// Local visitor grants marketing 2 seconds later on local clock (NOW + 2000).
		vi.spyOn(Date, 'now').mockReturnValue(NOW + 2000);
		await first.commands.save({ marketing: true });
		await flushMacrotasks();
		expect(first.getSnapshot().effectivePermissions.marketing).toBe(true);
		p1.dispose();
		first.dispose();

		// Reload: local grant must still beat the shifted account denial!
		vi.spyOn(Date, 'now').mockReturnValue(NOW + 3000);
		const reloaded = createKernel(
			{
				initialPolicyResolution: resolution,
				initialUser: { externalId: 'user_a' },
				now: NOW + 3000,
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		const p2 = createPersistence({ kernel: reloaded });
		expect(reloaded.getSnapshot().effectivePermissions.marketing).toBe(true);
		p2.dispose();
		reloaded.dispose();
	});

	test('cached document with older checkedAt loses to newer local click, and backwards clock keeps account layer', async () => {
		const rule = optInRule();
		const resolution = matchedResolution(rule);
		const fp = resolution.fingerprints.choice;

		const kernel = createKernel(
			{
				initialPolicyResolution: resolution,
				initialUser: { externalId: 'user_a' },
				now: NOW,
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		const p1 = createPersistence({ kernel });

		// Fresh doc at NOW
		kernel.syncUserConsent(
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
		// Older cached doc with checkedAt < NOW is dropped.
		const appliedOlder = kernel.syncUserConsent(
			makeUserConsent({
				checkedAt: NOW - 5000,
				choices: {
					marketing: {
						basis: { fingerprint: fp, kind: 'choice-v1' },
						confirmedAt: NOW - 6000,
						value: false,
					},
				},
				externalId: 'user_a',
			})
		);
		expect(appliedOlder).toBe(false);
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(true);

		// Local click at NOW + 1000 beats a cached document whose confirmedAt is earlier.
		vi.spyOn(Date, 'now').mockReturnValue(NOW + 1000);
		await kernel.commands.save({ marketing: false });
		await flushMacrotasks();
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);

		p1.dispose();
		kernel.dispose();

		// Backwards clock correction: browser clock jumps back 1 hour, account layer still loads!
		vi.spyOn(Date, 'now').mockReturnValue(NOW - 3_600_000);
		const backInTime = createKernel(
			{
				initialPolicyResolution: resolution,
				initialUser: { externalId: 'user_a' },
				now: NOW - 3_600_000,
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		const p2 = createPersistence({ kernel: backInTime });
		expect(backInTime.getAccountLayer()).not.toBeNull();
		expect(backInTime.getAccountLayer()?.externalId).toBe('user_a');
		p2.dispose();
		backInTime.dispose();
	});

	test('synced grant with future expiresAt is valid and expires at expiresAt - skew', () => {
		const rule = optInRule();
		const resolution = matchedResolution(rule);
		const fp = resolution.fingerprints.choice;
		const TEN_MIN = 10 * 60 * 1000;

		const kernel = createKernel({
			initialPolicyResolution: resolution,
			initialUser: { externalId: 'user_a' },
			now: NOW,
		});
		// Server ahead by 10 min; grant expires 60s after server checkedAt -> NOW + 60_000 locally.
		kernel.syncUserConsent(
			makeUserConsent({
				checkedAt: NOW + TEN_MIN,
				choices: {
					marketing: {
						basis: { fingerprint: fp, kind: 'choice-v1' },
						confirmedAt: NOW + TEN_MIN - 5000,
						expiresAt: NOW + TEN_MIN + 60_000,
						value: true,
					},
				},
				externalId: 'user_a',
			})
		);
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(true);
		expect(kernel.getSnapshot().nextDeadline).toBe(NOW + 60_000);

		kernel.refresh(NOW + 60_000);
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
		kernel.dispose();
	});

	test('incompatible account denial still denies; incompatible account grant is dropped without hiding older browser record', () => {
		const rule = optInRule();
		const resolution = matchedResolution(rule);
		const fp = resolution.fingerprints.choice;

		const kernel = createKernel({
			initialPolicyResolution: resolution,
			initialRecords: {
				choice: {
					categories: {
						measurement: {
							basis: { fingerprint: fp, kind: 'choice-v1' },
							confirmedAt: NOW - 10_000,
							value: true,
						},
					},
					version: 3,
				},
				now: NOW,
			},
			initialUser: { externalId: 'user_a' },
			now: NOW,
		});

		kernel.syncUserConsent(
			makeUserConsent({
				checkedAt: NOW,
				choices: {
					// Incompatible denial: still denies!
					marketing: {
						basis: { fingerprint: 'other-policy-fp', kind: 'choice-v1' },
						confirmedAt: NOW - 1000,
						value: false,
					},
					// Incompatible grant (newer than browser measurement grant): dropped, so older browser grant stands!
					measurement: {
						basis: { fingerprint: 'other-policy-fp', kind: 'choice-v1' },
						confirmedAt: NOW - 1000,
						value: true,
					},
				},
				externalId: 'user_a',
			})
		);

		const snap = kernel.getSnapshot();
		expect(snap.effectivePermissions.marketing).toBe(false);
		expect(snap.restrictions.marketing).toContain('explicit-denial');
		expect(snap.effectivePermissions.measurement).toBe(true);
		expect(snap.explicitChoice?.categories.measurement?.basis).toEqual({
			fingerprint: fp,
			kind: 'choice-v1',
		});
		kernel.dispose();
	});
});

describe('opt-out, GPC, and account opt-out lift', () => {
	test('optOut() click with account opt-out present records a device opt-out (both)', async () => {
		const resolution = matchedResolution(optOutRule());
		const optOutCalls: OptOutPayload[] = [];
		const kernel = createKernel(
			{
				initialPolicyResolution: resolution,
				initialUser: { externalId: 'user_a', identityToken: 'tok_a' },
				now: NOW,
				transport: {
					optOut: (payload) => {
						optOutCalls.push(payload);
						return Promise.resolve({
							ok: true,
							optOut: {
								heldBy: 'both',
								method: 'button',
								recordedAt: NOW,
								rights: ['sale', 'share', 'targeted_ads'],
							},
							subjectId: payload.subjectId,
						});
					},
				},
			},
			{ outboxStore: createMemoryOutboxStore() }
		);

		kernel.syncUserConsent(
			makeUserConsent({
				checkedAt: NOW,
				externalId: 'user_a',
				optOut: {
					method: 'button',
					recordedAt: NOW - 5000,
					rights: ['sale', 'share', 'targeted_ads', 'limit_sensitive'],
				},
			})
		);
		expect(kernel.getSnapshot().optOut?.heldBy).toBe('person');
		// limit_sensitive is ignored by sync.
		expect(kernel.getSnapshot().optOut?.rights).toEqual([
			'sale',
			'share',
			'targeted_ads',
		]);

		const res = await kernel.commands.optOut();
		expect(res).toMatchObject({ changed: true, ok: true });
		expect(kernel.getSnapshot().optOut?.heldBy).toBe('both');
		expect(optOutCalls).toHaveLength(1);
		kernel.dispose();
	});

	test('GPC: sync alone sends nothing; device GPC reports once with account opt-out present', async () => {
		const resolution = matchedResolution(
			optOutRule({
				privacySignals: {
					gpc: { denyCategories: ['marketing', 'measurement'] },
				},
			})
		);
		const optOutCalls: OptOutPayload[] = [];
		const transport: KernelTransport = {
			optOut: (payload) => {
				optOutCalls.push(payload);
				return Promise.resolve({
					ok: true,
					optOut: {
						heldBy: 'both',
						method: 'gpc',
						recordedAt: NOW,
						rights: ['sale', 'share', 'targeted_ads'],
					},
					subjectId: payload.subjectId,
				});
			},
		};

		// Without GPC: sync alone sends nothing.
		const noGpc = createKernel(
			{
				initialPolicyResolution: resolution,
				initialUser: { externalId: 'user_a' },
				now: NOW,
				transport,
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		noGpc.markLive(NOW);
		noGpc.syncUserConsent(
			makeUserConsent({
				checkedAt: NOW,
				externalId: 'user_a',
				optOut: {
					method: 'gpc',
					recordedAt: NOW - 5000,
					rights: ['sale', 'share'],
				},
			})
		);
		await flushMacrotasks();
		expect(optOutCalls).toHaveLength(0);
		noGpc.dispose();

		// With device GPC active + account opt-out present: reports once!
		const withGpc = createKernel(
			{
				initialPolicyResolution: resolution,
				initialPrivacySignals: { gpc: true },
				initialUser: { externalId: 'user_a' },
				now: NOW,
				transport,
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		withGpc.syncUserConsent(
			makeUserConsent({
				checkedAt: NOW,
				externalId: 'user_a',
				optOut: {
					method: 'button',
					recordedAt: NOW - 5000,
					rights: ['sale', 'share'],
				},
			})
		);
		withGpc.markLive(NOW);
		await flushMacrotasks();
		expect(optOutCalls).toHaveLength(1);
		expect(optOutCalls[0]?.method).toBe('gpc');
		expect(withGpc.getSnapshot().optOut?.heldBy).toBe('both');

		// A second commit does not re-send GPC.
		withGpc.refresh(NOW + 1000);
		await flushMacrotasks();
		expect(optOutCalls).toHaveLength(1);
		withGpc.dispose();
	});

	test('lift on a provisional subject links first, fails cleanly without a token, succeeds with limit_sensitive remaining, and fences stale /check', async () => {
		const resolution = matchedResolution(optOutRule());
		const events: string[] = [];
		const liftPayloads: LiftOptOutPayload[] = [];

		// 1. Without a token on a provisional subject: fails cleanly, sends nothing.
		const noToken = createKernel(
			{
				initialPolicyResolution: resolution,
				initialUser: { externalId: 'user_a' },
				now: NOW,
				transport: {
					identify: vi.fn(),
					liftOptOut: vi.fn(),
				},
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		noToken.markProvisionalSubject(SUBJECT_UUID);
		noToken.set.subjectId(SUBJECT_UUID);
		noToken.syncUserConsent(
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
		const noTokenResult = await noToken.commands.optIn();
		expect(noTokenResult).toEqual({ ok: false, reason: 'held-by-account' });
		noToken.dispose();

		// 2. With a token on a provisional subject: links first, sends supported rights, succeeds when only limit_sensitive remains.
		const withToken = createKernel(
			{
				initialPolicyResolution: resolution,
				initialUser: { externalId: 'user_a', identityToken: 'tok_a' },
				now: NOW,
				transport: {
					identify: (_user, subjectId) => {
						events.push(`link:${subjectId}`);
						return Promise.resolve({ subjectId: subjectId ?? SUBJECT_UUID });
					},
					liftOptOut: (payload) => {
						events.push(`lift:${payload.subjectId}`);
						liftPayloads.push(payload);
						return Promise.resolve({
							ok: true,
							// Remaining record only holds unsupported limit_sensitive.
							optOut: {
								heldBy: 'person',
								method: 'button',
								recordedAt: NOW - 1000,
								rights: [
									'limit_sensitive',
								] as unknown as OptOutRecord['rights'],
							},
							subjectId: payload.subjectId,
						});
					},
				},
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		withToken.set.subjectId(SUBJECT_UUID);
		withToken.markProvisionalSubject(SUBJECT_UUID);
		withToken.syncUserConsent(
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
		const syncGenBeforeLift = withToken.getAccountSyncGeneration();
		const liftResult = await withToken.commands.optIn();
		expect(liftResult).toEqual({ ok: true, optOut: null });
		expect(events).toEqual([`link:${SUBJECT_UUID}`, `lift:${SUBJECT_UUID}`]);
		expect(liftPayloads[0]?.rights).toEqual(['sale', 'share']);
		expect(withToken.getSnapshot().optOut).toBeNull();
		expect(withToken.getAccountLayer()?.optOut).toBeNull();
		expect(withToken.getAccountSyncGeneration()).toBeGreaterThan(
			syncGenBeforeLift
		);

		// A stale /check fetched before the lift (older checkedAt) cannot restore it.
		withToken.syncUserConsent(
			makeUserConsent({
				checkedAt: NOW - 500,
				externalId: 'user_a',
				optOut: {
					method: 'button',
					recordedAt: NOW - 1000,
					rights: ['sale', 'share'],
				},
			})
		);
		expect(withToken.getSnapshot().optOut).toBeNull();
		withToken.dispose();
	});

	test('v1 transport liftOptOut treats a limit_sensitive-only remaining record as lifted (null)', async () => {
		const fetchMock = vi.fn<typeof fetch>(() =>
			Promise.resolve(
				new Response(
					JSON.stringify({
						optOut: {
							heldBy: 'person',
							method: 'button',
							recordedAt: NOW,
							rights: ['limit_sensitive'],
						},
						recordId: RECORD_UUID,
						subjectId: SUBJECT_UUID,
					}),
					{ headers: { 'content-type': 'application/json' }, status: 200 }
				)
			)
		);
		const transport = createV1RecordTransport({
			fetch: fetchMock,
			projectUrl: 'https://proj.inth.app',
			property: 'app.example.com',
		});
		const res = await transport.liftOptOut({
			givenAt: NOW,
			idempotencyKey: RECORD_UUID,
			rights: ['sale', 'share', 'targeted_ads'],
			subjectId: SUBJECT_UUID,
			user: { externalId: 'user_a', identityToken: 'tok_a' },
		});
		expect(res.ok).toBe(true);
		expect(res.optOut).toBeNull();
		const sentBody = JSON.parse(
			String(fetchMock.mock.calls[0]?.[1]?.body)
		) as Record<string, unknown>;
		expect(sentBody.rights).toEqual(['sale', 'share', 'targeted_ads']);
	});

	test("save('all') lift clears the account opt-out", async () => {
		const resolution = matchedResolution(optOutRule());
		const liftPayloads: LiftOptOutPayload[] = [];
		const kernel = createKernel(
			{
				consentCategories: [
					'functionality',
					'experience',
					'measurement',
					'marketing',
				],
				initialPolicyResolution: resolution,
				initialUser: { externalId: 'user_a', identityToken: 'tok_a' },
				now: NOW,
				transport: {
					identify: (_u, subjectId) =>
						Promise.resolve({ subjectId: subjectId ?? SUBJECT_UUID }),
					liftOptOut: (payload) => {
						liftPayloads.push(payload);
						return Promise.resolve({
							ok: true,
							optOut: null,
							subjectId: payload.subjectId,
						});
					},
					save: (payload) =>
						Promise.resolve({ ok: true, subjectId: payload.subjectId }),
				},
			},
			{ outboxStore: createMemoryOutboxStore() }
		);

		kernel.syncUserConsent(
			makeUserConsent({
				checkedAt: NOW,
				externalId: 'user_a',
				optOut: {
					method: 'button',
					recordedAt: NOW - 1000,
					rights: ['sale', 'share', 'targeted_ads'],
				},
			})
		);
		expect(kernel.getSnapshot().optOut?.heldBy).toBe('person');

		const saved = await kernel.commands.save('all');
		expect(saved.ok).toBe(true);
		expect(saved.confirmed).toContain('marketing');
		await vi.waitFor(() => expect(liftPayloads).toHaveLength(1));
		await vi.waitFor(() => expect(kernel.getSnapshot().optOut).toBeNull());
		expect(kernel.getAccountLayer()?.optOut).toBeNull();
		expect(liftPayloads[0]?.rights).toEqual(['sale', 'share', 'targeted_ads']);
		kernel.dispose();
	});
});

describe('identity isolation and fencing', () => {
	test('userConsent without user or mismatched externalId is ignored', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const resolution = matchedResolution(optInRule());
		const fp = resolution.fingerprints.choice;
		const kernel = createKernel({
			initialPolicyResolution: resolution,
			now: NOW,
		});

		const appliedNoUser = kernel.syncUserConsent(
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
		expect(appliedNoUser).toBe(false);
		expect(kernel.getAccountLayer()).toBeNull();
		expect(warn).toHaveBeenCalled();

		kernel.set.user({ externalId: 'user_b' });
		const appliedMismatch = kernel.syncUserConsent(
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
		expect(appliedMismatch).toBe(false);
		expect(kernel.getAccountLayer()).toBeNull();
		kernel.dispose();
	});

	test('A -> logout -> B and save answer started under A landing after B drops A while keeping browser choices', async () => {
		const resolution = matchedResolution(optOutRule());
		const fp = resolution.fingerprints.choice;
		const saveDeferred = Promise.withResolvers<{
			ok: boolean;
			optOut?: OptOutRecord;
			subjectId?: string;
		}>();

		let saveCount = 0;
		const kernel = createKernel(
			{
				initialPolicyResolution: resolution,
				initialUser: { externalId: 'user_a' },
				now: NOW,
				transport: {
					save: (payload) => {
						saveCount += 1;
						if (saveCount === 1) {
							return Promise.resolve({
								ok: true,
								subjectId: payload.subjectId,
							});
						}
						return saveDeferred.promise;
					},
				},
			},
			{ outboxStore: createMemoryOutboxStore() }
		);

		// Browser-made choice for measurement.
		await kernel.commands.save({ measurement: false });
		// Sync A's marketing denial + account opt-out.
		kernel.syncUserConsent(
			makeUserConsent({
				checkedAt: NOW,
				choices: {
					marketing: {
						basis: { fingerprint: fp, kind: 'choice-v1' },
						confirmedAt: NOW - 500,
						value: false,
					},
				},
				externalId: 'user_a',
				optOut: {
					method: 'button',
					recordedAt: NOW - 500,
					rights: ['sale', 'share'],
				},
			})
		);
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
		expect(kernel.getSnapshot().optOut?.heldBy).toBe('person');

		// Start a save under A (returns saveDeferred).
		const pendingSave = kernel.commands.save({ experience: true });
		await flushMacrotasks();

		// Switch directly to user B (or logout -> B): A's account layer drops synchronously, browser measurement stays!
		kernel.set.user(null);
		expect(kernel.getAccountLayer()).toBeNull();
		expect(kernel.getSnapshot().optOut).toBeNull();
		expect(
			kernel.getSnapshot().explicitChoice?.categories.measurement?.value
		).toBe(false);
		expect(
			kernel.getSnapshot().explicitChoice?.categories.marketing
		).toBeUndefined();

		kernel.set.user({ externalId: 'user_b' });

		// Now the save answer started under A lands with A's account opt-out: MUST BE DROPPED!
		saveDeferred.resolve({
			ok: true,
			optOut: {
				heldBy: 'person',
				method: 'button',
				recordedAt: NOW,
				rights: ['sale', 'share'],
			},
			subjectId: kernel.getSnapshot().subject?.subjectId,
		});
		await pendingSave;

		expect(kernel.getSnapshot().optOut).toBeNull();
		expect(kernel.getAccountLayer()).toBeNull();
		expect(
			kernel.getSnapshot().explicitChoice?.categories.measurement?.value
		).toBe(false);
		kernel.dispose();
	});
});

describe('pending hold across script loader, network blocker, iframe blocker, clear-on-revocation, and open dialog', () => {
	test('under opt-out policy with userConsentPending: no script runs, network requests hold, iframes stay paused, clear-on-revocation waits, and late sync keeps dialog open', async () => {
		const resolution = matchedResolution(optOutRule());
		const fp = resolution.fingerprints.choice;
		const loadedScripts: string[] = [];

		// Seed a first-party cookie that clear-on-revocation would delete if it ran while pending.
		document.cookie = 'analytics_id=keepme; path=/';

		// Seed a gated iframe in the DOM.
		const iframe = document.createElement('iframe');
		iframe.setAttribute('data-category', 'marketing');
		iframe.setAttribute('data-src', 'https://ads.example.test/frame');
		document.body.appendChild(iframe);

		// Stub underlying fetch before attaching network blocker.
		const fetchCalls: string[] = [];
		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
			fetchCalls.push(String(input));
			return Promise.resolve(new Response('ok', { status: 200 }));
		}) as unknown as typeof fetch;

		const kernel = createKernel({
			initialPolicyResolution: resolution,
			initialUser: { externalId: 'user_a' },
			initialUserConsentPending: true,
			now: NOW,
		});

		const scripts = createScriptLoader({
			kernel,
			scripts: [
				{
					callbackOnly: true,
					category: 'marketing',
					id: 'ads-script',
					onLoad: () => {
						loadedScripts.push('ads-script');
					},
				},
			],
		});
		const blocker = createNetworkBlocker({
			kernel,
			logBlockedRequests: false,
			rules: [
				{
					category: 'marketing',
					domain: 'ads.example.test',
					id: 'ads-rule',
				},
			],
		});
		const iframes = createIframeBlocker({ kernel });
		const revocation = createClearOnRevocation({
			config: {
				marketing: {
					cookies: [{ name: 'analytics_id' }],
				},
			},
			kernel,
		});

		try {
			// While userConsentPending is true (even under opt-out policy!):
			expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
			expect(loadedScripts).toEqual([]);
			expect(iframe.getAttribute('src')).toBeNull();
			// clear-on-revocation MUST NOT delete the cookie while pending.
			expect(document.cookie).toContain('analytics_id=keepme');

			// A request to ads.example.test MUST HOLD instead of passing or 451'ing immediately.
			let resolvedResponse: Response | null = null;
			const heldRequest = window
				.fetch('https://ads.example.test/pixel')
				.then((res) => {
					resolvedResponse = res;
					return res;
				});
			await flushMacrotasks();
			expect(fetchCalls).toEqual([]);
			expect(resolvedResponse).toBeNull();

			// Open dialog before sync settles: a late sync must keep an open dialog open.
			kernel.set.activeUI('dialog');
			expect(kernel.getSnapshot().activeUI).toBe('dialog');

			// Settle userConsent with marketing granted (opt-out policy allows it).
			kernel.syncUserConsent(
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
			kernel.setUserConsentPending(false);

			const response = await heldRequest;
			expect(response.status).toBe(200);
			expect(fetchCalls).toEqual(['https://ads.example.test/pixel']);
			expect(loadedScripts).toEqual(['ads-script']);
			expect(iframe.getAttribute('src')).toBe('https://ads.example.test/frame');
			expect(document.cookie).toContain('analytics_id=keepme');
			// Dialog stayed open!
			expect(kernel.getSnapshot().activeUI).toBe('dialog');
		} finally {
			revocation.dispose();
			iframes.dispose();
			blocker.dispose();
			scripts.dispose();
			iframe.remove();
			globalThis.fetch = originalFetch;
			kernel.dispose();
		}
	});
});

describe('kernel regressions (set 1)', () => {
	test('account lift on an unlinked real subject requires token and links first, failing cleanly without token or on failed link', async () => {
		const resolution = matchedResolution(optOutRule());
		const fp = resolution.fingerprints.choice;
		const liftOptOut = vi.fn(() =>
			Promise.resolve({ ok: true, optOut: null, subjectId: SUBJECT_UUID })
		);

		// Case 1: unlinked real subject WITHOUT identityToken -> must NOT call liftOptOut or clear account opt-out.
		const noToken = createKernel(
			{
				consentCategories: ['marketing', 'measurement'],
				initialPolicyResolution: resolution,
				initialRecords: {
					choice: {
						categories: {
							measurement: {
								basis: { fingerprint: fp, kind: 'choice-v1' },
								confirmedAt: NOW - 5000,
								value: true,
							},
						},
						version: 3,
					},
					now: NOW,
					subject: { subjectId: SUBJECT_UUID },
				},
				initialUser: { externalId: 'user_a' },
				now: NOW,
				transport: {
					identify: vi.fn(),
					liftOptOut,
				},
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		noToken.syncUserConsent(
			makeUserConsent({
				checkedAt: NOW,
				externalId: 'user_a',
				optOut: {
					method: 'button',
					recordedAt: NOW - 2000,
					rights: ['sale', 'share'],
				},
			})
		);
		const resNoToken = await noToken.commands.optIn();
		expect(resNoToken).toEqual({ ok: false, reason: 'held-by-account' });
		expect(liftOptOut).not.toHaveBeenCalled();
		expect(noToken.getAccountLayer()?.optOut).not.toBeNull();
		noToken.dispose();

		// Case 2: unlinked real subject WITH token, but link fails -> must NOT call liftOptOut or clear account opt-out.
		const failingLink = vi.fn(() => Promise.reject(new Error('link failed')));
		const failedLinkKernel = createKernel(
			{
				consentCategories: ['marketing', 'measurement'],
				initialPolicyResolution: resolution,
				initialRecords: {
					now: NOW,
					subject: { subjectId: SUBJECT_UUID },
				},
				initialUser: { externalId: 'user_a', identityToken: 'tok_a' },
				now: NOW,
				transport: {
					identify: failingLink,
					liftOptOut,
				},
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		failedLinkKernel.syncUserConsent(
			makeUserConsent({
				checkedAt: NOW,
				externalId: 'user_a',
				optOut: {
					method: 'button',
					recordedAt: NOW - 2000,
					rights: ['sale', 'share'],
				},
			})
		);
		const resFailLink = await failedLinkKernel.commands.optIn();
		expect(resFailLink).toEqual({ ok: false, reason: 'held-by-account' });
		expect(failingLink).toHaveBeenCalledTimes(1);
		expect(liftOptOut).not.toHaveBeenCalled();
		expect(failedLinkKernel.getAccountLayer()?.optOut).not.toBeNull();
		failedLinkKernel.dispose();
	});

	test('re-passing an equal copy of the pre-lift document does not restore the lifted opt-out', async () => {
		const resolution = matchedResolution(optOutRule());
		const preLiftDoc = makeUserConsent({
			checkedAt: NOW,
			externalId: 'user_a',
			optOut: {
				method: 'button',
				recordedAt: NOW - 1000,
				rights: ['sale', 'share'],
			},
		});
		const kernel = createKernel(
			{
				initialPolicyResolution: resolution,
				initialUser: { externalId: 'user_a', identityToken: 'tok_a' },
				now: NOW,
				transport: {
					identify: (_u, subjectId) =>
						Promise.resolve({ subjectId: subjectId ?? SUBJECT_UUID }),
					liftOptOut: (payload) =>
						Promise.resolve({
							ok: true,
							optOut: null,
							subjectId: payload.subjectId,
						}),
				},
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		kernel.syncUserConsent(preLiftDoc);
		expect(kernel.getSnapshot().optOut?.heldBy).toBe('person');

		const lifted = await kernel.commands.optIn();
		expect(lifted).toEqual({ ok: true, optOut: null });
		expect(kernel.getSnapshot().optOut).toBeNull();

		// Re-pass a fresh equal copy of the pre-lift document (same checkedAt = NOW).
		const reapplied = kernel.syncUserConsent(structuredClone(preLiftDoc));
		expect(reapplied).toBe(false);
		expect(kernel.getSnapshot().optOut).toBeNull();
		expect(kernel.getAccountLayer()?.optOut).toBeNull();
		kernel.dispose();
	});

	test('server opt-out answers with heldBy person/both never write to browser records or move appliedAt, and legacy browser person optOut is ignored and removed', async () => {
		const resolution = matchedResolution(optOutRule());
		const kernel = createKernel(
			{
				initialPolicyResolution: resolution,
				initialRecords: {
					now: NOW,
					optOut: {
						heldBy: 'device',
						method: 'button',
						recordedAt: NOW - 2000,
						rights: ['targeted_ads'],
					},
					subject: { subjectId: SUBJECT_UUID },
				},
				initialUser: { externalId: 'user_a', identityToken: 'tok_a' },
				now: NOW,
				transport: {
					identify: () =>
						Promise.resolve({
							optOut: {
								heldBy: 'both',
								method: 'button',
								recordedAt: NOW + 5000,
								rights: ['sale', 'targeted_ads'],
							},
							subjectId: SUBJECT_UUID,
						}),
				},
			},
			{ outboxStore: createMemoryOutboxStore() }
		);

		kernel.syncUserConsent(
			makeUserConsent({
				checkedAt: NOW,
				externalId: 'user_a',
				optOut: {
					method: 'button',
					recordedAt: NOW - 3000,
					rights: ['sale'],
				},
			})
		);
		const appliedBefore = kernel.getAccountLayer()?.appliedAt;

		// Advance clock and receive a `both` answer from identify.
		vi.spyOn(Date, 'now').mockReturnValue(NOW + 10_000);
		await kernel.commands.identify({
			externalId: 'user_a',
			identityToken: 'tok_a',
		});

		// appliedAt must NOT move on identify answer (#8).
		expect(kernel.getAccountLayer()?.appliedAt).toBe(appliedBefore);
		// Browser records keep ONLY its own `targeted_ads` device opt-out, never `sale` from `both` (#9).
		expect(kernel.getBrowserRecords().optOut?.rights).toEqual(['targeted_ads']);

		// After logout -> switch to B, browser records still hold ONLY `targeted_ads`.
		kernel.set.user(null);
		kernel.set.user({ externalId: 'user_b' });
		expect(kernel.getBrowserRecords().optOut?.rights).toEqual(['targeted_ads']);
		expect(kernel.getSnapshot().optOut?.rights).toEqual(['targeted_ads']);
		kernel.dispose();

		// Legacy browser `heldBy: 'person'` record stored before this feature:
		// ignored while account layer is active with `sync.optOut: null`, and removed when account layer drops!
		const legacyKernel = createKernel({
			initialPolicyResolution: resolution,
			initialRecords: {
				now: NOW,
				optOut: {
					heldBy: 'person',
					method: 'propagated',
					recordedAt: NOW - 5000,
					rights: ['sale', 'share'],
				},
				subject: { subjectId: SUBJECT_UUID },
			},
			initialUser: { externalId: 'user_a' },
			now: NOW,
		});
		legacyKernel.syncUserConsent(
			makeUserConsent({
				checkedAt: NOW,
				externalId: 'user_a',
				optOut: null,
			})
		);
		expect(legacyKernel.getSnapshot().optOut).toBeNull();

		// Dropping account layer removes the stale browser `heldBy: 'person'` record.
		legacyKernel.set.user(null);
		expect(legacyKernel.getBrowserRecords().optOut).toBeNull();
		expect(legacyKernel.getSnapshot().optOut).toBeNull();
		legacyKernel.dispose();
	});

	test('browser vendor save on manifest without X does not override account denial of X when X is later declared', async () => {
		const resolution = matchedResolution(optInRule());
		const fp = resolution.fingerprints.choice;

		// Domain B starts with ONLY vendor Y declared (not X), and saves Y BEFORE syncing account layer.
		const kernel = createKernel(
			{
				consentCategories: ['marketing', 'measurement'],
				initialPolicyResolution: resolution,
				initialUser: { externalId: 'user_a' },
				initialVendors: {
					declared: [
						{
							category: 'measurement',
							id: 'vendor-y',
							presentable: true,
							source: 'config',
						},
					],
					listVersion: 'v1',
				},
				now: NOW,
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		const persistence = createPersistence({ kernel });

		// Domain B saves Y at NOW + 1000 while X is NOT declared on domain B.
		vi.spyOn(Date, 'now').mockReturnValue(NOW + 1000);
		await kernel.commands.save({ vendors: { 'vendor-y': false } });

		// Account denies X earlier (at NOW - 5000) on domain A; sync arrives on domain B.
		kernel.syncUserConsent(
			makeUserConsent({
				checkedAt: NOW + 1000,
				choices: {
					marketing: {
						basis: { fingerprint: fp, kind: 'choice-v1' },
						confirmedAt: NOW - 5000,
						value: true,
					},
					measurement: {
						basis: { fingerprint: fp, kind: 'choice-v1' },
						confirmedAt: NOW - 5000,
						value: true,
					},
				},
				externalId: 'user_a',
				vendors: {
					'vendor-x': { confirmedAt: NOW - 5000, value: false },
				},
			})
		);
		await flushMacrotasks();
		persistence.dispose();
		kernel.dispose();

		// Domain B later declares BOTH X and Y and reloads: X MUST stay denied!
		vi.spyOn(Date, 'now').mockReturnValue(NOW + 2000);
		const reloaded = createKernel(
			{
				consentCategories: ['marketing', 'measurement'],
				initialPolicyResolution: resolution,
				initialUser: { externalId: 'user_a' },
				initialVendors: {
					declared: [
						{
							category: 'marketing',
							id: 'vendor-x',
							presentable: true,
							source: 'config',
						},
						{
							category: 'measurement',
							id: 'vendor-y',
							presentable: true,
							source: 'config',
						},
					],
					listVersion: 'v2',
				},
				now: NOW + 2000,
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		const p2 = createPersistence({ kernel: reloaded });
		expect(reloaded.getSnapshot().vendorChoice?.denied).toContain('vendor-x');
		expect(reloaded.getSnapshot().vendorChoice?.denied).toContain('vendor-y');
		p2.dispose();
		reloaded.dispose();
	});

	test('failed vendor save stays queued for retry when a sync or logout happens while in flight', async () => {
		const resolution = matchedResolution(optInRule());
		const store = createMemoryOutboxStore();
		const saveDeferred = Promise.withResolvers<{ ok: boolean }>();
		const kernel = createKernel(
			{
				consentCategories: ['marketing'],
				initialPolicyResolution: resolution,
				initialUser: { externalId: 'user_a' },
				initialVendors: {
					declared: [
						{
							category: 'marketing',
							id: 'meta-pixel',
							presentable: true,
							source: 'config',
						},
						{
							category: 'marketing',
							id: 'other-pixel',
							presentable: true,
							source: 'config',
						},
					],
					listVersion: 'v1',
				},
				now: NOW,
				transport: {
					save: () => saveDeferred.promise,
				},
			},
			{ outboxStore: store }
		);

		const pendingSave = kernel.commands.save({
			vendors: { 'meta-pixel': false },
		});
		await flushMacrotasks();

		// While save is in flight, sync an account vendor denial AND then log out.
		kernel.syncUserConsent(
			makeUserConsent({
				checkedAt: NOW,
				externalId: 'user_a',
				vendors: {
					'other-pixel': { confirmedAt: NOW - 1000, value: false },
				},
			})
		);
		kernel.set.user(null);

		// In-flight save fails: must remain queued in the outbox for retry!
		saveDeferred.reject(new Error('offline'));
		const result = await pendingSave;
		expect(result.ok).toBe(false);
		const queued = await store.transact(
			(tx) => (tx.read('saves') as unknown[] | undefined) ?? []
		);
		expect(queued).toHaveLength(1);
		kernel.dispose();
	});

	test('signed-out syncUserConsent(null) clears leftover account storage for a previous user', async () => {
		const resolution = matchedResolution(optInRule());
		const first = createKernel({
			initialPolicyResolution: resolution,
			initialUser: { externalId: 'user_a' },
			now: NOW,
		});
		const p1 = createPersistence({ kernel: first });
		first.syncUserConsent(
			makeUserConsent({ checkedAt: NOW, externalId: 'user_a' })
		);
		await flushMacrotasks();
		expect(window.localStorage.getItem('inth-acct')).not.toBeNull();
		p1.dispose();
		first.dispose();

		// Cold signed-out page load (no user) calls syncUserConsent(null): must wipe A's storage!
		const anon = createKernel({
			initialPolicyResolution: resolution,
			now: NOW + 1000,
		});
		const p2 = createPersistence({ kernel: anon });
		anon.syncUserConsent(null);
		expect(window.localStorage.getItem('inth-acct')).toBeNull();
		expect(document.cookie).not.toContain('inth-acct-c=');
		p2.dispose();
		anon.dispose();
	});

	test('SSR keeps newer account cookie over older initialUserConsent and falls back on malformed initialUserConsent', () => {
		const resolution = matchedResolution(optInRule());
		const fp = resolution.fingerprints.choice;
		const newerCookieLayer = {
			appliedAt: NOW,
			checkedAt: NOW + 5000,
			choices: {
				marketing: {
					basis: { fingerprint: fp, kind: 'choice-v1' as const },
					rawConfirmedAt: NOW + 4000,
					value: false,
				},
			},
			externalId: 'user_a',
			optOut: null,
			skew: 0,
			vendors: {},
		};
		const olderServerDoc = makeUserConsent({
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

		const kNewer = createKernel({
			initialPolicyResolution: resolution,
			initialRecords: { accountLayer: newerCookieLayer, now: NOW },
			initialUser: { externalId: 'user_a' },
			initialUserConsent: olderServerDoc,
			now: NOW,
		});
		expect(kNewer.getAccountLayer()?.checkedAt).toBe(NOW + 5000);
		expect(kNewer.getSnapshot().effectivePermissions.marketing).toBe(false);
		kNewer.dispose();

		const kMalformed = createKernel({
			initialPolicyResolution: resolution,
			initialRecords: { accountLayer: newerCookieLayer, now: NOW },
			initialUser: { externalId: 'user_a' },
			initialUserConsent: { bad: true } as unknown as UserConsent,
			now: NOW,
		});
		expect(kMalformed.getAccountLayer()?.checkedAt).toBe(NOW + 5000);
		expect(kMalformed.getSnapshot().effectivePermissions.marketing).toBe(false);
		kMalformed.dispose();
	});
});

describe('kernel regressions (set 2)', () => {
	test('after opt-out lift, reloading with cached pre-lift initialUserConsent stays lifted on SSR, client, and storage', async () => {
		const resolution = matchedResolution(optOutRule({ prompt: 'none' }));
		const preLiftDoc = makeUserConsent({
			checkedAt: NOW,
			externalId: 'user_a',
			optOut: {
				method: 'button',
				recordedAt: NOW - 5000,
				rights: ['sale', 'share'],
			},
		});

		const k1 = createKernel(
			{
				consentCategories: ['marketing'],
				initialPolicyResolution: resolution,
				initialUser: { externalId: 'user_a', identityToken: 'tok_a' },
				now: NOW,
				transport: {
					identify: (_u, subjectId) =>
						Promise.resolve({ subjectId: subjectId ?? 'sub_a' }),
					liftOptOut: () => Promise.resolve({ ok: true, optOut: null }),
				},
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		const p1 = createPersistence({ kernel: k1 });
		k1.syncUserConsent(preLiftDoc);
		expect(k1.getSnapshot().optOut?.heldBy).toBe('person');

		vi.spyOn(Date, 'now').mockReturnValue(NOW + 2000);
		const lifted = await k1.commands.optIn();
		expect(lifted).toEqual({ ok: true, optOut: null });
		expect(k1.getAccountLayer()?.liftedRecordedAt).toBe(NOW - 5000);
		await flushMacrotasks();
		p1.dispose();
		k1.dispose();

		// Reload SSR: server reads stored lifted cookies AND passes cached pre-lift `initialUserConsent`!
		const ssrStored = readStoredRecordsFromCookieHeader(
			document.cookie,
			undefined,
			NOW + 3000
		);
		const ssrKernel = createKernel({
			consentCategories: ['marketing'],
			initialPolicyResolution: resolution,
			initialRecords: ssrStored,
			initialUser: { externalId: 'user_a' },
			initialUserConsent: structuredClone(preLiftDoc),
			now: NOW + 3000,
		});
		expect(ssrKernel.getSnapshot().optOut).toBeNull();
		expect(ssrKernel.getAccountLayer()?.optOut).toBeNull();
		expect(ssrKernel.getAccountLayer()?.liftedRecordedAt).toBe(NOW - 5000);

		// Client mounts persistence with skipHydration over the SSR kernel and re-syncs cached doc.
		const p2 = createPersistence({ kernel: ssrKernel, skipHydration: true });
		ssrKernel.syncUserConsent(structuredClone(preLiftDoc));
		await flushMacrotasks();
		expect(ssrKernel.getSnapshot().optOut).toBeNull();
		expect(ssrKernel.getAccountLayer()?.optOut).toBeNull();
		expect(readStoredAccountLayer(undefined)?.optOut).toBeNull();
		p2.dispose();
		ssrKernel.dispose();
	});

	test('legacy heldBy person browser opt-out is deleted from storage when dropped on logout', async () => {
		const resolution = matchedResolution(optOutRule({ prompt: 'none' }));

		// Seed a legacy `heldBy: 'person'` browser opt-out record into storage.
		window.localStorage.setItem(
			'inth-opt-out',
			JSON.stringify({
				heldBy: 'person',
				method: 'button',
				recordedAt: NOW - 5000,
				rights: ['sale', 'share'],
				version: 1,
			})
		);
		document.cookie = `inth-opt-out=v=1&t=${NOW - 5000}&r=sa|sh&m=b&h=p; path=/`;

		// User A signs in, syncs account doc with optOut: null (effective optOut is now null), then logs out.
		const kA = createKernel(
			{
				consentCategories: ['marketing'],
				initialPolicyResolution: resolution,
				initialUser: { externalId: 'user_a' },
				now: NOW,
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		const pA = createPersistence({ kernel: kA });
		expect(kA.getBrowserRecords().optOut?.heldBy).toBe('person');
		kA.syncUserConsent(
			makeUserConsent({ checkedAt: NOW, externalId: 'user_a', optOut: null })
		);
		expect(kA.getSnapshot().optOut).toBeNull();

		// Logout drops account layer and removes the legacy browser person opt-out — must also delete from storage!
		kA.set.user(null);
		await flushMacrotasks();
		pA.dispose();
		kA.dispose();

		// Reload signed out: must NOT be opted out!
		const anon = createKernel({
			consentCategories: ['marketing'],
			initialPolicyResolution: resolution,
			now: NOW + 1000,
		});
		const pAnon = createPersistence({ kernel: anon });
		expect(anon.getSnapshot().optOut).toBeNull();
		expect(anon.getSnapshot().effectivePermissions.marketing).toBe(true);
		pAnon.dispose();
		anon.dispose();
	});

	test('save vendor map never emits a grant for an undeclared vendor or an account-denied vendor never decided on this site', async () => {
		const resolution = matchedResolution(optInRule());
		const fp = resolution.fingerprints.choice;
		const savedPayloads: SavePayload[] = [];

		// Domain B declares ONLY vendor-y initially.
		const kernel = createKernel(
			{
				consentCategories: ['marketing', 'measurement'],
				initialPolicyResolution: resolution,
				initialUser: { externalId: 'user_a' },
				initialVendors: {
					declared: [
						{
							category: 'measurement',
							id: 'vendor-y',
							presentable: true,
							source: 'config',
						},
					],
					listVersion: 'v1',
				},
				now: NOW,
				transport: {
					save: (payload) => {
						savedPayloads.push(payload);
						return Promise.resolve({ ok: true, subjectId: 'sub_b' });
					},
				},
			},
			{ outboxStore: createMemoryOutboxStore() }
		);

		// Account A denied vendor-x.
		kernel.syncUserConsent(
			makeUserConsent({
				checkedAt: NOW,
				choices: {
					marketing: {
						basis: { fingerprint: fp, kind: 'choice-v1' },
						confirmedAt: NOW - 5000,
						value: true,
					},
					measurement: {
						basis: { fingerprint: fp, kind: 'choice-v1' },
						confirmedAt: NOW - 5000,
						value: true,
					},
				},
				externalId: 'user_a',
				vendors: {
					'vendor-x': { confirmedAt: NOW - 5000, value: false },
				},
			})
		);

		// Step 1: B saves vendor-y while vendor-x is NOT declared on B.
		vi.spyOn(Date, 'now').mockReturnValue(NOW + 1000);
		await kernel.commands.save({ vendors: { 'vendor-y': false } });
		expect(savedPayloads).toHaveLength(1);
		expect(savedPayloads[0]?.vendorChoice?.grants).not.toHaveProperty(
			'vendor-x'
		);
		expect(savedPayloads[0]?.vendorChoice?.grants).toEqual({
			'vendor-y': false,
		});

		// Step 2: Later, vendor-x is added to B's manifest, and visitor makes a category-only save.
		kernel.set.vendors({
			declared: [
				{
					category: 'marketing',
					id: 'vendor-x',
					presentable: true,
					source: 'config',
				},
				{
					category: 'measurement',
					id: 'vendor-y',
					presentable: true,
					source: 'config',
				},
			],
			listVersion: 'v2',
		});
		vi.spyOn(Date, 'now').mockReturnValue(NOW + 2000);
		await kernel.commands.save({ marketing: true });
		expect(savedPayloads).toHaveLength(2);
		// No `vendor-x: true` may be sent because the visitor never decided vendor-x on B!
		expect(savedPayloads[1]?.vendorChoice?.grants).not.toHaveProperty(
			'vendor-x'
		);
		kernel.dispose();
	});

	test('late lift response does not clear a newer account opt-out synced while the lift was in flight', async () => {
		const resolution = matchedResolution(optOutRule({ prompt: 'none' }));
		const liftDeferred = Promise.withResolvers<{
			ok: boolean;
			optOut: null;
		}>();

		const kernel = createKernel(
			{
				consentCategories: ['marketing'],
				initialPolicyResolution: resolution,
				initialRecords: { now: NOW, subject: { subjectId: 'sub_a' } },
				initialUser: { externalId: 'user_a', identityToken: 'tok_a' },
				now: NOW,
				transport: {
					identify: (_u, subjectId) =>
						Promise.resolve({ subjectId: subjectId ?? 'sub_a' }),
					liftOptOut: () => liftDeferred.promise,
				},
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		await kernel.commands.identify({
			externalId: 'user_a',
			identityToken: 'tok_a',
		});
		kernel.syncUserConsent(
			makeUserConsent({
				checkedAt: NOW,
				externalId: 'user_a',
				optOut: {
					method: 'button',
					recordedAt: NOW - 5000,
					rights: ['sale', 'share'],
				},
			})
		);

		// Start lifting the NOW opt-out; request hangs in flight.
		const liftPromise = kernel.commands.optIn();
		await Promise.resolve();

		// Meanwhile, a newer /check arrives with a newer opt-out at NOW + 5000.
		kernel.syncUserConsent(
			makeUserConsent({
				checkedAt: NOW + 5000,
				externalId: 'user_a',
				optOut: {
					method: 'button',
					recordedAt: NOW + 4000,
					rights: ['sale', 'share'],
				},
			})
		);

		// Now the stale lift resolves with `optOut: null` -> MUST NOT clear the newer opt-out!
		liftDeferred.resolve({ ok: true, optOut: null });
		const result = await liftPromise;
		expect(result).toEqual({ ok: false, reason: 'held-by-account' });
		expect(kernel.getAccountLayer()?.checkedAt).toBe(NOW + 5000);
		expect(kernel.getAccountLayer()?.optOut).not.toBeNull();
		expect(kernel.getSnapshot().optOut).not.toBeNull();
		kernel.dispose();
	});

	test('plain-value /check document fetched before a lift is rejected even if its checkedAt is newer than the pre-lift doc', async () => {
		const resolution = matchedResolution(optOutRule({ prompt: 'none' }));
		const kernel = createKernel(
			{
				consentCategories: ['marketing'],
				initialPolicyResolution: resolution,
				initialRecords: { now: NOW, subject: { subjectId: 'sub_a' } },
				initialUser: { externalId: 'user_a', identityToken: 'tok_a' },
				now: NOW,
				transport: {
					identify: (_u, subjectId) =>
						Promise.resolve({ subjectId: subjectId ?? 'sub_a' }),
					liftOptOut: () => Promise.resolve({ ok: true, optOut: null }),
				},
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		await kernel.commands.identify({
			externalId: 'user_a',
			identityToken: 'tok_a',
		});

		// Stored doc was checked at NOW - 5000.
		kernel.syncUserConsent(
			makeUserConsent({
				checkedAt: NOW - 5000,
				externalId: 'user_a',
				optOut: {
					method: 'button',
					recordedAt: NOW - 10_000,
					rights: ['sale', 'share'],
				},
			})
		);

		// Lift succeeds at NOW -> liftedAt = NOW.
		vi.spyOn(Date, 'now').mockReturnValue(NOW);
		const lifted = await kernel.commands.optIn();
		expect(lifted).toEqual({ ok: true, optOut: null });

		// A plain-value /check fetched BEFORE the lift (checkedAt = NOW - 1000, which is > NOW - 5000 but < liftedAt NOW) arrives now.
		vi.spyOn(Date, 'now').mockReturnValue(NOW + 500);
		const applied = kernel.syncUserConsent(
			makeUserConsent({
				checkedAt: NOW - 1000,
				externalId: 'user_a',
				optOut: {
					method: 'button',
					recordedAt: NOW - 10_000,
					rights: ['sale', 'share'],
				},
			})
		);
		expect(applied).toBe(false);
		expect(kernel.getAccountLayer()?.optOut).toBeNull();
		expect(kernel.getSnapshot().optOut).toBeNull();
		kernel.dispose();
	});

	test('a both answer covering the browser device opt-out confirms its receipt without copying account rights', async () => {
		const resolution = matchedResolution(optOutRule({ prompt: 'none' }));
		const kernel = createKernel(
			{
				consentCategories: ['marketing'],
				initialPolicyResolution: resolution,
				initialRecords: {
					now: NOW,
					optOut: {
						heldBy: 'device',
						method: 'button',
						recordedAt: NOW - 2000,
						rights: ['targeted_ads'],
					},
					optOutRightsConfirmed: false,
					subject: { subjectId: 'sub_device' },
				},
				initialUser: { externalId: 'user_a', identityToken: 'tok_a' },
				now: NOW,
				transport: {
					identify: () =>
						Promise.resolve({
							optOut: {
								heldBy: 'both',
								method: 'button',
								recordedAt: NOW - 1000,
								rights: ['sale', 'targeted_ads'],
							},
							subjectId: 'sub_device',
						}),
				},
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		kernel.syncUserConsent(
			makeUserConsent({
				checkedAt: NOW,
				externalId: 'user_a',
				optOut: {
					method: 'button',
					recordedAt: NOW - 3000,
					rights: ['sale'],
				},
			})
		);
		expect(kernel.getOptOutReceiptData().rightsConfirmed).toBe(false);

		await kernel.commands.identify({
			externalId: 'user_a',
			identityToken: 'tok_a',
		});

		// Receipt is now confirmed, while browser records STILL keep only `targeted_ads`!
		expect(kernel.getOptOutReceiptData().rightsConfirmed).toBe(true);
		expect(kernel.getBrowserRecords().optOut?.rights).toEqual(['targeted_ads']);
		kernel.dispose();
	});
});

describe('kernel regressions (set 3)', () => {
	test('lift floor uses server time so a fast browser clock still accepts a newer /check and a ahead server clock rejects a cached pre-lift doc', async () => {
		const resolution = matchedResolution(optOutRule({ prompt: 'none' }));
		const fp = resolution.fingerprints.choice;
		const TEN_MIN = 10 * 60 * 1000;
		const SIXTY_SEC = 60 * 1000;

		// Case A: browser clock is 10 min fast (`NOW + TEN_MIN`). Lift, then 10 s later server returns a fresh /check with new choices and a new opt-out.
		vi.spyOn(Date, 'now').mockReturnValue(NOW + TEN_MIN);
		const kFast = createKernel(
			{
				consentCategories: ['marketing'],
				initialPolicyResolution: resolution,
				initialRecords: { now: NOW + TEN_MIN, subject: { subjectId: 'sub_a' } },
				initialUser: { externalId: 'user_a', identityToken: 'tok_a' },
				now: NOW + TEN_MIN,
				transport: {
					identify: (_u, subjectId) =>
						Promise.resolve({ subjectId: subjectId ?? 'sub_a' }),
					liftOptOut: () => Promise.resolve({ ok: true, optOut: null }),
				},
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		await kFast.commands.identify({
			externalId: 'user_a',
			identityToken: 'tok_a',
		});
		kFast.syncUserConsent(
			makeUserConsent({
				checkedAt: NOW,
				externalId: 'user_a',
				optOut: {
					method: 'button',
					recordedAt: NOW - 5000,
					rights: ['sale', 'share'],
				},
			})
		);
		expect(await kFast.commands.optIn()).toEqual({ ok: true, optOut: null });

		// 10 s later in real/server time: fresh /check arrives with new choices and a new opt-out at NOW + 9_000.
		vi.spyOn(Date, 'now').mockReturnValue(NOW + TEN_MIN + 10_000);
		kFast.syncUserConsent(
			makeUserConsent({
				checkedAt: NOW + 10_000,
				choices: {
					marketing: {
						basis: { fingerprint: fp, kind: 'choice-v1' },
						confirmedAt: NOW + 8000,
						value: false,
					},
				},
				externalId: 'user_a',
				optOut: {
					method: 'button',
					recordedAt: NOW + 9000,
					rights: ['sale', 'share'],
				},
			})
		);
		expect(kFast.getAccountLayer()?.checkedAt).toBe(NOW + 10_000);
		expect(kFast.getAccountLayer()?.choices.marketing?.value).toBe(false);
		expect(kFast.getAccountLayer()?.optOut?.rawRecordedAt).toBe(NOW + 9000);
		expect(kFast.getSnapshot().optOut).not.toBeNull();
		kFast.dispose();

		// Case B: server clock is 60 s ahead (`NOW + SIXTY_SEC`). Lift, then a cached pre-lift doc (even with a newer checkedAt carrying the same lifted opt-out) arrives.
		vi.spyOn(Date, 'now').mockReturnValue(NOW);
		const kAhead = createKernel(
			{
				consentCategories: ['marketing'],
				initialPolicyResolution: resolution,
				initialRecords: { now: NOW, subject: { subjectId: 'sub_b' } },
				initialUser: { externalId: 'user_b', identityToken: 'tok_b' },
				now: NOW,
				transport: {
					identify: (_u, subjectId) =>
						Promise.resolve({ subjectId: subjectId ?? 'sub_b' }),
					liftOptOut: () => Promise.resolve({ ok: true, optOut: null }),
				},
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		await kAhead.commands.identify({
			externalId: 'user_b',
			identityToken: 'tok_b',
		});
		const preLiftDoc = makeUserConsent({
			checkedAt: NOW + SIXTY_SEC,
			externalId: 'user_b',
			optOut: {
				method: 'button',
				recordedAt: NOW + SIXTY_SEC - 5000,
				rights: ['sale', 'share'],
			},
		});
		kAhead.syncUserConsent(preLiftDoc);
		expect(await kAhead.commands.optIn()).toEqual({ ok: true, optOut: null });

		// Cached pre-lift doc (re-checked 2 s later before lift settled on backend, still carrying the lifted opt-out, plus a newer choice).
		vi.spyOn(Date, 'now').mockReturnValue(NOW + 1000);
		kAhead.syncUserConsent(
			makeUserConsent({
				checkedAt: NOW + SIXTY_SEC + 2000,
				choices: {
					marketing: {
						basis: { fingerprint: fp, kind: 'choice-v1' },
						confirmedAt: NOW + SIXTY_SEC - 1000,
						value: true,
					},
				},
				externalId: 'user_b',
				optOut: {
					method: 'button',
					recordedAt: NOW + SIXTY_SEC - 5000,
					rights: ['sale', 'share'],
				},
			})
		);
		// The lifted opt-out MUST NOT be restored, while the newer choice still adopts!
		expect(kAhead.getAccountLayer()?.optOut).toBeNull();
		expect(kAhead.getSnapshot().optOut).toBeNull();
		expect(kAhead.getAccountLayer()?.choices.marketing?.value).toBe(true);
		kAhead.dispose();
	});

	test('server snapshot isVendorAllowed for an account-denied vendor is false when browser vendorDeclared is unknown and matches client', () => {
		const resolution = matchedResolution(optOutRule({ prompt: 'none' }));
		const cookie = `inth-vendors=v=1&t=${NOW - 500}&d=vendor-y`;
		const vendors = {
			declared: [
				{
					category: 'marketing' as const,
					id: 'vendor-x',
					presentable: true,
					source: 'config' as const,
				},
				{
					category: 'measurement' as const,
					id: 'vendor-y',
					presentable: true,
					source: 'config' as const,
				},
			],
			listVersion: 'v2',
		};
		const ssrKernel = createKernel({
			consentCategories: ['marketing', 'measurement'],
			initialPolicyResolution: resolution,
			initialRecords: readStoredRecordsFromCookieHeader(cookie, undefined, NOW),
			initialUser: { externalId: 'user_a' },
			initialUserConsent: makeUserConsent({
				checkedAt: NOW,
				externalId: 'user_a',
				vendors: { 'vendor-x': { confirmedAt: NOW - 1000, value: false } },
			}),
			initialVendors: vendors,
			now: NOW,
		});
		expect(isVendorAllowed(ssrKernel.getServerSnapshot(), 'vendor-x')).toBe(
			false
		);
		expect(isVendorAllowed(ssrKernel.getSnapshot(), 'vendor-x')).toBe(false);
		expect(isVendorAllowed(ssrKernel.getSnapshot(), 'vendor-y')).toBe(false);
		ssrKernel.dispose();
	});

	test('a scoped marketing bulk save keeps an unrelated unseen account vendor denial account-only', async () => {
		const resolution = matchedResolution(optInRule());
		const save = vi.fn(() => Promise.resolve({ ok: true, subjectId: 'sub_a' }));
		const kernel = createKernel(
			{
				consentCategories: ['marketing', 'measurement'],
				initialPolicyResolution: resolution,
				initialUser: { externalId: 'user_a' },
				initialVendors: {
					declared: [
						{
							category: 'marketing',
							id: 'vendor-y',
							presentable: true,
							source: 'config',
						},
						{
							category: 'measurement',
							id: 'vendor-z',
							presentable: true,
							source: 'config',
						},
					],
					listVersion: 'v1',
				},
				now: NOW,
				transport: { save },
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		try {
			kernel.syncUserConsent(
				makeUserConsent({
					externalId: 'user_a',
					vendors: { 'vendor-x': { confirmedAt: NOW - 3000, value: false } },
				})
			);
			await kernel.commands.save('all', { categories: ['marketing'] });
			expect(save).toHaveBeenCalled();
			expect(kernel.getBrowserRecords().vendorChoice?.denied).not.toContain(
				'vendor-x'
			);
		} finally {
			kernel.dispose();
		}
	});

	test('with an account layer a full bulk save does not grant a previously denied vendor since removed from the manifest', async () => {
		const rule = optInRule();
		const save = vi.fn(
			(_payload: { vendorChoice?: { grants: Record<string, boolean> } }) =>
				Promise.resolve({
					ok: true,
					subjectId: 'sub_a',
				})
		);
		const kernel = createKernel(
			{
				consentCategories: ['marketing'],
				initialPolicyResolution: matchedResolution(rule),
				initialRecords: {
					now: NOW,
					vendorChoice: {
						confirmedAt: NOW - 1500,
						denied: ['vendor-x'],
						version: 1,
					},
					vendorDeclared: ['vendor-x'],
				},
				initialUser: { externalId: 'user_a' },
				initialVendors: {
					declared: [
						{
							category: 'marketing',
							id: 'vendor-y',
							presentable: true,
							source: 'config',
						},
					],
					listVersion: 'v2',
				},
				now: NOW,
				transport: { save },
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		try {
			kernel.syncUserConsent(
				makeUserConsent({
					externalId: 'user_a',
					vendors: { 'vendor-x': { confirmedAt: NOW - 1000, value: false } },
				})
			);
			await kernel.commands.save('all');
			expect(save).toHaveBeenCalled();
			expect(save.mock.calls[0]?.[0].vendorChoice?.grants).not.toHaveProperty(
				'vendor-x'
			);
		} finally {
			kernel.dispose();
		}
	});

	test('saving Y seeds X from its effective account grant', async () => {
		const save = vi.fn(
			(_payload: { vendorChoice?: { grants: Record<string, boolean> } }) =>
				Promise.resolve({
					ok: true,
					subjectId: 'sub_a',
				})
		);
		const kernel = createKernel(
			{
				consentCategories: ['marketing'],
				initialPolicyResolution: matchedResolution(optInRule()),
				initialRecords: {
					now: NOW,
					vendorChoice: {
						confirmedAt: NOW - 1500,
						denied: ['vendor-x'],
						version: 1,
					},
					vendorDeclared: ['vendor-x'],
				},
				initialUser: { externalId: 'user_a' },
				initialVendors: {
					declared: [
						{
							category: 'marketing',
							id: 'vendor-x',
							presentable: true,
							source: 'config',
						},
						{
							category: 'marketing',
							id: 'vendor-y',
							presentable: true,
							source: 'config',
						},
					],
					listVersion: 'v2',
				},
				now: NOW,
				transport: { save },
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		try {
			kernel.syncUserConsent(
				makeUserConsent({
					externalId: 'user_a',
					vendors: { 'vendor-x': { confirmedAt: NOW - 1000, value: true } },
				})
			);
			expect(kernel.getSnapshot().vendorChoice?.denied).not.toContain(
				'vendor-x'
			);
			await kernel.commands.save({ vendors: { 'vendor-y': false } });
			expect(save.mock.calls[0]?.[0].vendorChoice?.grants['vendor-x']).not.toBe(
				false
			);
			expect(kernel.getSnapshot().vendorChoice?.denied).not.toContain(
				'vendor-x'
			);
		} finally {
			kernel.dispose();
		}
	});

	test('a pending account-lift link cannot restore the subject link after a clear', async () => {
		const resolution = matchedResolution(optOutRule({ prompt: 'none' }));
		const link = Promise.withResolvers<{ subjectId: string }>();
		const identify = vi.fn(() => link.promise);
		const lift = vi.fn(() => Promise.resolve({ ok: true, optOut: null }));
		const kernel = createKernel({
			initialPolicyResolution: resolution,
			initialRecords: { now: NOW, subject: { subjectId: 'sub_a' } },
			initialUser: { externalId: 'user_a', identityToken: 'tok_a' },
			now: NOW,
			transport: { identify, liftOptOut: lift },
		});
		try {
			kernel.syncUserConsent(
				makeUserConsent({
					externalId: 'user_a',
					optOut: {
						method: 'button',
						recordedAt: NOW - 3000,
						rights: ['sale'],
					},
				})
			);
			const p = kernel.commands.optIn();
			expect(identify).toHaveBeenCalled();
			clearKernelRecords(kernel);
			link.resolve({ subjectId: 'sub_canonical' });
			expect(await p).toEqual({ ok: false, reason: 'held-by-account' });
			expect(lift).not.toHaveBeenCalled();
			expect(kernel.getSnapshot().subject).toEqual({ subjectId: 'sub_a' });
		} finally {
			kernel.dispose();
		}
	});

	test('save-triggered lift captures lift basis before outbox.send and keeps remaining supported rights on partial lift', async () => {
		const resolution = matchedResolution(optOutRule({ prompt: 'choice' }));

		// Case A: account opt-out syncs with a newer opt-out WHILE outbox.send() is in flight -> save-triggered lift must NOT clear the newer opt-out!
		const saveDeferred = Promise.withResolvers<{
			ok: boolean;
			subjectId: string;
		}>();
		const liftOptOutA = vi.fn(() =>
			Promise.resolve({ ok: true, optOut: null })
		);
		const kA = createKernel(
			{
				consentCategories: ['marketing'],
				initialPolicyResolution: resolution,
				initialRecords: { now: NOW, subject: { subjectId: 'sub_a' } },
				initialUser: { externalId: 'user_a', identityToken: 'tok_a' },
				now: NOW,
				transport: {
					identify: (_u, subjectId) =>
						Promise.resolve({ subjectId: subjectId ?? 'sub_a' }),
					liftOptOut: liftOptOutA,
					save: () => saveDeferred.promise,
				},
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		await kA.commands.identify({
			externalId: 'user_a',
			identityToken: 'tok_a',
		});
		kA.syncUserConsent(
			makeUserConsent({
				checkedAt: NOW,
				externalId: 'user_a',
				optOut: {
					method: 'button',
					recordedAt: NOW - 5000,
					rights: ['sale'],
				},
			})
		);
		const saveP = kA.commands.save({ marketing: true });
		await Promise.resolve();
		// While save is in flight, a newer account doc arrives with a newer opt-out!
		kA.syncUserConsent(
			makeUserConsent({
				checkedAt: NOW + 2000,
				externalId: 'user_a',
				optOut: {
					method: 'button',
					recordedAt: NOW + 1000,
					rights: ['sale', 'share'],
				},
			})
		);
		saveDeferred.resolve({ ok: true, subjectId: 'sub_a' });
		await saveP;
		await flushMacrotasks();
		expect(liftOptOutA).not.toHaveBeenCalled();
		expect(kA.getAccountLayer()?.optOut?.rawRecordedAt).toBe(NOW + 1000);
		kA.dispose();

		// Case B: partial lift — backend lifts `sale` but leaves `share` held -> must keep account opt-out with remaining `['share']` (not clear to null)!
		const kB = createKernel(
			{
				consentCategories: ['marketing'],
				initialPolicyResolution: resolution,
				initialRecords: { now: NOW, subject: { subjectId: 'sub_b' } },
				initialUser: { externalId: 'user_b', identityToken: 'tok_b' },
				now: NOW,
				transport: {
					identify: (_u, subjectId) =>
						Promise.resolve({ subjectId: subjectId ?? 'sub_b' }),
					liftOptOut: () =>
						Promise.resolve({
							ok: true,
							optOut: {
								heldBy: 'person',
								method: 'button',
								recordedAt: NOW - 5000,
								rights: ['share'],
							},
						}),
				},
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		await kB.commands.identify({
			externalId: 'user_b',
			identityToken: 'tok_b',
		});
		kB.syncUserConsent(
			makeUserConsent({
				checkedAt: NOW,
				externalId: 'user_b',
				optOut: {
					method: 'button',
					recordedAt: NOW - 5000,
					rights: ['sale'],
				},
			})
		);
		const partialRes = await kB.commands.optIn();
		expect(partialRes).toEqual({ ok: true, optOut: null });
		expect(kB.getAccountLayer()?.optOut?.rights).toEqual(['share']);
		expect(kB.getAccountLayer()?.liftedRecordedAt).toBe(NOW - 5000);
		expect(kB.getSnapshot().optOut?.rights).toEqual(['share']);
		kB.dispose();
	});

	test('init both opt-out answer confirms a covering device receipt without copying rights', async () => {
		const resolution = matchedResolution(optOutRule({ prompt: 'none' }));
		const kernel = createKernel({
			initialPolicyResolution: resolution,
			initialRecords: {
				now: NOW,
				optOut: {
					heldBy: 'device',
					method: 'button',
					recordedAt: NOW - 2000,
					rights: ['targeted_ads'],
				},
				optOutRightsConfirmed: false,
				subject: { subjectId: 'sub_a' },
			},
			initialUser: { externalId: 'user_a' },
			now: NOW,
			transport: {
				init: () =>
					Promise.resolve({
						records: {
							optOut: {
								heldBy: 'both' as const,
								method: 'button' as const,
								recordedAt: NOW - 1000,
								rights: ['sale' as const, 'targeted_ads' as const],
							},
						},
						resolution,
					}),
			},
		});
		try {
			kernel.syncUserConsent(
				makeUserConsent({
					externalId: 'user_a',
					optOut: {
						method: 'button',
						recordedAt: NOW - 3000,
						rights: ['sale'],
					},
				})
			);
			expect(kernel.getOptOutReceiptData().rightsConfirmed).toBe(false);
			const result = await kernel.commands.init();
			expect(result.ok).toBe(true);
			expect(kernel.getBrowserRecords().optOut?.rights).toEqual([
				'targeted_ads',
			]);
			expect(kernel.getOptOutReceiptData().rightsConfirmed).toBe(true);
		} finally {
			kernel.dispose();
		}
	});
});

describe('kernel regressions (set 4)', () => {
	test('setUserWithPending for the same active user routes through adoption rule and lift floor (never rolls back lift or newer doc)', async () => {
		const resolution = matchedResolution(optOutRule({ prompt: 'none' }));
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

		const kernel = createKernel(
			{
				consentCategories: ['marketing'],
				initialPolicyResolution: resolution,
				initialRecords: { now: NOW, subject: { subjectId: 'sub_a' } },
				initialUser: { externalId: 'user_a', identityToken: 'tok_a' },
				initialUserConsent: preLiftDoc,
				now: NOW,
				transport: {
					identify: (_u, subjectId) =>
						Promise.resolve({ subjectId: subjectId ?? 'sub_a' }),
					liftOptOut: () => Promise.resolve({ ok: true, optOut: null }),
				},
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		try {
			await kernel.commands.identify({
				externalId: 'user_a',
				identityToken: 'tok_a',
			});
			expect(await kernel.commands.optIn()).toEqual({ ok: true, optOut: null });
			expect(kernel.getAccountLayer()?.optOut).toBeNull();

			// Same user arrives again (e.g. token refresh / client hydration) with the cached pre-lift doc -> MUST keep the lift!
			kernel.setUserWithPending(
				{ externalId: 'user_a', identityToken: 'tok_a_2' },
				{ userConsent: structuredClone(preLiftDoc) }
			);
			expect(kernel.getAccountLayer()?.optOut).toBeNull();
			expect(kernel.getSnapshot().optOut).toBeNull();

			// Now sync a newer document (checkedAt: NOW + 5000, marketing: true), then re-pass the older doc via setUserWithPending -> MUST NOT roll back!
			kernel.syncUserConsent(
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
			expect(kernel.getAccountLayer()?.checkedAt).toBe(NOW + 5000);
			kernel.setUserWithPending(
				{ externalId: 'user_a', identityToken: 'tok_a_3' },
				{ userConsent: structuredClone(preLiftDoc) }
			);
			expect(kernel.getAccountLayer()?.checkedAt).toBe(NOW + 5000);
			expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(true);
		} finally {
			kernel.dispose();
		}
	});

	test('a marketing-only bulk save keeps a declared measurement vendor denial', async () => {
		const resolution = matchedResolution(optInRule());
		const save = vi.fn((payload: SavePayload) =>
			Promise.resolve({ ok: true, subjectId: payload.subjectId })
		);
		const kernel = createKernel(
			{
				consentCategories: ['marketing', 'measurement'],
				initialPolicyResolution: resolution,
				initialUser: { externalId: 'a' },
				initialVendors: {
					declared: [
						{
							category: 'marketing',
							id: 'marketing-vendor',
							presentable: true,
							source: 'config',
						},
						{
							category: 'measurement',
							id: 'measurement-vendor',
							presentable: true,
							source: 'config',
						},
					],
					listVersion: 'v1',
				},
				now: NOW,
				transport: { save },
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		kernel.syncUserConsent(
			makeUserConsent({
				choices: {
					measurement: {
						basis: {
							fingerprint: resolution.fingerprints.choice,
							kind: 'choice-v1',
						},
						confirmedAt: NOW - 3000,
						value: true,
					},
				},
				externalId: 'a',
				vendors: {
					'measurement-vendor': { confirmedAt: NOW - 3000, value: false },
				},
			})
		);
		try {
			expect(isVendorAllowed(kernel.getSnapshot(), 'measurement-vendor')).toBe(
				false
			);
			const result = await kernel.commands.save('all', {
				categories: ['marketing'],
			});
			expect(result.ok).toBe(true);
			expect({
				allowed: isVendorAllowed(kernel.getSnapshot(), 'measurement-vendor'),
				postedGrant:
					save.mock.calls[0]?.[0].vendorChoice?.grants?.[
						'measurement-vendor'
					] === true,
			}).toEqual({ allowed: false, postedGrant: false });
		} finally {
			kernel.dispose();
		}
	});

	test('an IAB category save leaves account-only vendors out of browser records', async () => {
		const resolution = matchedResolution(iabRule());
		const save = vi.fn((payload: SavePayload) =>
			Promise.resolve({ ok: true, subjectId: payload.subjectId })
		);
		const kernel = createKernel(
			{
				consentCategories: ['marketing', 'measurement'],
				initialIab: { enabled: true },
				initialPolicyResolution: resolution,
				initialUser: { externalId: 'a' },
				initialVendors: {
					declared: [
						{
							category: 'marketing',
							id: 'marketing-vendor',
							presentable: true,
							source: 'config',
						},
						{
							category: 'measurement',
							id: 'measurement-vendor',
							presentable: true,
							source: 'config',
						},
					],
					listVersion: 'v1',
				},
				now: NOW,
				transport: { save },
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		kernel.syncUserConsent(
			makeUserConsent({
				choices: {
					measurement: {
						basis: {
							fingerprint: resolution.fingerprints.choice,
							kind: 'choice-v1',
						},
						confirmedAt: NOW - 3000,
						value: true,
					},
				},
				externalId: 'a',
				vendors: {
					'measurement-vendor': { confirmedAt: NOW - 3000, value: false },
				},
			})
		);
		try {
			expect(kernel.getSnapshot().evaluationPolicy.model).toBe('iab');
			expect(kernel.getSnapshot().vendorChoice?.denied).toEqual([
				'measurement-vendor',
			]);
			expect(kernel.getBrowserRecords().vendorChoice).toBeNull();
			const result = await kernel.commands.save({ marketing: false });
			expect(result.ok).toBe(true);
			expect(save).toHaveBeenCalled();
			expect(kernel.getBrowserRecords().vendorChoice).toBeNull();
		} finally {
			kernel.dispose();
		}
	});

	// Updated to match the lift outcome table (both + no requested rights -> success, clear account, never copy rights)
	test('a partial lift with a both answer never imports device rights into the account layer', async () => {
		const user = { externalId: 'a', identityToken: 'token-a' };
		const resolution = matchedResolution(optOutRule());
		const kernel = createKernel(
			{
				consentCategories: ['marketing'],
				initialPolicyResolution: resolution,
				initialRecords: { now: NOW, subject: { subjectId: 'sub_a' } },
				initialUser: user,
				now: NOW,
				transport: {
					identify: (_user, id) =>
						Promise.resolve({ subjectId: id ?? 'sub_a' }),
					liftOptOut: () =>
						Promise.resolve({
							ok: true,
							optOut: {
								heldBy: 'both',
								method: 'button',
								recordedAt: NOW - 3000,
								rights: ['share', 'targeted_ads'],
							},
						}),
				},
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		try {
			await kernel.commands.identify(user);
			kernel.syncUserConsent(
				makeUserConsent({
					externalId: 'a',
					optOut: {
						method: 'button',
						recordedAt: NOW - 5000,
						rights: ['sale'],
					},
				})
			);
			expect(await kernel.commands.optIn()).toEqual({
				ok: true,
				optOut: null,
			});
			expect(kernel.getAccountLayer()?.optOut).toBeNull();
			expect(kernel.getAccountLayer()?.liftedRecordedAt).toBe(NOW - 5000);
			expect(kernel.getBrowserRecords().optOut).toBeNull();
		} finally {
			kernel.dispose();
		}
	});

	test('atomic user switch emits opt-out:synced exactly once when effective opt-out changes', () => {
		const resolution = matchedResolution(optOutRule({ prompt: 'none' }));
		const kernel = createKernel({
			consentCategories: ['marketing'],
			initialPolicyResolution: resolution,
			initialUser: { externalId: 'user_a' },
			initialUserConsent: makeUserConsent({
				externalId: 'user_a',
				optOut: {
					method: 'button',
					recordedAt: NOW - 5000,
					rights: ['sale'],
				},
			}),
			now: NOW,
		});
		const syncedEvents: (OptOutRecord | null)[] = [];
		kernel.events.on('opt-out:synced', (event) => {
			syncedEvents.push(event.optOut ? { ...event.optOut } : null);
		});
		try {
			kernel.setUserWithPending(
				{ externalId: 'user_b' },
				{
					userConsent: makeUserConsent({
						externalId: 'user_b',
						optOut: null,
					}),
				}
			);
			expect(syncedEvents).toEqual([null]);
		} finally {
			kernel.dispose();
		}
	});
});

describe('kernel regressions (set 5): per-vendor times and the lift outcome table', () => {
	test('a scoped marketing save does not renew an older browser measurement grant', async () => {
		const resolution = matchedResolution(optInRule());
		const save = vi.fn((payload: SavePayload) =>
			Promise.resolve({ ok: true, subjectId: payload.subjectId })
		);
		const kernel = createKernel(
			{
				consentCategories: ['marketing', 'measurement'],
				initialPolicyResolution: resolution,
				initialRecords: {
					now: NOW,
					vendorChoice: { confirmedAt: NOW - 5000, denied: [], version: 1 },
					vendorDeclared: ['measurement-vendor'],
				},
				initialUser: { externalId: 'a' },
				initialVendors: {
					declared: [
						{
							category: 'marketing',
							id: 'marketing-vendor',
							presentable: true,
							source: 'config',
						},
						{
							category: 'measurement',
							id: 'measurement-vendor',
							presentable: true,
							source: 'config',
						},
					],
					listVersion: 'v1',
				},
				now: NOW,
				transport: { save },
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		kernel.syncUserConsent(
			makeUserConsent({
				choices: {
					measurement: {
						basis: {
							fingerprint: resolution.fingerprints.choice,
							kind: 'choice-v1',
						},
						confirmedAt: NOW - 3000,
						value: true,
					},
				},
				externalId: 'a',
				vendors: {
					'measurement-vendor': { confirmedAt: NOW - 3000, value: false },
				},
			})
		);
		try {
			expect(isVendorAllowed(kernel.getSnapshot(), 'measurement-vendor')).toBe(
				false
			);
			expect(
				(await kernel.commands.save('all', { categories: ['marketing'] })).ok
			).toBe(true);
			expect({
				allowed: isVendorAllowed(kernel.getSnapshot(), 'measurement-vendor'),
				postedGrant:
					save.mock.calls[0]?.[0].vendorChoice?.grants?.[
						'measurement-vendor'
					] === true,
			}).toEqual({ allowed: false, postedGrant: false });
		} finally {
			kernel.dispose();
		}
	});

	// full save at T1, account denial at T2, marketing-only save at T3 keeps measurement vendor denied and posts no grant
	test('full save at T1, account denial at T2, marketing-only save at T3 keeps measurement vendor denied and posts no grant', async () => {
		const resolution = matchedResolution(optInRule());
		const fp = resolution.fingerprints.choice;
		const save = vi.fn((payload: SavePayload) =>
			Promise.resolve({ ok: true, subjectId: payload.subjectId })
		);
		const kernel = createKernel(
			{
				consentCategories: ['marketing', 'measurement'],
				initialPolicyResolution: resolution,
				initialUser: { externalId: 'a' },
				initialVendors: {
					declared: [
						{
							category: 'marketing',
							id: 'marketing-vendor',
							presentable: true,
							source: 'config',
						},
						{
							category: 'measurement',
							id: 'measurement-vendor',
							presentable: true,
							source: 'config',
						},
					],
					listVersion: 'v1',
				},
				now: NOW - 5000,
				transport: { save },
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		try {
			// T1: full save grants both vendors.
			vi.spyOn(Date, 'now').mockReturnValue(NOW - 5000);
			await kernel.commands.save('all');
			expect(isVendorAllowed(kernel.getSnapshot(), 'measurement-vendor')).toBe(
				true
			);

			// T2: account denies measurement-vendor.
			vi.spyOn(Date, 'now').mockReturnValue(NOW - 2000);
			kernel.syncUserConsent(
				makeUserConsent({
					checkedAt: NOW - 2000,
					choices: {
						measurement: {
							basis: { fingerprint: fp, kind: 'choice-v1' },
							confirmedAt: NOW - 2000,
							value: true,
						},
					},
					externalId: 'a',
					vendors: {
						'measurement-vendor': { confirmedAt: NOW - 2000, value: false },
					},
				})
			);
			expect(isVendorAllowed(kernel.getSnapshot(), 'measurement-vendor')).toBe(
				false
			);

			// T3: marketing-only bulk save must NOT renew measurement-vendor's T1 time or post measurement-vendor: true!
			vi.spyOn(Date, 'now').mockReturnValue(NOW);
			await kernel.commands.save('all', { categories: ['marketing'] });
			expect(isVendorAllowed(kernel.getSnapshot(), 'measurement-vendor')).toBe(
				false
			);
			expect(
				save.mock.calls[1]?.[0].vendorChoice?.grants?.['measurement-vendor']
			).not.toBe(true);
		} finally {
			kernel.dispose();
		}
	});

	// two saves at the same actionAt keep the expanded coverage
	test('two saves at the same actionAt expand vendorDeclared and per-vendor times', async () => {
		const resolution = matchedResolution(optInRule());
		const kernel = createKernel(
			{
				consentCategories: ['marketing', 'measurement'],
				initialPolicyResolution: resolution,
				initialUser: { externalId: 'a' },
				initialVendors: {
					declared: [
						{
							category: 'marketing',
							id: 'marketing-vendor',
							presentable: true,
							source: 'config',
						},
						{
							category: 'measurement',
							id: 'measurement-vendor',
							presentable: true,
							source: 'config',
						},
					],
					listVersion: 'v1',
				},
				now: NOW,
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		const p = createPersistence({ kernel });
		try {
			// Save 1 at NOW: scoped marketing-only bulk save covers only marketing-vendor.
			await kernel.commands.save('all', {
				actionAt: NOW,
				categories: ['marketing'],
			});
			expect(kernel.getBrowserRecords().vendorDeclared).toEqual([
				'marketing-vendor',
			]);

			// Save 2 at the EXACT SAME actionAt = NOW: full bulk save expands coverage to both vendors!
			await kernel.commands.save('all', { actionAt: NOW });
			expect(kernel.getBrowserRecords().vendorDeclared).toEqual([
				'marketing-vendor',
				'measurement-vendor',
			]);
			expect(kernel.getBrowserRecords().vendorTimes).toEqual({
				'marketing-vendor': NOW,
				'measurement-vendor': NOW,
			});
			await flushMacrotasks();
			const storedLocal = JSON.parse(
				window.localStorage.getItem('inth-vendors') ?? '{}'
			) as { vendorTimes?: Record<string, number> };
			expect(storedLocal.vendorTimes).toEqual({
				'marketing-vendor': NOW,
				'measurement-vendor': NOW,
			});
		} finally {
			p.dispose();
			kernel.dispose();
		}
	});

	test('a both lift answer with none of the requested rights clears the account', async () => {
		const user = { externalId: 'a', identityToken: 'token-a' };
		const resolution = matchedResolution(optOutRule());
		const kernel = createKernel(
			{
				consentCategories: ['marketing'],
				initialPolicyResolution: resolution,
				initialRecords: { now: NOW, subject: { subjectId: 'sub_a' } },
				initialUser: user,
				now: NOW,
				transport: {
					identify: (_user, id) =>
						Promise.resolve({ subjectId: id ?? 'sub_a' }),
					liftOptOut: () =>
						Promise.resolve({
							ok: true,
							optOut: {
								heldBy: 'both',
								method: 'button',
								recordedAt: NOW - 3000,
								rights: ['share', 'targeted_ads'],
							},
						}),
				},
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		try {
			await kernel.commands.identify(user);
			kernel.syncUserConsent(
				makeUserConsent({
					externalId: 'a',
					optOut: {
						method: 'button',
						recordedAt: NOW - 5000,
						rights: ['sale'],
					},
				})
			);
			expect(await kernel.commands.optIn()).toEqual({ ok: true, optOut: null });
			expect(kernel.getAccountLayer()?.optOut).toBeNull();
			expect(kernel.getBrowserRecords().optOut).toBeNull();
		} finally {
			kernel.dispose();
		}
	});

	test('a failed person-held lift leaves the account layer unchanged', async () => {
		const user = { externalId: 'a', identityToken: 'token-a' };
		const resolution = matchedResolution(optOutRule());
		const kernel = createKernel(
			{
				consentCategories: ['marketing'],
				initialPolicyResolution: resolution,
				initialRecords: { now: NOW, subject: { subjectId: 'sub_a' } },
				initialUser: user,
				now: NOW,
				transport: {
					identify: (_user, id) =>
						Promise.resolve({ subjectId: id ?? 'sub_a' }),
					liftOptOut: () =>
						Promise.resolve({
							ok: true,
							optOut: {
								heldBy: 'person',
								method: 'button',
								recordedAt: NOW - 3000,
								rights: ['sale'],
							},
						}),
				},
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		try {
			await kernel.commands.identify(user);
			kernel.syncUserConsent(
				makeUserConsent({
					externalId: 'a',
					optOut: {
						method: 'button',
						recordedAt: NOW - 5000,
						rights: ['sale', 'share'],
					},
				})
			);
			const original = structuredClone(kernel.getAccountLayer());
			expect(await kernel.commands.optIn()).toEqual({
				ok: false,
				reason: 'held-by-account',
			});
			expect(kernel.getAccountLayer()).toEqual(original);
		} finally {
			kernel.dispose();
		}
	});

	// Complete lift outcome table: all 7 rows tested for both optIn() and save()-triggered lift
	const LIFT_TABLE_ROWS: readonly {
		name: string;
		accountRights: ('sale' | 'share' | 'targeted_ads')[];
		answer: OptOutRecord | null;
		expectSuccess: boolean;
		expectAccountRights: ('sale' | 'share' | 'targeted_ads')[] | null;
		expectLiftedRecordedAt: number | undefined;
		expectBrowserRights: ('sale' | 'share' | 'targeted_ads')[] | null;
	}[] = [
		{
			accountRights: ['sale'],
			answer: null,
			expectAccountRights: null,
			expectBrowserRights: null,
			expectLiftedRecordedAt: NOW - 5000,
			expectSuccess: true,
			name: 'row 1: null answer -> success, clear account, set liftedRecordedAt, browser unchanged',
		},
		{
			accountRights: ['sale'],
			answer: {
				heldBy: 'person',
				method: 'button',
				recordedAt: NOW - 3000,
				rights: ['share'],
			},
			expectAccountRights: ['share'],
			expectBrowserRights: null,
			expectLiftedRecordedAt: NOW - 5000,
			expectSuccess: true,
			name: 'row 2: person / no requested rights left -> success, keep remaining person rights, set liftedRecordedAt, browser unchanged',
		},
		{
			accountRights: ['sale', 'share'],
			answer: {
				heldBy: 'person',
				method: 'button',
				recordedAt: NOW - 3000,
				rights: ['sale'],
			},
			expectAccountRights: ['sale', 'share'],
			expectBrowserRights: null,
			expectLiftedRecordedAt: undefined,
			expectSuccess: false,
			name: 'row 3: person / requested rights left -> held-by-account, account unchanged, browser unchanged',
		},
		{
			accountRights: ['sale'],
			answer: {
				heldBy: 'both',
				method: 'button',
				recordedAt: NOW - 3000,
				rights: ['share', 'targeted_ads'],
			},
			expectAccountRights: null,
			expectBrowserRights: null,
			expectLiftedRecordedAt: NOW - 5000,
			expectSuccess: true,
			name: 'row 4: both / no requested rights left -> success, clear account, set liftedRecordedAt, browser unchanged',
		},
		{
			accountRights: ['sale'],
			answer: {
				heldBy: 'both',
				method: 'button',
				recordedAt: NOW - 3000,
				rights: ['sale', 'targeted_ads'],
			},
			expectAccountRights: ['sale'],
			expectBrowserRights: null,
			expectLiftedRecordedAt: undefined,
			expectSuccess: false,
			name: 'row 5: both / requested rights left -> held-by-account, account unchanged, browser unchanged',
		},
		{
			accountRights: ['sale'],
			answer: {
				heldBy: 'device',
				method: 'button',
				recordedAt: NOW - 3000,
				rights: ['targeted_ads'],
			},
			expectAccountRights: null,
			expectBrowserRights: ['targeted_ads'],
			expectLiftedRecordedAt: NOW - 5000,
			expectSuccess: true,
			name: 'row 6: device / no requested rights left -> success, clear account, set liftedRecordedAt, adopt device opt-out in browser',
		},
		{
			accountRights: ['sale'],
			answer: {
				heldBy: 'device',
				method: 'button',
				recordedAt: NOW - 3000,
				rights: ['sale'],
			},
			expectAccountRights: ['sale'],
			expectBrowserRights: null,
			expectLiftedRecordedAt: undefined,
			expectSuccess: false,
			name: 'row 7: device / requested rights left -> held-by-account, account unchanged, browser unchanged',
		},
	];

	for (const row of LIFT_TABLE_ROWS) {
		test(`lift outcome table (optIn & save) - ${row.name}`, async () => {
			const user = { externalId: 'a', identityToken: 'token-a' };
			const resolution = matchedResolution(optOutRule({ prompt: 'choice' }));

			// 1. Test via optIn()
			const kOptIn = createKernel(
				{
					consentCategories: ['marketing'],
					initialPolicyResolution: resolution,
					initialRecords: { now: NOW, subject: { subjectId: 'sub_a' } },
					initialUser: user,
					now: NOW,
					transport: {
						identify: (_user, id) =>
							Promise.resolve({ subjectId: id ?? 'sub_a' }),
						liftOptOut: () => Promise.resolve({ ok: true, optOut: row.answer }),
					},
				},
				{ outboxStore: createMemoryOutboxStore() }
			);
			try {
				await kOptIn.commands.identify(user);
				kOptIn.syncUserConsent(
					makeUserConsent({
						externalId: 'a',
						optOut: {
							method: 'button',
							recordedAt: NOW - 5000,
							rights: row.accountRights,
						},
					})
				);
				const res = await kOptIn.commands.optIn();
				expect(res).toEqual(
					row.expectSuccess
						? { ok: true, optOut: null }
						: { ok: false, reason: 'held-by-account' }
				);
				expect(kOptIn.getAccountLayer()?.optOut?.rights ?? null).toEqual(
					row.expectAccountRights
				);
				expect(kOptIn.getAccountLayer()?.liftedRecordedAt).toBe(
					row.expectLiftedRecordedAt
				);
				expect(kOptIn.getBrowserRecords().optOut?.rights ?? null).toEqual(
					row.expectBrowserRights
				);
			} finally {
				kOptIn.dispose();
			}

			// 2. Test via save()-triggered lift
			const kSave = createKernel(
				{
					consentCategories: ['marketing'],
					initialPolicyResolution: resolution,
					initialRecords: { now: NOW, subject: { subjectId: 'sub_a' } },
					initialUser: user,
					now: NOW,
					transport: {
						identify: (_user, id) =>
							Promise.resolve({ subjectId: id ?? 'sub_a' }),
						liftOptOut: () => Promise.resolve({ ok: true, optOut: row.answer }),
						save: () => Promise.resolve({ ok: true, subjectId: 'sub_a' }),
					},
				},
				{ outboxStore: createMemoryOutboxStore() }
			);
			try {
				await kSave.commands.identify(user);
				kSave.syncUserConsent(
					makeUserConsent({
						externalId: 'a',
						optOut: {
							method: 'button',
							recordedAt: NOW - 5000,
							rights: row.accountRights,
						},
					})
				);
				await kSave.commands.save({ marketing: true });
				await flushMacrotasks();
				expect(kSave.getAccountLayer()?.optOut?.rights ?? null).toEqual(
					row.expectAccountRights
				);
				expect(kSave.getAccountLayer()?.liftedRecordedAt).toBe(
					row.expectLiftedRecordedAt
				);
				expect(kSave.getBrowserRecords().optOut?.rights ?? null).toEqual(
					row.expectBrowserRights
				);
			} finally {
				kSave.dispose();
			}
		});
	}
});
