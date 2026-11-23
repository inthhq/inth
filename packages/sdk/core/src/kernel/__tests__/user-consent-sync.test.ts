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
	matchedResolution,
	NOW,
	optInRule,
	optOutRule,
} from '../../__tests__/fixtures/kernel-fixtures';
import { createClearOnRevocation } from '../../modules/clear-on-revocation';
import { createIframeBlocker } from '../../modules/iframe-blocker';
import { createNetworkBlocker } from '../../modules/network-blocker';
import { createPersistence } from '../../modules/persistence';
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
