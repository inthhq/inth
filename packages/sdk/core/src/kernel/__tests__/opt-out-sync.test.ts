/**
 * @vitest-environment jsdom
 *
 * Network sync and outbox queueing for durable opt-outs: sending local acts
 * (`optOut`, `optIn`, refusing/granting `save`, automatic GPC), offline
 * queueing and ordered replay across reloads, `404` graceful fallback,
 * `409 subject_conflict` recovery, authoritative server answers, `identify()`
 * inheritance and reload persistence, fencing against newer local acts, and
 * clearing records.
 */
import { V1_UUID_PATTERN } from '@inth/sdk-schema/types';
import type { OptOutRecord } from '@inth/sdk-schema/types';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
	DAY,
	matchedResolution,
	NOW,
	optOutRule,
} from '../../__tests__/fixtures/kernel-fixtures';
import {
	optInPromptAllowedAt,
	OPT_OUT_REPROMPT_WAIT_MS,
} from '../../consent-record';
import { PENDING_OPT_OUTS_STORAGE_KEY } from '../../libs/storage-keys';
import { createPersistence } from '../../modules/persistence';
import { readStoredOptOutRecord } from '../../modules/persistence/record-storage';
import {
	bodyAt,
	json,
	PROJECT_URL,
	RECORD,
	stubFetch,
	SUBJECT,
	v1Error,
} from '../../transports/v1/__tests__/fixtures';
import { createV1HostedTransport } from '../../transports/v1/hosted';
import type {
	KernelConfig,
	KernelTransport,
	LiftOptOutPayload,
	LiftOptOutTransportResult,
	OptOutPayload,
	OptOutTransportResult,
	SavePayload,
	SaveResult,
} from '../../types';
import { clearKernelRecords } from '../clear-records';
import { createKernel } from '../index';
import type { InternalKernel } from '../internals';
import {
	createBrowserOutboxStore,
	createMemoryOutboxStore,
} from '../save-outbox';
import type { PendingOptOutEntry, SaveOutboxStore } from '../save-outbox';

await import('../save-outbox/queue');

const usOptOutRule = () =>
	optOutRule({
		privacySignals: { gpc: { denyCategories: ['marketing', 'measurement'] } },
		prompt: 'none',
	});

const clearBrowserStorage = () => {
	window.localStorage.clear();
	for (const cookie of document.cookie.split(';')) {
		const name = cookie.split('=')[0]?.trim();
		if (name) {
			document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
		}
	}
};

let store: SaveOutboxStore;

beforeEach(() => {
	clearBrowserStorage();
	store = createMemoryOutboxStore();
});

afterEach(() => {
	vi.restoreAllMocks();
	clearBrowserStorage();
});

const kernelOn = (
	config: KernelConfig = {},
	outboxStore: SaveOutboxStore = store
): InternalKernel =>
	createKernel(
		{
			initialLocation: { countryCode: 'US', regionCode: 'CA' },
			initialPolicyResolution: matchedResolution(usOptOutRule()),
			initialPolicySnapshotToken: 'snapshot-token',
			now: NOW,
			...config,
		},
		{ outboxStore }
	);

const queuedOptOuts = (
	outboxStore: SaveOutboxStore = store
): Promise<PendingOptOutEntry[]> =>
	outboxStore.transact(
		(tx) => (tx.read('optOuts') ?? []) as PendingOptOutEntry[]
	);

const flushMacrotasks = () =>
	new Promise<void>((resolve) => {
		setTimeout(resolve, 25);
	});

describe('opt-out network sync and queue', () => {
	test('optOut() sends one request with a UUID key, queues on failure, and replays across a reload with the same key', async () => {
		const offline = vi
			.fn<NonNullable<KernelTransport['optOut']>>()
			.mockRejectedValue(new Error('offline'));
		const first = kernelOn({
			initialRecords: { now: NOW, subject: { subjectId: SUBJECT } },
			transport: { optOut: offline },
		});

		await first.commands.optOut({ uiSource: 'widget' });

		expect(first.getSnapshot().optOut).toMatchObject({
			heldBy: 'device',
			method: 'button',
			rights: [],
		});
		expect(first.getSnapshot().effectivePermissions.marketing).toBe(false);
		expect(first.getSnapshot().effectivePermissions.measurement).toBe(false);
		expect(offline).toHaveBeenCalledTimes(1);
		const sent = offline.mock.calls[0]?.[0] as OptOutPayload;
		expect(sent.idempotencyKey).toMatch(V1_UUID_PATTERN);
		expect(sent.method).toBe('button');
		expect('rights' in sent).toBe(false);
		expect(sent.subjectId).toBe(SUBJECT);
		expect(sent.policySnapshotToken).toBe('snapshot-token');
		expect(sent.uiSource).toBe('widget');

		const queued = await queuedOptOuts();
		expect(queued).toHaveLength(1);
		expect(queued[0]?.idempotencyKey).toBe(sent.idempotencyKey);
		expect(queued[0]?.kind).toBe('record');
		first.dispose();

		const replayed: OptOutPayload[] = [];
		const next = kernelOn({
			initialRecords: {
				now: NOW,
				optOut: {
					heldBy: 'device',
					method: 'button',
					recordedAt: NOW,
					rights: [],
				},
				subject: { subjectId: SUBJECT },
			},
			transport: {
				optOut: (payload) => {
					replayed.push(payload);
					return Promise.resolve({
						ok: true,
						optOut: {
							heldBy: 'device',
							method: 'button',
							recordedAt: NOW + 5000,
							rights: ['sale', 'share'],
						},
						subjectId: payload.subjectId,
					});
				},
			},
		});

		await next.commands.init();
		await vi.waitFor(() => expect(replayed).toHaveLength(1));
		expect(replayed[0]?.idempotencyKey).toBe(sent.idempotencyKey);
		expect('rights' in (replayed[0] as OptOutPayload)).toBe(false);
		expect(await queuedOptOuts()).toEqual([]);
		expect(next.getSnapshot().optOut).toEqual({
			heldBy: 'device',
			method: 'button',
			recordedAt: NOW + 5000,
			rights: ['sale', 'share'],
		});
		next.dispose();
	});

	test('an opt-out is sent with a stale policy snapshot token and never dropped for a policy snapshot code or policy change', async () => {
		let attempts = 0;
		const { calls, fetch } = stubFetch(() => {
			attempts += 1;
			if (attempts === 1) {
				return v1Error(409, 'policy_snapshot_expired');
			}
			return json(200, {
				optOut: {
					heldBy: 'device',
					method: 'button',
					recordedAt: NOW + 2000,
					rights: ['sale', 'share'],
				},
				recordId: RECORD,
				subjectId: SUBJECT,
			});
		});
		const transport = createV1HostedTransport({
			fetch,
			projectUrl: PROJECT_URL,
			property: 'www.example.com',
		});
		const kernel = kernelOn({
			initialPolicySnapshotToken: 'stale-token',
			initialRecords: { now: NOW, subject: { subjectId: SUBJECT } },
			transport: {
				liftOptOut: transport.liftOptOut,
				optOut: transport.optOut,
			},
		});

		await kernel.commands.optOut();
		expect(calls).toHaveLength(1);
		expect(bodyAt(calls, 0).policySnapshotToken).toBe('stale-token');
		expect('rights' in bodyAt(calls, 0)).toBe(false);
		// Still queued despite 409 policy_snapshot_expired.
		expect(await queuedOptOuts()).toHaveLength(1);

		// Even after policy / snapshot token changes, replay still delivers it.
		kernel.set.overrides({ country: 'US', region: 'CO' });
		kernel.replaySaves();
		await vi.waitFor(() => expect(calls).toHaveLength(2));
		await vi.waitFor(async () => expect(await queuedOptOuts()).toEqual([]));
		expect(kernel.getSnapshot().optOut?.recordedAt).toBe(NOW + 2000);
		kernel.dispose();
	});

	test('404 empties the opt-out queue, fills all three rights locally via opt-out:synced, persists them, stops further requests, and creates later records with all three', async () => {
		const consoleError = vi
			.spyOn(console, 'error')
			.mockImplementation(() => undefined);
		const consoleWarn = vi
			.spyOn(console, 'warn')
			.mockImplementation(() => undefined);
		const { calls, fetch } = stubFetch(() => v1Error(404, 'not_found'));
		const transport = createV1HostedTransport({
			fetch,
			projectUrl: PROJECT_URL,
			property: 'www.example.com',
		});
		const kernel = kernelOn({
			initialRecords: { now: NOW, subject: { subjectId: SUBJECT } },
			transport: {
				liftOptOut: transport.liftOptOut,
				optOut: transport.optOut,
			},
		});
		const errors: unknown[] = [];
		const recordedRights: (readonly string[])[] = [];
		const synced: (Readonly<OptOutRecord> | null)[] = [];
		kernel.events.on('command:error', ({ error }) => errors.push(error));
		kernel.events.on('opt-out:recorded', ({ optOut }) =>
			recordedRights.push([...optOut.rights])
		);
		kernel.events.on('opt-out:synced', ({ optOut }) => synced.push(optOut));
		const persistence = createPersistence({ kernel });

		const firstResult = await kernel.commands.optOut();
		await flushMacrotasks();

		expect(calls).toHaveLength(1);
		expect('rights' in bodyAt(calls, 0)).toBe(false);
		expect(recordedRights).toEqual([[]]);
		expect(firstResult).toMatchObject({
			changed: true,
			ok: true,
			optOut: {
				heldBy: 'device',
				method: 'button',
				rights: ['sale', 'share', 'targeted_ads'],
			},
		});
		expect(synced).toHaveLength(1);
		expect(synced[0]?.rights).toEqual(['sale', 'share', 'targeted_ads']);
		expect(kernel.getSnapshot().optOut?.rights).toEqual([
			'sale',
			'share',
			'targeted_ads',
		]);
		expect(readStoredOptOutRecord(undefined, Date.now())).toMatchObject({
			ok: true,
			record: { rights: ['sale', 'share', 'targeted_ads'] },
		});
		expect(await queuedOptOuts()).toEqual([]);
		expect(errors).toEqual([]);
		expect(consoleError).not.toHaveBeenCalled();
		expect(consoleWarn).not.toHaveBeenCalled();
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
		expect(kernel.getSnapshot().effectivePermissions.measurement).toBe(false);

		// Further opt-out acts on this kernel send nothing and start with all three rights.
		await kernel.commands.optIn();
		const secondResult = await kernel.commands.optOut();
		await flushMacrotasks();
		expect(calls).toHaveLength(1);
		expect(secondResult).toMatchObject({
			changed: true,
			ok: true,
			optOut: { rights: ['sale', 'share', 'targeted_ads'] },
		});
		expect(recordedRights).toEqual([[], ['sale', 'share', 'targeted_ads']]);
		expect(synced).toHaveLength(1);
		expect(await queuedOptOuts()).toEqual([]);
		expect(errors).toEqual([]);
		persistence.dispose();
		kernel.dispose();
	});

	test('404 during replay fills hydrated empty rights and persists them', async () => {
		const offline = vi
			.fn<NonNullable<KernelTransport['optOut']>>()
			.mockRejectedValue(new Error('offline'));
		const first = kernelOn({
			initialRecords: { now: NOW, subject: { subjectId: SUBJECT } },
			transport: { optOut: offline },
		});
		const firstPersistence = createPersistence({ kernel: first });
		await first.commands.optOut();
		await flushMacrotasks();
		expect(readStoredOptOutRecord(undefined, Date.now())).toMatchObject({
			ok: true,
			record: { rights: [] },
		});
		firstPersistence.dispose();
		first.dispose();

		const { calls, fetch } = stubFetch(() => v1Error(404, 'not_found'));
		const transport = createV1HostedTransport({
			fetch,
			projectUrl: PROJECT_URL,
			property: 'www.example.com',
		});
		const reloaded = kernelOn({
			transport: {
				liftOptOut: transport.liftOptOut,
				optOut: transport.optOut,
			},
		});
		const synced: (Readonly<OptOutRecord> | null)[] = [];
		reloaded.events.on('opt-out:synced', ({ optOut }) => synced.push(optOut));
		const secondPersistence = createPersistence({ kernel: reloaded });
		expect(reloaded.getSnapshot().optOut?.rights).toEqual([]);

		await reloaded.commands.init();
		await vi.waitFor(() => expect(calls).toHaveLength(1));
		await flushMacrotasks();

		expect(reloaded.getSnapshot().optOut?.rights).toEqual([
			'sale',
			'share',
			'targeted_ads',
		]);
		expect(synced).toHaveLength(1);
		expect(readStoredOptOutRecord(undefined, Date.now())).toMatchObject({
			ok: true,
			record: { rights: ['sale', 'share', 'targeted_ads'] },
		});
		expect(await queuedOptOuts()).toEqual([]);
		secondPersistence.dispose();
		reloaded.dispose();
	});

	test('404 never overwrites rights a backend supplied', async () => {
		const serverOptOut: OptOutRecord = {
			heldBy: 'person',
			method: 'api',
			recordedAt: NOW - 1000,
			rights: ['sale'],
		};
		const { fetch } = stubFetch(() => v1Error(404, 'not_found'));
		const transport = createV1HostedTransport({
			fetch,
			projectUrl: PROJECT_URL,
			property: 'www.example.com',
		});
		const kernel = kernelOn({
			initialRecords: {
				now: NOW,
				optOut: serverOptOut,
				subject: { subjectId: SUBJECT },
			},
			initialUser: { externalId: 'user_123', identityToken: 'tok_1' },
			transport: {
				liftOptOut: transport.liftOptOut,
				optOut: transport.optOut,
			},
		});
		const synced = vi.fn();
		kernel.events.on('opt-out:synced', synced);

		const result = await kernel.commands.optIn();
		expect(result).toEqual({ ok: false, reason: 'held-by-account' });
		expect(kernel.getSnapshot().optOut).toEqual(serverOptOut);
		expect(synced).not.toHaveBeenCalled();
		kernel.dispose();
	});

	test('server answer replaces local empty rights including a future recordedAt, persists it, and drives optInPromptAllowedAt', async () => {
		const serverTime = Date.now() + 7 * DAY;
		const serverOptOut: OptOutRecord = {
			heldBy: 'both',
			method: 'button',
			recordedAt: serverTime,
			rights: ['sale', 'share'],
		};
		const kernel = kernelOn({
			initialRecords: { now: NOW, subject: { subjectId: SUBJECT } },
			transport: {
				optOut: () =>
					Promise.resolve({
						ok: true,
						optOut: serverOptOut,
						subjectId: SUBJECT,
					}),
			},
		});
		const recordedRights: (readonly string[])[] = [];
		const synced: (Readonly<OptOutRecord> | null)[] = [];
		kernel.events.on('opt-out:recorded', ({ optOut }) =>
			recordedRights.push([...optOut.rights])
		);
		kernel.events.on('opt-out:synced', ({ optOut }) => synced.push(optOut));
		const persistence = createPersistence({ kernel });

		await kernel.commands.optOut();
		await flushMacrotasks();

		expect(recordedRights).toEqual([[]]);
		const held = kernel.getSnapshot().optOut;
		expect(held).toEqual(serverOptOut);
		expect.assert(held);
		expect(synced).toEqual([serverOptOut]);
		expect(optInPromptAllowedAt(held)).toBe(
			serverTime + OPT_OUT_REPROMPT_WAIT_MS
		);
		const stored = readStoredOptOutRecord(undefined, Date.now());
		expect(stored).toMatchObject({
			ok: true,
			record: {
				heldBy: 'both',
				recordedAt: serverTime,
				rights: ['sale', 'share'],
			},
		});
		persistence.dispose();
		kernel.dispose();
	});

	test('server answer with an earlier authoritative recordedAt overwrites a fast device clock in storage', async () => {
		const earlierServerTime = Date.now() - 60_000;
		const serverOptOut: OptOutRecord = {
			heldBy: 'device',
			method: 'button',
			recordedAt: earlierServerTime,
			rights: ['sale', 'share'],
		};
		const kernel = kernelOn({
			initialRecords: { now: NOW, subject: { subjectId: SUBJECT } },
			transport: {
				optOut: () =>
					Promise.resolve({
						ok: true,
						optOut: serverOptOut,
						subjectId: SUBJECT,
					}),
			},
		});
		const persistence = createPersistence({ kernel });

		await kernel.commands.optOut();
		await flushMacrotasks();

		expect(kernel.getSnapshot().optOut?.recordedAt).toBe(earlierServerTime);
		const stored = readStoredOptOutRecord(undefined, Date.now());
		expect(stored).toMatchObject({
			ok: true,
			record: { recordedAt: earlierServerTime },
		});
		persistence.dispose();
		kernel.dispose();
	});

	test('automatic GPC record starts with empty rights, sends method gpc once without rights, and applies the server rights', async () => {
		const optOut = vi.fn<NonNullable<KernelTransport['optOut']>>((payload) =>
			Promise.resolve({
				ok: true,
				optOut: {
					heldBy: 'device',
					method: 'gpc',
					recordedAt: payload.givenAt,
					rights: ['sale', 'targeted_ads'],
				},
				subjectId: payload.subjectId,
			})
		);
		const kernel = kernelOn({
			initialLocation: { countryCode: 'US', regionCode: 'CO' },
			initialPrivacySignals: { gpc: true },
			initialRecords: { now: NOW, subject: { subjectId: SUBJECT } },
			transport: { optOut },
		});
		const recordedRights: (readonly string[])[] = [];
		kernel.events.on('opt-out:recorded', ({ optOut: record }) =>
			recordedRights.push([...record.rights])
		);

		await kernel.commands.init();
		expect(recordedRights).toEqual([[]]);
		await vi.waitFor(() => expect(optOut).toHaveBeenCalledTimes(1));
		expect(optOut.mock.calls[0]?.[0]).toMatchObject({
			country: 'US',
			method: 'gpc',
			region: 'CO',
			subjectId: SUBJECT,
		});
		const sentGpc = optOut.mock.calls[0]?.[0];
		expect(sentGpc).toBeDefined();
		expect('rights' in (sentGpc as OptOutPayload)).toBe(false);
		await vi.waitFor(() =>
			expect(kernel.getSnapshot().optOut?.rights).toEqual([
				'sale',
				'targeted_ads',
			])
		);

		// Re-evaluating or toggling GPC does not send again.
		kernel.refresh();
		kernel.set.privacySignals({ gpc: false });
		kernel.set.privacySignals({ gpc: true });
		await flushMacrotasks();
		expect(optOut).toHaveBeenCalledTimes(1);
		kernel.dispose();
	});

	test('with GPC on and a record already held, loading sends no opt-out', async () => {
		const optOut = vi.fn<NonNullable<KernelTransport['optOut']>>();
		const held: OptOutRecord = {
			heldBy: 'device',
			method: 'gpc',
			recordedAt: NOW - 5000,
			rights: ['sale', 'share'],
		};
		const kernel = kernelOn({
			initialPrivacySignals: { gpc: true },
			initialRecords: {
				now: NOW,
				optOut: held,
				subject: { subjectId: SUBJECT },
			},
			transport: { optOut },
		});
		const recorded = vi.fn();
		kernel.events.on('opt-out:recorded', recorded);

		await kernel.commands.init();
		kernel.refresh();
		kernel.replaySaves();
		await flushMacrotasks();

		expect(kernel.getSnapshot().optOut).toEqual(held);
		expect(recorded).not.toHaveBeenCalled();
		expect(optOut).not.toHaveBeenCalled();
		kernel.dispose();
	});

	test('with GPC on and no record left after a lift, the signal records and sends a new opt-out', async () => {
		const optOut = vi.fn<NonNullable<KernelTransport['optOut']>>((payload) =>
			Promise.resolve({ ok: true, subjectId: payload.subjectId })
		);
		const liftOptOut = vi.fn<NonNullable<KernelTransport['liftOptOut']>>(
			(payload) =>
				Promise.resolve({
					ok: true,
					optOut: null,
					subjectId: payload.subjectId,
				})
		);
		const kernel = kernelOn({
			initialRecords: {
				now: NOW,
				optOut: {
					heldBy: 'device',
					method: 'button',
					recordedAt: NOW - 5000,
					rights: ['sale', 'share'],
				},
				subject: { subjectId: SUBJECT },
			},
			transport: { liftOptOut, optOut },
		});
		await kernel.commands.init();

		// The signal is off, so the lift goes through and leaves no record.
		await kernel.commands.optIn();
		expect(kernel.getSnapshot().optOut).toBeNull();
		expect(optOut).not.toHaveBeenCalled();

		// The browser then sends the signal: a new record, sent once as `gpc`.
		kernel.set.privacySignals({ gpc: true });
		expect(kernel.getSnapshot().optOut?.method).toBe('gpc');
		await vi.waitFor(() => expect(optOut).toHaveBeenCalledTimes(1));
		expect(optOut.mock.calls[0]?.[0].method).toBe('gpc');
		kernel.refresh();
		await flushMacrotasks();
		expect(optOut).toHaveBeenCalledTimes(1);
		kernel.dispose();
	});

	test('a refusing save() under an opt-out rule starts with empty rights and sends both the records save and the opt-out without rights', async () => {
		const save = vi.fn<NonNullable<KernelTransport['save']>>((payload) =>
			Promise.resolve({ ok: true, subjectId: payload.subjectId })
		);
		const optOut = vi.fn<NonNullable<KernelTransport['optOut']>>((payload) =>
			Promise.resolve({
				ok: true,
				optOut: {
					heldBy: 'device',
					method: 'button',
					recordedAt: payload.givenAt,
					rights: ['sale', 'share'],
				},
				subjectId: payload.subjectId,
			})
		);
		const kernel = kernelOn({
			consentCategories: [
				'necessary',
				'functionality',
				'experience',
				'measurement',
				'marketing',
			],
			initialRecords: { now: NOW, subject: { subjectId: SUBJECT } },
			transport: { optOut, save },
		});
		const recordedRights: (readonly string[])[] = [];
		kernel.events.on('opt-out:recorded', ({ optOut: record }) =>
			recordedRights.push([...record.rights])
		);

		await kernel.commands.save('none', { uiSource: 'dialog' });
		expect(recordedRights).toEqual([[]]);
		await vi.waitFor(() => expect(optOut).toHaveBeenCalledTimes(1));
		expect(save).toHaveBeenCalledTimes(1);
		expect(optOut.mock.calls[0]?.[0]).toMatchObject({
			country: 'US',
			method: 'button',
			region: 'CA',
			subjectId: SUBJECT,
			uiSource: 'dialog',
		});
		const sentRefusal = optOut.mock.calls[0]?.[0];
		expect(sentRefusal).toBeDefined();
		expect('rights' in (sentRefusal as OptOutPayload)).toBe(false);
		await vi.waitFor(() =>
			expect(kernel.getSnapshot().optOut?.rights).toEqual(['sale', 'share'])
		);
		kernel.dispose();
	});

	test('identify() applies a returned person opt-out, persists across reload, blocks optIn() without token, and clears with token + null answer', async () => {
		const accountOptOut: OptOutRecord = {
			heldBy: 'person',
			method: 'propagated',
			recordedAt: NOW - 1000,
			rights: ['sale', 'share'],
		};
		const liftCalls: LiftOptOutPayload[] = [];
		const transport: KernelTransport = {
			identify: () =>
				Promise.resolve({ optOut: accountOptOut, subjectId: SUBJECT }),
			liftOptOut: (payload) => {
				liftCalls.push(payload);
				return Promise.resolve({
					ok: true,
					optOut: payload.user?.identityToken ? null : accountOptOut,
					subjectId: payload.subjectId,
				});
			},
		};
		const first = kernelOn({
			initialRecords: { now: NOW, subject: { subjectId: SUBJECT } },
			transport,
		});
		const firstPersistence = createPersistence({ kernel: first });

		await first.commands.identify({
			externalId: 'user_123',
			identityToken: 'tok_1',
		});
		await flushMacrotasks();

		expect(first.getSnapshot().optOut).toEqual(accountOptOut);
		expect(first.getSnapshot().effectivePermissions.marketing).toBe(false);
		expect(first.getSnapshot().effectivePermissions.measurement).toBe(false);
		firstPersistence.dispose();
		first.dispose();

		// Reload: persisted opt-out survives and keeps denying.
		const reloaded = kernelOn({ transport });
		const secondPersistence = createPersistence({ kernel: reloaded });
		expect(reloaded.getSnapshot().optOut).toEqual(accountOptOut);
		expect(reloaded.getSnapshot().effectivePermissions.marketing).toBe(false);

		// Without a token, lift answers with person opt-out -> held-by-account.
		const blocked = await reloaded.commands.optIn();
		expect(blocked).toEqual({ ok: false, reason: 'held-by-account' });
		expect(reloaded.getSnapshot().optOut).toEqual(accountOptOut);
		expect(liftCalls).toHaveLength(1);
		expect(liftCalls[0]?.user).toBeNull();

		// With a verifying token and null answer -> clears and emits opt-out:lifted.
		const lifted = vi.fn();
		reloaded.events.on('opt-out:lifted', lifted);
		await reloaded.commands.identify({
			externalId: 'user_123',
			identityToken: 'tok_fresh',
		});
		const cleared = await reloaded.commands.optIn({ uiSource: 'dialog' });
		expect(cleared).toEqual({ ok: true, optOut: null });
		expect(reloaded.getSnapshot().optOut).toBeNull();
		expect(reloaded.getSnapshot().effectivePermissions.marketing).toBe(true);
		expect(lifted).toHaveBeenCalledTimes(1);
		// Emitting opt-out:lifted from account optIn() must not send a second lift.
		await flushMacrotasks();
		expect(liftCalls).toHaveLength(2);
		expect(liftCalls[1]?.user?.identityToken).toBe('tok_fresh');

		secondPersistence.dispose();
		reloaded.dispose();
	});

	test('save() granting marketing while optOut is held by account sends a lift after the save without blocking save()', async () => {
		const accountOptOut: OptOutRecord = {
			heldBy: 'person',
			method: 'api',
			recordedAt: NOW - 1000,
			rights: ['sale', 'share'],
		};
		const liftDeferred = Promise.withResolvers<LiftOptOutTransportResult>();
		const save = vi.fn<NonNullable<KernelTransport['save']>>((payload) =>
			Promise.resolve({ ok: true, subjectId: payload.subjectId })
		);
		const liftOptOut = vi.fn<NonNullable<KernelTransport['liftOptOut']>>(
			() => liftDeferred.promise
		);
		const kernel = kernelOn({
			initialRecords: {
				now: NOW,
				optOut: accountOptOut,
				subject: { subjectId: SUBJECT },
			},
			initialUser: { externalId: 'user_123', identityToken: 'tok_1' },
			transport: { liftOptOut, save },
		});

		const saveResult = await kernel.commands.save({ marketing: true });
		expect(saveResult.ok).toBe(true);
		// Save resolved while lift is still pending.
		expect(kernel.getSnapshot().optOut).toEqual(accountOptOut);
		await vi.waitFor(() => expect(liftOptOut).toHaveBeenCalledTimes(1));

		liftDeferred.resolve({ ok: true, optOut: null, subjectId: SUBJECT });
		await vi.waitFor(() => expect(kernel.getSnapshot().optOut).toBeNull());
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(true);
		kernel.dispose();
	});

	test('a records save answer carrying optOut is applied, and one without it changes nothing', async () => {
		const accountOptOut: OptOutRecord = {
			heldBy: 'person',
			method: 'api',
			recordedAt: NOW + 100,
			rights: ['sale', 'share'],
		};
		let returnOptOut = true;
		const kernel = kernelOn({
			initialRecords: { now: NOW, subject: { subjectId: SUBJECT } },
			transport: {
				save: (payload: SavePayload): Promise<SaveResult> =>
					Promise.resolve(
						returnOptOut
							? {
									ok: true,
									optOut: accountOptOut,
									subjectId: payload.subjectId,
								}
							: { ok: true, subjectId: payload.subjectId }
					),
			},
		});

		await kernel.commands.save({ functionality: true });
		expect(kernel.getSnapshot().optOut).toEqual(accountOptOut);

		returnOptOut = false;
		await kernel.commands.save({ experience: true });
		expect(kernel.getSnapshot().optOut).toEqual(accountOptOut);
		kernel.dispose();
	});

	test('an answer arriving after a newer local act is ignored (opt-out then lift before first answer lands)', async () => {
		const firstAnswer = Promise.withResolvers<OptOutTransportResult>();
		const optOut = vi.fn<NonNullable<KernelTransport['optOut']>>(
			() => firstAnswer.promise
		);
		const liftOptOut = vi.fn<NonNullable<KernelTransport['liftOptOut']>>(
			(payload) =>
				Promise.resolve({
					ok: true,
					optOut: null,
					subjectId: payload.subjectId,
				})
		);
		const kernel = kernelOn({
			initialRecords: { now: NOW, subject: { subjectId: SUBJECT } },
			transport: { liftOptOut, optOut },
		});

		const firstCall = kernel.commands.optOut();
		await vi.waitFor(() => expect(optOut).toHaveBeenCalledTimes(1));

		await kernel.commands.optIn();
		expect(kernel.getSnapshot().optOut).toBeNull();

		firstAnswer.resolve({
			ok: true,
			optOut: {
				heldBy: 'device',
				method: 'button',
				recordedAt: NOW + 9999,
				rights: ['sale', 'share'],
			},
			subjectId: SUBJECT,
		});
		await firstCall;

		// Stale opt-out answer must not overwrite the newer lift.
		expect(kernel.getSnapshot().optOut).toBeNull();
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(true);
		kernel.dispose();
	});

	test('applying an answer sends nothing and emits opt-out:synced instead of opt-out:recorded or opt-out:lifted', async () => {
		const optOutSpy = vi.fn<NonNullable<KernelTransport['optOut']>>();
		const liftSpy = vi.fn<NonNullable<KernelTransport['liftOptOut']>>();
		const recorded = vi.fn();
		const lifted = vi.fn();
		const synced = vi.fn();
		const accountOptOut: OptOutRecord = {
			heldBy: 'person',
			method: 'api',
			recordedAt: NOW + 50,
			rights: ['sale', 'share'],
		};
		const kernel = kernelOn({
			initialRecords: { now: NOW, subject: { subjectId: SUBJECT } },
			transport: {
				identify: () =>
					Promise.resolve({ optOut: accountOptOut, subjectId: SUBJECT }),
				liftOptOut: liftSpy,
				optOut: optOutSpy,
			},
		});
		kernel.events.on('opt-out:recorded', recorded);
		kernel.events.on('opt-out:lifted', lifted);
		kernel.events.on('opt-out:synced', synced);

		await kernel.commands.identify({
			externalId: 'user_123',
			identityToken: 'tok',
		});
		await flushMacrotasks();

		expect(synced).toHaveBeenCalledTimes(1);
		expect(recorded).not.toHaveBeenCalled();
		expect(lifted).not.toHaveBeenCalled();
		expect(optOutSpy).not.toHaveBeenCalled();
		expect(liftSpy).not.toHaveBeenCalled();
		kernel.dispose();
	});

	test('opt-out then lift queued offline replay in order, never store identity tokens, and apply only the last answer', async () => {
		const browserStore = createBrowserOutboxStore();
		const failOptOut = vi
			.fn<NonNullable<KernelTransport['optOut']>>()
			.mockRejectedValue(new Error('offline'));
		const failLift = vi
			.fn<NonNullable<KernelTransport['liftOptOut']>>()
			.mockRejectedValue(new Error('offline'));

		const first = kernelOn(
			{
				initialRecords: { now: NOW, subject: { subjectId: SUBJECT } },
				initialUser: {
					externalId: 'user_123',
					identityToken: 'secret-token-1',
				},
				transport: { liftOptOut: failLift, optOut: failOptOut },
			},
			browserStore
		);

		await first.commands.optOut();
		await first.commands.optIn();
		first.dispose();

		// Stored in its own localStorage slot, without any identityToken.
		const rawStored = window.localStorage.getItem(PENDING_OPT_OUTS_STORAGE_KEY);
		expect(rawStored).toBeTruthy();
		expect(rawStored).not.toContain('secret-token-1');
		expect(await queuedOptOuts(browserStore)).toHaveLength(2);

		const order: string[] = [];
		const seenTokens: (string | undefined)[] = [];
		const synced: (Readonly<OptOutRecord> | null)[] = [];
		const replayed = kernelOn(
			{
				initialRecords: { now: NOW, subject: { subjectId: SUBJECT } },
				initialUser: {
					externalId: 'user_123',
					identityToken: 'fresh-token-2',
				},
				transport: {
					liftOptOut: (payload) => {
						order.push('lift');
						seenTokens.push(payload.user?.identityToken);
						return Promise.resolve({
							ok: true,
							optOut: null,
							subjectId: payload.subjectId,
						});
					},
					optOut: (payload) => {
						order.push('record');
						seenTokens.push(payload.user?.identityToken);
						return Promise.resolve({
							ok: true,
							optOut: {
								heldBy: 'device',
								method: 'button',
								recordedAt: NOW + 1000,
								rights: ['sale', 'share'],
							},
							subjectId: payload.subjectId,
						});
					},
				},
			},
			browserStore
		);
		replayed.events.on('opt-out:synced', ({ optOut }) => synced.push(optOut));

		await replayed.commands.init();
		await vi.waitFor(() => expect(order).toEqual(['record', 'lift']));
		await vi.waitFor(async () =>
			expect(await queuedOptOuts(browserStore)).toEqual([])
		);
		// Replay took the token from the current user.
		expect(seenTokens).toEqual(['fresh-token-2', 'fresh-token-2']);
		// Only the last queued act (lift -> null) applied; record's answer was not applied.
		expect(replayed.getSnapshot().optOut).toBeNull();
		expect(synced).toEqual([]);
		replayed.dispose();
	});

	test('a queued opt-out whose retry is answered after a lift restores nothing', async () => {
		// The backend answers a retry that arrives after the lift with no
		// opt-out: the act is recorded and the device holds none.
		const optOut = vi
			.fn<NonNullable<KernelTransport['optOut']>>()
			.mockRejectedValueOnce(new Error('offline'))
			.mockImplementation((payload) =>
				Promise.resolve({ ok: true, subjectId: payload.subjectId })
			);
		const liftOptOut = vi
			.fn<NonNullable<KernelTransport['liftOptOut']>>()
			.mockImplementation((payload) =>
				Promise.resolve({
					ok: true,
					optOut: null,
					subjectId: payload.subjectId,
				})
			);
		const kernel = kernelOn({
			initialRecords: { now: NOW, subject: { subjectId: SUBJECT } },
			transport: { liftOptOut, optOut },
		});
		const synced: (Readonly<OptOutRecord> | null)[] = [];
		kernel.events.on('opt-out:synced', (event) => synced.push(event.optOut));

		await kernel.commands.optOut();
		expect(await queuedOptOuts()).toHaveLength(1);
		expect(kernel.getSnapshot().optOut).not.toBeNull();

		await kernel.commands.optIn();
		expect(kernel.getSnapshot().optOut).toBeNull();

		kernel.replaySaves();
		await vi.waitFor(async () => expect(await queuedOptOuts()).toEqual([]));

		// The retry carried the first try's key, and its success put nothing back.
		expect(optOut).toHaveBeenCalledTimes(2);
		expect(optOut.mock.calls[1]?.[0].idempotencyKey).toBe(
			optOut.mock.calls[0]?.[0].idempotencyKey
		);
		expect(kernel.getSnapshot().optOut).toBeNull();
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(true);
		expect(synced.filter((record) => record !== null)).toEqual([]);
		kernel.dispose();
	});

	test('clearing records empties the opt-out queue', async () => {
		const browserStore = createBrowserOutboxStore();
		const kernel = kernelOn(
			{
				initialRecords: { now: NOW, subject: { subjectId: SUBJECT } },
				transport: {
					optOut: vi.fn().mockRejectedValue(new Error('offline')),
				},
			},
			browserStore
		);

		await kernel.commands.optOut();
		expect(await queuedOptOuts(browserStore)).toHaveLength(1);
		expect(
			window.localStorage.getItem(PENDING_OPT_OUTS_STORAGE_KEY)
		).toBeTruthy();

		clearKernelRecords(kernel, NOW + 1000);
		expect(
			window.localStorage.getItem(PENDING_OPT_OUTS_STORAGE_KEY)
		).toBeNull();
		expect(await queuedOptOuts(browserStore)).toEqual([]);
		kernel.dispose();
	});

	test('409 subject_conflict moves the visitor to a new subject ID and resends the opt-out', async () => {
		let attempts = 0;
		const stub = stubFetch(() => {
			attempts += 1;
			if (attempts === 1) {
				return v1Error(409, 'subject_conflict');
			}
			const parsed = stub.calls.at(-1)?.body as { subjectId: string };
			return json(200, {
				optOut: {
					heldBy: 'device',
					method: 'button',
					recordedAt: NOW + 300,
					rights: ['sale', 'share'],
				},
				recordId: RECORD,
				subjectId: parsed.subjectId,
			});
		});
		const { calls, fetch } = stub;
		const transport = createV1HostedTransport({
			fetch,
			projectUrl: PROJECT_URL,
			property: 'www.example.com',
		});
		const kernel = kernelOn({
			initialRecords: { now: NOW, subject: { subjectId: SUBJECT } },
			transport: { liftOptOut: transport.liftOptOut, optOut: transport.optOut },
		});

		await kernel.commands.optOut();

		expect(calls).toHaveLength(2);
		const firstSubject = bodyAt(calls, 0).subjectId;
		const secondSubject = bodyAt(calls, 1).subjectId;
		expect(firstSubject).toBe(SUBJECT);
		expect(secondSubject).not.toBe(SUBJECT);
		expect(kernel.getSnapshot().subject?.subjectId).toBe(secondSubject);
		expect(kernel.getSnapshot().optOut?.recordedAt).toBe(NOW + 300);
		expect(await queuedOptOuts()).toEqual([]);
		kernel.dispose();
	});

	test('permanent refusal (400 invalid_request) drops the queued opt-out and warns in development', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const { calls, fetch } = stubFetch(() => v1Error(400, 'invalid_request'));
		const transport = createV1HostedTransport({
			fetch,
			projectUrl: PROJECT_URL,
			property: 'www.example.com',
		});
		const kernel = kernelOn({
			initialRecords: { now: NOW, subject: { subjectId: SUBJECT } },
			transport: { liftOptOut: transport.liftOptOut, optOut: transport.optOut },
		});

		await kernel.commands.optOut();

		expect(calls).toHaveLength(1);
		expect(await queuedOptOuts()).toEqual([]);
		expect(warn).toHaveBeenCalled();
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
		kernel.dispose();
	});
});
