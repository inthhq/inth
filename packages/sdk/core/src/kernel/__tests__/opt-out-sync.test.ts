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
	optInRule,
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

const withRefusedPendingOptOutsWrite = async (
	run: () => Promise<void>
): Promise<void> => {
	const spy = vi.spyOn(window.localStorage, 'setItem');
	const original = spy.getMockImplementation();
	spy.mockImplementation((key: string, value: string) => {
		if (key === PENDING_OPT_OUTS_STORAGE_KEY) {
			throw new DOMException('full', 'QuotaExceededError');
		}
		original?.(key, value);
	});
	try {
		await run();
	} finally {
		if (original) {
			spy.mockImplementation(original);
		} else {
			spy.mockRestore();
		}
	}
};

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

		// Re-evaluating or changing unrelated state does not send again.
		kernel.refresh();
		kernel.set.language('fr');
		await flushMacrotasks();
		expect(optOut).toHaveBeenCalledTimes(1);

		// Turning GPC off clears the local mark; turning it back on sends one
		// new request without emitting another opt-out:recorded.
		kernel.set.privacySignals({ gpc: false });
		await flushMacrotasks();
		expect(optOut).toHaveBeenCalledTimes(1);

		kernel.set.privacySignals({ gpc: true });
		await vi.waitFor(() => expect(optOut).toHaveBeenCalledTimes(2));
		expect(optOut.mock.calls[1]?.[0].method).toBe('gpc');
		expect(recordedRights).toEqual([[]]);
		kernel.dispose();
	});

	test('with GPC on and an unmarked gpc record held (pre-upgrade), first load sends one gpc request and a reload sends none', async () => {
		const optOut = vi.fn<NonNullable<KernelTransport['optOut']>>((payload) =>
			Promise.resolve({
				ok: true,
				optOut: {
					heldBy: 'device',
					method: 'gpc',
					recordedAt: NOW - 5000,
					rights: ['sale', 'share'],
				},
				subjectId: payload.subjectId,
			})
		);
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
		const persistence = createPersistence({ kernel, skipHydration: true });
		const recorded = vi.fn();
		kernel.events.on('opt-out:recorded', recorded);

		await kernel.commands.init();
		await vi.waitFor(() => expect(optOut).toHaveBeenCalledTimes(1));
		const firstCall = optOut.mock.calls[0]?.[0];
		expect(firstCall?.method).toBe('gpc');
		expect(firstCall).toBeDefined();
		expect('rights' in (firstCall as OptOutPayload)).toBe(false);
		kernel.refresh();
		kernel.replaySaves();
		await flushMacrotasks();

		expect(kernel.getSnapshot().optOut).toEqual(held);
		expect(recorded).not.toHaveBeenCalled();
		expect(optOut).toHaveBeenCalledTimes(1);
		persistence.dispose();
		kernel.dispose();

		// Reload over the same storage reads the stored mark and sends nothing.
		const reloaded = kernelOn({
			initialPrivacySignals: { gpc: true },
			transport: { optOut },
		});
		const reloadedPersistence = createPersistence({ kernel: reloaded });
		await reloaded.commands.init();
		reloaded.refresh();
		reloaded.replaySaves();
		await flushMacrotasks();

		expect(reloaded.getSnapshot().optOut).toEqual(held);
		expect(optOut).toHaveBeenCalledTimes(1);
		reloadedPersistence.dispose();
		reloaded.dispose();

		// A kernel seeded with optOutGpcReported: true sends no opt-out at load.
		const seeded = kernelOn({
			initialPrivacySignals: { gpc: true },
			initialRecords: {
				now: NOW,
				optOut: held,
				optOutGpcReported: true,
				subject: { subjectId: SUBJECT },
			},
			transport: { optOut },
		});
		await seeded.commands.init();
		await flushMacrotasks();
		expect(optOut).toHaveBeenCalledTimes(1);
		seeded.dispose();

		// A non-live kernel (server render) never sends or sets the mark.
		const serverKernel = kernelOn({
			initialPrivacySignals: { gpc: true },
			initialRecords: {
				now: NOW,
				optOut: held,
				subject: { subjectId: SUBJECT },
			},
			transport: { optOut },
		});
		await flushMacrotasks();
		expect(optOut).toHaveBeenCalledTimes(1);
		expect(serverKernel.isOptOutGpcReported()).toBe(false);
		serverKernel.dispose();
	});

	test('click then signal sends one gpc opt-out without changing snapshot.optOut or emitting opt-out:recorded, and reload sends none', async () => {
		const optOut = vi.fn<NonNullable<KernelTransport['optOut']>>((payload) =>
			Promise.resolve({
				ok: true,
				optOut: {
					heldBy: 'device',
					method: payload.method,
					recordedAt: payload.givenAt,
					rights: ['sale', 'share'],
				},
				subjectId: payload.subjectId,
			})
		);
		const first = kernelOn({
			initialRecords: { now: NOW, subject: { subjectId: SUBJECT } },
			transport: { optOut },
		});
		const firstPersistence = createPersistence({ kernel: first });
		const recorded = vi.fn();
		first.events.on('opt-out:recorded', recorded);

		await first.commands.init();
		await first.commands.optOut();
		await vi.waitFor(() => expect(optOut).toHaveBeenCalledTimes(1));
		expect(optOut.mock.calls[0]?.[0].method).toBe('button');
		expect(recorded).toHaveBeenCalledTimes(1);
		const beforeSignal = first.getSnapshot().optOut;

		// Turning GPC on sends one gpc request without recording a new local opt-out.
		first.set.privacySignals({ gpc: true });
		expect(first.getSnapshot().optOut).toBe(beforeSignal);
		expect(recorded).toHaveBeenCalledTimes(1);

		await vi.waitFor(() => expect(optOut).toHaveBeenCalledTimes(2));
		const gpcPayload = optOut.mock.calls[1]?.[0] as OptOutPayload;
		expect(gpcPayload).toMatchObject({
			country: 'US',
			method: 'gpc',
			policySnapshotToken: 'snapshot-token',
			region: 'CA',
			subjectId: SUBJECT,
		});
		expect(gpcPayload.idempotencyKey).toMatch(V1_UUID_PATTERN);
		expect(gpcPayload.idempotencyKey).not.toBe(
			optOut.mock.calls[0]?.[0].idempotencyKey
		);
		expect('rights' in gpcPayload).toBe(false);

		first.refresh();
		first.set.language('fr');
		await flushMacrotasks();
		expect(optOut).toHaveBeenCalledTimes(2);
		firstPersistence.dispose();
		first.dispose();

		// Reload over the same storage and queue store sends nothing.
		const reloaded = kernelOn({
			initialPrivacySignals: { gpc: true },
			transport: { optOut },
		});
		const secondPersistence = createPersistence({ kernel: reloaded });
		await reloaded.commands.init();
		reloaded.refresh();
		await flushMacrotasks();

		expect(optOut).toHaveBeenCalledTimes(2);
		secondPersistence.dispose();
		reloaded.dispose();
	});

	test('a browser whose own GPC flag turns on reports it once for a clicked opt-out and not again on later loads', async () => {
		// The signal comes from `navigator.globalPrivacyControl`, read when the
		// kernel starts, as it does in a page with no server-resolved signal.
		const previous = Object.getOwnPropertyDescriptor(
			navigator,
			'globalPrivacyControl'
		);
		const setBrowserSignal = (value: boolean) =>
			Object.defineProperty(navigator, 'globalPrivacyControl', {
				configurable: true,
				value,
			});
		const optOut = vi.fn<NonNullable<KernelTransport['optOut']>>((payload) =>
			Promise.resolve({ ok: true, subjectId: payload.subjectId })
		);
		const load = async () => {
			const kernel = kernelOn({ transport: { optOut } });
			const persistence = createPersistence({ kernel });
			await kernel.commands.init();
			return {
				kernel,
				unload: () => {
					persistence.dispose();
					kernel.dispose();
				},
			};
		};
		try {
			// The visitor clicks the link while the browser sends no signal.
			setBrowserSignal(false);
			const clicked = await load();
			await clicked.kernel.commands.optOut();
			await vi.waitFor(() => expect(optOut).toHaveBeenCalledTimes(1));
			expect(optOut.mock.calls[0]?.[0].method).toBe('button');
			await vi.waitFor(() =>
				expect(readStoredOptOutRecord(undefined, NOW)).toMatchObject({
					record: { method: 'button' },
				})
			);
			clicked.unload();

			// They turn the signal on. The next load reports it once.
			setBrowserSignal(true);
			const signalled = await load();
			expect(signalled.kernel.getSnapshot().privacySignals.gpc.active).toBe(
				true
			);
			await vi.waitFor(() => expect(optOut).toHaveBeenCalledTimes(2));
			expect(optOut.mock.calls[1]?.[0].method).toBe('gpc');
			expect(signalled.kernel.getSnapshot().optOut?.method).toBe('button');
			await vi.waitFor(() =>
				expect(readStoredOptOutRecord(undefined, NOW)).toMatchObject({
					record: { gpcReported: true, method: 'button' },
				})
			);
			signalled.unload();

			for (let visit = 0; visit < 2; visit += 1) {
				// oxlint-disable-next-line no-await-in-loop -- Each load follows the last.
				const next = await load();
				next.kernel.refresh();
				// oxlint-disable-next-line no-await-in-loop -- Each load follows the last.
				await flushMacrotasks();
				expect(next.kernel.getSnapshot().optOut?.method).toBe('button');
				next.unload();
			}
			expect(optOut).toHaveBeenCalledTimes(2);
		} finally {
			if (previous) {
				Object.defineProperty(navigator, 'globalPrivacyControl', previous);
			} else {
				Reflect.deleteProperty(navigator, 'globalPrivacyControl');
			}
		}
	});

	test('account-held propagated opt-out with GPC on sends one gpc request, keeps the mark across a propagated/both answer, and reload sends none', async () => {
		const personOptOut: OptOutRecord = {
			heldBy: 'person',
			method: 'propagated',
			recordedAt: NOW - 5000,
			rights: ['sale', 'share'],
		};
		const bothOptOut: OptOutRecord = {
			heldBy: 'both',
			method: 'propagated',
			recordedAt: NOW - 5000,
			rights: ['sale', 'share'],
		};
		const optOut = vi.fn<NonNullable<KernelTransport['optOut']>>((payload) =>
			Promise.resolve({
				ok: true,
				optOut: bothOptOut,
				subjectId: payload.subjectId,
			})
		);
		const first = kernelOn({
			initialPrivacySignals: { gpc: true },
			initialRecords: {
				now: NOW,
				optOut: personOptOut,
				subject: { subjectId: SUBJECT },
			},
			transport: { optOut },
		});
		const firstPersistence = createPersistence({
			kernel: first,
			skipHydration: true,
		});
		const recorded = vi.fn();
		const synced: (Readonly<OptOutRecord> | null)[] = [];
		first.events.on('opt-out:recorded', recorded);
		first.events.on('opt-out:synced', ({ optOut: next }) => synced.push(next));

		await first.commands.init();
		await vi.waitFor(() => expect(optOut).toHaveBeenCalledTimes(1));
		const sentAccountGpc = optOut.mock.calls[0]?.[0];
		expect(sentAccountGpc).toMatchObject({
			method: 'gpc',
			policySnapshotToken: 'snapshot-token',
			subjectId: SUBJECT,
		});
		expect(sentAccountGpc).toBeDefined();
		expect('rights' in (sentAccountGpc as OptOutPayload)).toBe(false);
		expect(recorded).not.toHaveBeenCalled();

		await vi.waitFor(() =>
			expect(first.getSnapshot().optOut).toEqual(bothOptOut)
		);
		expect(synced).toEqual([bothOptOut]);
		await flushMacrotasks();
		expect(optOut).toHaveBeenCalledTimes(1);
		firstPersistence.dispose();
		first.dispose();

		// Reload sees method=propagated, heldBy=both, and the stored mark stops a second send.
		const reloaded = kernelOn({
			initialPrivacySignals: { gpc: true },
			transport: { optOut },
		});
		const secondPersistence = createPersistence({ kernel: reloaded });
		expect(reloaded.getSnapshot().optOut).toEqual(bothOptOut);

		await reloaded.commands.init();
		reloaded.refresh();
		await flushMacrotasks();
		expect(optOut).toHaveBeenCalledTimes(1);
		secondPersistence.dispose();
		reloaded.dispose();
	});

	test('with a held record and GPC off, loading and refreshing send nothing', async () => {
		const optOut = vi.fn<NonNullable<KernelTransport['optOut']>>();
		const held: OptOutRecord = {
			heldBy: 'person',
			method: 'propagated',
			recordedAt: NOW - 5000,
			rights: ['sale', 'share'],
		};
		const kernel = kernelOn({
			initialRecords: {
				now: NOW,
				optOut: held,
				subject: { subjectId: SUBJECT },
			},
			transport: { optOut },
		});

		await kernel.commands.init();
		kernel.refresh();
		await flushMacrotasks();

		expect(optOut).not.toHaveBeenCalled();
		expect(kernel.getSnapshot().optOut).toEqual(held);
		kernel.dispose();
	});

	test('after GPC goes off and comes back on for a held record, one new gpc request is sent', async () => {
		const optOut = vi.fn<NonNullable<KernelTransport['optOut']>>((payload) =>
			Promise.resolve({
				ok: true,
				optOut: {
					heldBy: 'device',
					method: 'button',
					recordedAt: NOW - 5000,
					rights: ['sale', 'share'],
				},
				subjectId: payload.subjectId,
			})
		);
		const held: OptOutRecord = {
			heldBy: 'device',
			method: 'button',
			recordedAt: NOW - 5000,
			rights: ['sale', 'share'],
		};
		const kernel = kernelOn({
			initialRecords: {
				now: NOW,
				optOut: held,
				subject: { subjectId: SUBJECT },
			},
			transport: { optOut },
		});
		const persistence = createPersistence({ kernel, skipHydration: true });
		const recorded = vi.fn();
		kernel.events.on('opt-out:recorded', recorded);

		await kernel.commands.init();
		expect(optOut).not.toHaveBeenCalled();

		// Signal turns on: one gpc request.
		kernel.set.privacySignals({ gpc: true });
		await vi.waitFor(() => expect(optOut).toHaveBeenCalledTimes(1));
		const firstKey = optOut.mock.calls[0]?.[0].idempotencyKey;

		// Signal goes off: no request, mark cleared in memory and storage.
		kernel.set.privacySignals({ gpc: false });
		await flushMacrotasks();
		expect(optOut).toHaveBeenCalledTimes(1);

		// Signal comes back on: one new gpc request with a new idempotency key.
		kernel.set.privacySignals({ gpc: true });
		await vi.waitFor(() => expect(optOut).toHaveBeenCalledTimes(2));
		expect(optOut.mock.calls[1]?.[0].method).toBe('gpc');
		expect(optOut.mock.calls[1]?.[0].idempotencyKey).not.toBe(firstKey);
		expect(recorded).not.toHaveBeenCalled();

		// Turn off and reload with GPC on: cleared mark in storage triggers one new request.
		kernel.set.privacySignals({ gpc: false });
		await flushMacrotasks();
		persistence.dispose();
		kernel.dispose();

		const reloaded = kernelOn({
			initialPrivacySignals: { gpc: true },
			transport: { optOut },
		});
		const reloadedPersistence = createPersistence({ kernel: reloaded });
		await reloaded.commands.init();
		await vi.waitFor(() => expect(optOut).toHaveBeenCalledTimes(3));
		expect(optOut.mock.calls[2]?.[0].method).toBe('gpc');
		reloadedPersistence.dispose();
		reloaded.dispose();
	});

	test('a 404 backend and a transport without optOut send nothing for a held record when GPC activates', async () => {
		const consoleError = vi
			.spyOn(console, 'error')
			.mockImplementation(() => undefined);
		const consoleWarn = vi
			.spyOn(console, 'warn')
			.mockImplementation(() => undefined);

		// Transport without optOut sends and queues nothing.
		const noOptOutKernel = kernelOn({
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
			transport: {
				save: (payload) =>
					Promise.resolve({ ok: true, subjectId: payload.subjectId }),
			},
		});
		await noOptOutKernel.commands.init();
		noOptOutKernel.set.privacySignals({ gpc: true });
		await flushMacrotasks();
		expect(await queuedOptOuts()).toEqual([]);
		noOptOutKernel.dispose();

		// Backend that answered 404 on an earlier optOut() gets no request when GPC activates.
		const { calls, fetch } = stubFetch(() => v1Error(404, 'not_found'));
		const transport = createV1HostedTransport({
			fetch,
			projectUrl: PROJECT_URL,
			property: 'www.example.com',
		});
		const unsupportedKernel = kernelOn({
			initialRecords: { now: NOW, subject: { subjectId: SUBJECT } },
			transport: {
				liftOptOut: transport.liftOptOut,
				optOut: transport.optOut,
			},
		});
		await unsupportedKernel.commands.init();
		await unsupportedKernel.commands.optOut();
		expect(calls).toHaveLength(1);

		unsupportedKernel.set.privacySignals({ gpc: true });
		await flushMacrotasks();
		expect(calls).toHaveLength(1);
		expect(await queuedOptOuts()).toEqual([]);
		expect(consoleError).not.toHaveBeenCalled();
		expect(consoleWarn).not.toHaveBeenCalled();
		unsupportedKernel.dispose();

		// If the held-record GPC request itself gets 404, no error is logged and off-then-on sends nothing more.
		const direct404 = stubFetch(() => v1Error(404, 'not_found'));
		const directTransport = createV1HostedTransport({
			fetch: direct404.fetch,
			projectUrl: PROJECT_URL,
			property: 'www.example.com',
		});
		const directKernel = kernelOn({
			initialPrivacySignals: { gpc: true },
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
			transport: {
				liftOptOut: directTransport.liftOptOut,
				optOut: directTransport.optOut,
			},
		});
		await directKernel.commands.init();
		await vi.waitFor(() => expect(direct404.calls).toHaveLength(1));
		await flushMacrotasks();

		directKernel.set.privacySignals({ gpc: false });
		directKernel.set.privacySignals({ gpc: true });
		await flushMacrotasks();
		expect(direct404.calls).toHaveLength(1);
		expect(await queuedOptOuts()).toEqual([]);
		expect(consoleError).not.toHaveBeenCalled();
		expect(consoleWarn).not.toHaveBeenCalled();
		directKernel.dispose();
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

	test('refusing marketing and granting measurement in one save keeps measurement permitted after the server replaces recordedAt with a later timestamp', async () => {
		const serverRecordedAt = Date.now() + 60_000;
		const save = vi.fn<NonNullable<KernelTransport['save']>>((payload) =>
			Promise.resolve({ ok: true, subjectId: payload.subjectId })
		);
		const optOut = vi.fn<NonNullable<KernelTransport['optOut']>>((payload) =>
			Promise.resolve({
				ok: true,
				optOut: {
					heldBy: 'device',
					method: 'button',
					recordedAt: serverRecordedAt,
					rights: ['sale', 'share'],
				},
				subjectId: payload.subjectId,
			})
		);
		const kernel = kernelOn({
			initialRecords: { now: NOW, subject: { subjectId: SUBJECT } },
			transport: { optOut, save },
		});

		await kernel.commands.save({ marketing: false, measurement: true });
		expect(kernel.getSnapshot().optOut).not.toBeNull();
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
		expect(kernel.getSnapshot().effectivePermissions.measurement).toBe(true);

		await vi.waitFor(() =>
			expect(kernel.getSnapshot().optOut?.recordedAt).toBe(serverRecordedAt)
		);
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
		expect(kernel.getSnapshot().effectivePermissions.measurement).toBe(true);
		expect(kernel.getSnapshot().restrictions).toEqual({
			marketing: ['explicit-denial', 'opt-out'],
		});
		kernel.dispose();
	});

	test('under an opt-in rule, granting marketing lifts a held opt-out and sends one lift request; refusing marketing sends none', async () => {
		const save = vi.fn<NonNullable<KernelTransport['save']>>((payload) =>
			Promise.resolve({ ok: true, subjectId: payload.subjectId })
		);
		const optOut = vi.fn<NonNullable<KernelTransport['optOut']>>();
		const liftOptOut = vi.fn<NonNullable<KernelTransport['liftOptOut']>>(
			(payload) =>
				Promise.resolve({
					ok: true,
					optOut: null,
					subjectId: payload.subjectId,
				})
		);
		const kernel = kernelOn({
			initialPolicyResolution: matchedResolution(optInRule()),
			initialRecords: {
				now: NOW,
				optOut: {
					heldBy: 'device',
					method: 'button',
					recordedAt: NOW - 1000,
					rights: ['sale', 'share'],
				},
				subject: { subjectId: SUBJECT },
			},
			transport: { liftOptOut, optOut, save },
		});

		await kernel.commands.save({ marketing: true });
		await vi.waitFor(() => expect(liftOptOut).toHaveBeenCalledTimes(1));
		expect(kernel.getSnapshot().optOut).toBeNull();
		expect(liftOptOut.mock.calls[0]?.[0].policySnapshotToken).toBe(
			'snapshot-token'
		);

		await kernel.commands.save({ marketing: false });
		await flushMacrotasks();
		expect(kernel.getSnapshot().optOut).toBeNull();
		expect(optOut).not.toHaveBeenCalled();
		kernel.dispose();
	});

	test.each([
		['person', 'optIn'],
		['person', 'save'],
		['both', 'optIn'],
		['both', 'save'],
	] as const)(
		'clearing an account-held opt-out (heldBy=%s) via %s when the lift answers null clears snapshot and storage',
		async (heldBy, action) => {
			const accountOptOut: OptOutRecord = {
				heldBy,
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
						optOut: null,
						subjectId: payload.subjectId,
					});
				},
				save: (payload) =>
					Promise.resolve({ ok: true, subjectId: payload.subjectId }),
			};
			const kernel = kernelOn({
				initialRecords: { now: NOW, subject: { subjectId: SUBJECT } },
				transport,
			});
			const persistence = createPersistence({ kernel });

			await kernel.commands.identify({
				externalId: 'user_123',
				identityToken: 'tok_verified',
			});
			await flushMacrotasks();
			expect(kernel.getSnapshot().optOut).toEqual(accountOptOut);
			expect(readStoredOptOutRecord(undefined, Date.now())?.ok).toBe(true);

			const actionResult =
				action === 'optIn'
					? await kernel.commands.optIn({ uiSource: 'dialog' })
					: await kernel.commands.save({ marketing: true });
			expect(actionResult.ok).toBe(true);
			await vi.waitFor(() => expect(kernel.getSnapshot().optOut).toBeNull());
			await flushMacrotasks();

			expect(liftCalls).toHaveLength(1);
			expect(liftCalls[0]?.user?.identityToken).toBe('tok_verified');
			expect(liftCalls[0]?.policySnapshotToken).toBe('snapshot-token');
			expect(kernel.getSnapshot().optOut).toBeNull();
			expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(true);
			expect(readStoredOptOutRecord(undefined, Date.now())).toBeNull();

			persistence.dispose();
			kernel.dispose();

			// Reload confirms storage stays clear.
			const reloaded = kernelOn({ transport });
			const secondPersistence = createPersistence({ kernel: reloaded });
			expect(reloaded.getSnapshot().optOut).toBeNull();
			expect(reloaded.getSnapshot().effectivePermissions.marketing).toBe(true);
			secondPersistence.dispose();
			reloaded.dispose();
		}
	);

	test('lift sends policySnapshotToken when held, omits it when absent, and preserves it on queued replay', async () => {
		const { calls, fetch } = stubFetch(() =>
			json(200, { optOut: null, recordId: RECORD, subjectId: SUBJECT })
		);
		const transport = createV1HostedTransport({
			fetch,
			projectUrl: PROJECT_URL,
			property: 'www.example.com',
		});

		const withToken = kernelOn({
			initialPolicySnapshotToken: 'lift-token-1',
			initialRecords: {
				now: NOW,
				optOut: {
					heldBy: 'device',
					method: 'button',
					recordedAt: NOW - 1000,
					rights: ['sale', 'share'],
				},
				subject: { subjectId: SUBJECT },
			},
			transport: { liftOptOut: transport.liftOptOut },
		});
		await withToken.commands.optIn();
		expect(calls).toHaveLength(1);
		expect(bodyAt(calls, 0).policySnapshotToken).toBe('lift-token-1');
		withToken.dispose();

		const withoutToken = kernelOn({
			initialPolicySnapshotToken: undefined,
			initialRecords: {
				now: NOW,
				optOut: {
					heldBy: 'device',
					method: 'button',
					recordedAt: NOW - 1000,
					rights: ['sale', 'share'],
				},
				subject: { subjectId: SUBJECT },
			},
			transport: { liftOptOut: transport.liftOptOut },
		});
		await withoutToken.commands.optIn();
		expect(calls).toHaveLength(2);
		expect('policySnapshotToken' in bodyAt(calls, 1)).toBe(false);
		withoutToken.dispose();

		// Queued lift preserves policySnapshotToken across reload and replay.
		const browserStore = createBrowserOutboxStore();
		const failLift = vi
			.fn<NonNullable<KernelTransport['liftOptOut']>>()
			.mockRejectedValue(new Error('offline'));
		const first = kernelOn(
			{
				initialPolicySnapshotToken: 'queued-lift-token',
				initialRecords: {
					now: NOW,
					optOut: {
						heldBy: 'device',
						method: 'button',
						recordedAt: NOW - 1000,
						rights: ['sale', 'share'],
					},
					subject: { subjectId: SUBJECT },
				},
				transport: { liftOptOut: failLift },
			},
			browserStore
		);
		await first.commands.optIn();
		expect(await queuedOptOuts(browserStore)).toHaveLength(1);
		first.dispose();

		const replayed: LiftOptOutPayload[] = [];
		const second = kernelOn(
			{
				initialPolicySnapshotToken: 'newer-token-ignored-by-replay',
				initialRecords: { now: NOW, subject: { subjectId: SUBJECT } },
				transport: {
					liftOptOut: (payload) => {
						replayed.push(payload);
						return Promise.resolve({
							ok: true,
							optOut: null,
							subjectId: payload.subjectId,
						});
					},
				},
			},
			browserStore
		);
		await second.commands.init();
		await vi.waitFor(() => expect(replayed).toHaveLength(1));
		expect(replayed[0]?.policySnapshotToken).toBe('queued-lift-token');
		expect(await queuedOptOuts(browserStore)).toEqual([]);
		second.dispose();
	});

	test.each(['optIn', 'save'] as const)(
		'a failed account lift from %s stays queued without its token, replays on the next page with the same key, and clears the record on a null answer',
		async (action) => {
			const browserStore = createBrowserOutboxStore();
			const accountOptOut: OptOutRecord = {
				heldBy: 'person',
				method: 'api',
				recordedAt: NOW - 1000,
				rights: ['sale', 'share'],
			};
			const failedKeys: string[] = [];
			const failLift = vi.fn<NonNullable<KernelTransport['liftOptOut']>>(
				(payload) => {
					failedKeys.push(payload.idempotencyKey);
					return Promise.reject(new Error('offline'));
				}
			);
			const first = kernelOn(
				{
					initialRecords: {
						now: NOW,
						optOut: accountOptOut,
						subject: { subjectId: SUBJECT },
					},
					initialUser: {
						externalId: 'user_123',
						identityProvider: 'clerk',
						identityToken: 'secret-first-token',
					},
					transport: {
						liftOptOut: failLift,
						save: (payload) =>
							Promise.resolve({ ok: true, subjectId: payload.subjectId }),
					},
				},
				browserStore
			);
			const firstPersistence = createPersistence({
				kernel: first,
				skipHydration: true,
			});

			const actionResult =
				action === 'optIn'
					? await first.commands.optIn({ uiSource: 'dialog' })
					: await first.commands.save(
							{ marketing: true },
							{ uiSource: 'dialog' }
						);
			expect(actionResult).toMatchObject(
				action === 'optIn'
					? { ok: false, reason: 'held-by-account' }
					: { ok: true }
			);
			await vi.waitFor(() => expect(failLift).toHaveBeenCalledTimes(1));

			expect(first.getSnapshot().optOut).toEqual(accountOptOut);
			expect(failedKeys).toHaveLength(1);
			await vi.waitFor(async () =>
				expect(await queuedOptOuts(browserStore)).toHaveLength(1)
			);
			const rawStored = window.localStorage.getItem(
				PENDING_OPT_OUTS_STORAGE_KEY
			);
			expect(rawStored).toBeTruthy();
			expect(rawStored).not.toContain('secret-first-token');
			const queued = await queuedOptOuts(browserStore);
			expect(queued[0]?.kind).toBe('lift');
			expect(queued[0]?.idempotencyKey).toBe(failedKeys[0]);
			firstPersistence.dispose();
			first.dispose();

			// Next page with the same user and a fresh token replays the lift with
			// the same idempotency key; a null answer clears the account opt-out.
			const replayed: LiftOptOutPayload[] = [];
			const synced: (Readonly<OptOutRecord> | null)[] = [];
			const second = kernelOn(
				{
					initialRecords: {
						now: NOW,
						optOut: accountOptOut,
						subject: { subjectId: SUBJECT },
					},
					initialUser: {
						externalId: 'user_123',
						identityProvider: 'clerk',
						identityToken: 'fresh-replay-token',
					},
					transport: {
						liftOptOut: (payload) => {
							replayed.push(payload);
							return Promise.resolve({
								ok: true,
								optOut: null,
								subjectId: payload.subjectId,
							});
						},
					},
				},
				browserStore
			);
			second.events.on('opt-out:synced', ({ optOut }) => synced.push(optOut));

			await second.commands.init();
			await vi.waitFor(() => expect(replayed).toHaveLength(1));
			await vi.waitFor(async () =>
				expect(await queuedOptOuts(browserStore)).toEqual([])
			);
			expect(replayed[0]?.idempotencyKey).toBe(failedKeys[0]);
			expect(replayed[0]?.user?.identityToken).toBe('fresh-replay-token');
			expect(second.getSnapshot().optOut).toBeNull();
			expect(second.getSnapshot().effectivePermissions.marketing).toBe(true);
			expect(synced).toEqual([null]);
			second.dispose();
		}
	);

	test('replaying a queued account lift never attaches a different user token and drops a permanently refused lift', async () => {
		const accountOptOut: OptOutRecord = {
			heldBy: 'person',
			method: 'api',
			recordedAt: NOW - 1000,
			rights: ['sale', 'share'],
		};
		const first = kernelOn({
			initialRecords: {
				now: NOW,
				optOut: accountOptOut,
				subject: { subjectId: SUBJECT },
			},
			initialUser: {
				externalId: 'user_123',
				identityProvider: 'clerk',
				identityToken: 'tok_user_123',
			},
			transport: {
				liftOptOut: vi.fn().mockRejectedValue(new Error('offline')),
			},
		});

		const failed = await first.commands.optIn();
		expect(failed).toEqual({ ok: false, reason: 'held-by-account' });
		expect(await queuedOptOuts()).toHaveLength(1);
		first.dispose();

		// A different user must not supply their identity token to user_123's queued lift.
		const replayed: LiftOptOutPayload[] = [];
		const otherUser = kernelOn({
			initialRecords: {
				now: NOW,
				optOut: accountOptOut,
				subject: { subjectId: SUBJECT },
			},
			initialUser: {
				externalId: 'user_999',
				identityProvider: 'clerk',
				identityToken: 'tok_other_user',
			},
			transport: {
				liftOptOut: (payload) => {
					replayed.push(payload);
					return Promise.resolve({
						ok: true,
						optOut: accountOptOut,
						subjectId: payload.subjectId,
					});
				},
			},
		});
		await otherUser.commands.init();
		await vi.waitFor(() => expect(replayed).toHaveLength(1));
		expect(replayed[0]?.user?.externalId).toBe('user_123');
		expect(replayed[0]?.user?.identityToken).toBeUndefined();
		expect(await queuedOptOuts()).toEqual([]);
		otherUser.dispose();

		// A permanently rejected account lift (400 invalid_request) is dropped from the queue.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const { fetch } = stubFetch(() => v1Error(400, 'invalid_request'));
		const transport = createV1HostedTransport({
			fetch,
			projectUrl: PROJECT_URL,
			property: 'www.example.com',
		});
		const rejected = kernelOn({
			initialRecords: {
				now: NOW,
				optOut: accountOptOut,
				subject: { subjectId: SUBJECT },
			},
			initialUser: { externalId: 'user_123', identityToken: 'tok_user_123' },
			transport: { liftOptOut: transport.liftOptOut },
		});
		const rejectedResult = await rejected.commands.optIn();
		expect(rejectedResult).toEqual({ ok: false, reason: 'held-by-account' });
		expect(await queuedOptOuts()).toEqual([]);
		expect(warn).toHaveBeenCalled();
		rejected.dispose();
	});

	test('an answered account lift that remains held-by-account removes itself from the queue', async () => {
		const accountOptOut: OptOutRecord = {
			heldBy: 'person',
			method: 'api',
			recordedAt: NOW - 1000,
			rights: ['sale', 'share'],
		};
		const kernel = kernelOn({
			initialRecords: {
				now: NOW,
				optOut: accountOptOut,
				subject: { subjectId: SUBJECT },
			},
			transport: {
				liftOptOut: (payload) =>
					Promise.resolve({
						ok: true,
						optOut: accountOptOut,
						subjectId: payload.subjectId,
					}),
			},
		});

		const result = await kernel.commands.optIn();
		expect(result).toEqual({ ok: false, reason: 'held-by-account' });
		expect(await queuedOptOuts()).toEqual([]);
		kernel.dispose();
	});

	test('when the outbox refuses to store a held-record GPC report, no report mark is persisted and the next working load sends it once', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const okOptOut = vi.fn<NonNullable<KernelTransport['optOut']>>((payload) =>
			Promise.resolve({
				ok: true,
				optOut: {
					heldBy: 'device',
					method: payload.method,
					recordedAt: payload.givenAt,
					rights: ['sale', 'share'],
				},
				subjectId: payload.subjectId,
			})
		);

		// Visitor clicks opt-out while GPC is off.
		const clicked = kernelOn(
			{
				initialRecords: { now: NOW, subject: { subjectId: SUBJECT } },
				transport: { optOut: okOptOut },
			},
			createBrowserOutboxStore()
		);
		const clickedPersistence = createPersistence({ kernel: clicked });
		await clicked.commands.init();
		await clicked.commands.optOut();
		await vi.waitFor(() => expect(okOptOut).toHaveBeenCalledTimes(1));
		await flushMacrotasks();
		clickedPersistence.dispose();
		clicked.dispose();

		// Next load has GPC on, but localStorage refuses the pending opt-outs key
		// and the request fails before delivery.
		await withRefusedPendingOptOutsWrite(async () => {
			const offlineOptOut = vi
				.fn<NonNullable<KernelTransport['optOut']>>()
				.mockRejectedValue(new Error('offline'));
			const refused = kernelOn(
				{
					initialPrivacySignals: { gpc: true },
					transport: { optOut: offlineOptOut },
				},
				createBrowserOutboxStore()
			);
			const refusedPersistence = createPersistence({ kernel: refused });
			await refused.commands.init();
			await vi.waitFor(() => expect(offlineOptOut).toHaveBeenCalledTimes(1));
			// Unrelated commits on this page must not retry in a loop.
			refused.refresh();
			refused.set.language('fr');
			await flushMacrotasks();

			expect(offlineOptOut).toHaveBeenCalledTimes(1);
			expect(refused.isOptOutGpcReported()).toBe(false);
			expect(
				window.localStorage.getItem(PENDING_OPT_OUTS_STORAGE_KEY)
			).toBeNull();
			const storedAfterRefusal = readStoredOptOutRecord(undefined, Date.now());
			expect(storedAfterRefusal).toMatchObject({
				ok: true,
				record: { method: 'button' },
			});
			expect(
				storedAfterRefusal?.ok
					? storedAfterRefusal.record.gpcReported
					: 'invalid'
			).toBeUndefined();
			expect(document.cookie).not.toContain('&g=1');
			refusedPersistence.dispose();
			refused.dispose();
		});
		warn.mockRestore();

		// Reload with a working store reports GPC once and persists the mark.
		const workingOptOut = vi.fn<NonNullable<KernelTransport['optOut']>>(
			(payload) =>
				Promise.resolve({
					ok: true,
					optOut: {
						heldBy: 'device',
						method: 'button',
						recordedAt: NOW,
						rights: ['sale', 'share'],
					},
					subjectId: payload.subjectId,
				})
		);
		const second = kernelOn(
			{
				initialPrivacySignals: { gpc: true },
				transport: { optOut: workingOptOut },
			},
			createBrowserOutboxStore()
		);
		const secondPersistence = createPersistence({ kernel: second });
		await second.commands.init();
		await vi.waitFor(() => expect(workingOptOut).toHaveBeenCalledTimes(1));
		expect(workingOptOut.mock.calls[0]?.[0].method).toBe('gpc');
		await vi.waitFor(() =>
			expect(readStoredOptOutRecord(undefined, Date.now())).toMatchObject({
				ok: true,
				record: { gpcReported: true, method: 'button' },
			})
		);
		expect(document.cookie).toContain('&g=1');
		secondPersistence.dispose();
		second.dispose();

		// Third load sees the persisted mark and sends nothing.
		const third = kernelOn(
			{
				initialPrivacySignals: { gpc: true },
				transport: { optOut: workingOptOut },
			},
			createBrowserOutboxStore()
		);
		const thirdPersistence = createPersistence({ kernel: third });
		await third.commands.init();
		third.refresh();
		await flushMacrotasks();
		expect(workingOptOut).toHaveBeenCalledTimes(1);
		thirdPersistence.dispose();
		third.dispose();
	});

	test('when the outbox refuses to store a first-recorded GPC opt-out and the page reloads before delivery, no report mark is persisted and the next load sends it once', async () => {
		await withRefusedPendingOptOutsWrite(async () => {
			const inFlight = Promise.withResolvers<OptOutTransportResult>();
			const hangingOptOut = vi.fn<NonNullable<KernelTransport['optOut']>>(
				() => inFlight.promise
			);
			const first = kernelOn(
				{
					initialPrivacySignals: { gpc: true },
					initialRecords: { now: NOW, subject: { subjectId: SUBJECT } },
					transport: { optOut: hangingOptOut },
				},
				createBrowserOutboxStore()
			);
			const firstPersistence = createPersistence({ kernel: first });
			await first.commands.init();
			await vi.waitFor(() => expect(hangingOptOut).toHaveBeenCalledTimes(1));
			first.refresh();
			first.set.language('fr');
			await flushMacrotasks();

			expect(first.getSnapshot().optOut?.method).toBe('gpc');
			expect(hangingOptOut).toHaveBeenCalledTimes(1);
			expect(first.isOptOutGpcReported()).toBe(false);
			expect(
				window.localStorage.getItem(PENDING_OPT_OUTS_STORAGE_KEY)
			).toBeNull();
			const storedAfterRefusal = readStoredOptOutRecord(undefined, Date.now());
			expect(storedAfterRefusal).toMatchObject({
				ok: true,
				record: { method: 'gpc' },
			});
			expect(
				storedAfterRefusal?.ok
					? storedAfterRefusal.record.gpcReported
					: 'invalid'
			).toBeUndefined();
			expect(document.cookie).not.toContain('&g=1');
			firstPersistence.dispose();
			first.dispose();
		});

		// Next load with a working store sends the GPC report once and persists the mark.
		const workingOptOut = vi.fn<NonNullable<KernelTransport['optOut']>>(
			(payload) =>
				Promise.resolve({
					ok: true,
					optOut: {
						heldBy: 'device',
						method: 'gpc',
						recordedAt: payload.givenAt,
						rights: ['sale', 'share'],
					},
					subjectId: payload.subjectId,
				})
		);
		const second = kernelOn(
			{
				initialPrivacySignals: { gpc: true },
				transport: { optOut: workingOptOut },
			},
			createBrowserOutboxStore()
		);
		const secondPersistence = createPersistence({ kernel: second });
		await second.commands.init();
		await vi.waitFor(() => expect(workingOptOut).toHaveBeenCalledTimes(1));
		expect(workingOptOut.mock.calls[0]?.[0].method).toBe('gpc');
		await vi.waitFor(() =>
			expect(readStoredOptOutRecord(undefined, Date.now())).toMatchObject({
				ok: true,
				record: { gpcReported: true, method: 'gpc' },
			})
		);
		expect(document.cookie).toContain('&g=1');
		secondPersistence.dispose();
		second.dispose();

		// Third load sees the persisted mark and sends nothing.
		const third = kernelOn(
			{
				initialPrivacySignals: { gpc: true },
				transport: { optOut: workingOptOut },
			},
			createBrowserOutboxStore()
		);
		const thirdPersistence = createPersistence({ kernel: third });
		await third.commands.init();
		third.refresh();
		await flushMacrotasks();
		expect(workingOptOut).toHaveBeenCalledTimes(1);
		thirdPersistence.dispose();
		third.dispose();
	});

	test('when the outbox refuses to store a GPC report but the direct request is answered, the report mark is persisted and reload sends none', async () => {
		const answeredOptOut = vi.fn<NonNullable<KernelTransport['optOut']>>(
			(payload) =>
				Promise.resolve({
					ok: true,
					optOut: {
						heldBy: 'device',
						method: 'gpc',
						recordedAt: payload.givenAt,
						rights: ['sale', 'share'],
					},
					subjectId: payload.subjectId,
				})
		);
		await withRefusedPendingOptOutsWrite(async () => {
			const first = kernelOn(
				{
					initialPrivacySignals: { gpc: true },
					initialRecords: { now: NOW, subject: { subjectId: SUBJECT } },
					transport: { optOut: answeredOptOut },
				},
				createBrowserOutboxStore()
			);
			const firstPersistence = createPersistence({ kernel: first });
			await first.commands.init();
			await vi.waitFor(() => expect(answeredOptOut).toHaveBeenCalledTimes(1));
			await vi.waitFor(() =>
				expect(readStoredOptOutRecord(undefined, Date.now())).toMatchObject({
					ok: true,
					record: { gpcReported: true, method: 'gpc' },
				})
			);
			expect(first.isOptOutGpcReported()).toBe(true);
			firstPersistence.dispose();
			first.dispose();
		});

		const reloaded = kernelOn(
			{
				initialPrivacySignals: { gpc: true },
				transport: { optOut: answeredOptOut },
			},
			createBrowserOutboxStore()
		);
		const secondPersistence = createPersistence({ kernel: reloaded });
		await reloaded.commands.init();
		reloaded.refresh();
		await flushMacrotasks();
		expect(answeredOptOut).toHaveBeenCalledTimes(1);
		secondPersistence.dispose();
		reloaded.dispose();
	});

	test('when the browser outbox falls back to memory without localStorage and reloads before delivery, the cookie carries no report mark', async () => {
		const inFlight = Promise.withResolvers<OptOutTransportResult>();
		const hangingOptOut = vi.fn<NonNullable<KernelTransport['optOut']>>(
			() => inFlight.promise
		);
		const memoryFallbackStore = createBrowserOutboxStore({
			localStorage: () => null,
			locks: () => null,
		});
		const first = kernelOn(
			{
				initialPrivacySignals: { gpc: true },
				initialRecords: {
					now: NOW,
					optOut: {
						heldBy: 'device',
						method: 'button',
						recordedAt: NOW - 500,
						rights: ['sale', 'share'],
					},
					subject: { subjectId: SUBJECT },
				},
				transport: { optOut: hangingOptOut },
			},
			memoryFallbackStore
		);
		const firstPersistence = createPersistence({
			kernel: first,
			skipHydration: true,
		});
		await first.commands.init();
		await vi.waitFor(() => expect(hangingOptOut).toHaveBeenCalledTimes(1));
		await flushMacrotasks();

		expect(first.isOptOutGpcReported()).toBe(false);
		expect(document.cookie).not.toContain('&g=1');
		firstPersistence.dispose();
		first.dispose();
	});

	test('save() granting marketing does not lift an account-held opt-out when the save fails', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const accountOptOut: OptOutRecord = {
			heldBy: 'person',
			method: 'api',
			recordedAt: NOW - 1000,
			rights: ['sale', 'share'],
		};
		const save = vi.fn<NonNullable<KernelTransport['save']>>(() =>
			Promise.resolve({ ok: false })
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
				optOut: accountOptOut,
				subject: { subjectId: SUBJECT },
			},
			initialUser: { externalId: 'user_123', identityToken: 'tok_1' },
			transport: { liftOptOut, save },
		});

		const saveResult = await kernel.commands.save({ marketing: true });
		await flushMacrotasks();

		expect(saveResult.ok).toBe(false);
		expect(liftOptOut).not.toHaveBeenCalled();
		expect(kernel.getSnapshot().optOut).toEqual(accountOptOut);
		kernel.dispose();
	});

	test('save() granting marketing does not lift an account-held opt-out after a newer refusal', async () => {
		const accountOptOut: OptOutRecord = {
			heldBy: 'person',
			method: 'api',
			recordedAt: NOW - 1000,
			rights: ['sale', 'share'],
		};
		const grantDeferred = Promise.withResolvers<SaveResult>();
		const save = vi
			.fn<NonNullable<KernelTransport['save']>>()
			.mockImplementationOnce(() => grantDeferred.promise)
			.mockImplementation((payload) =>
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
				optOut: accountOptOut,
				subject: { subjectId: SUBJECT },
			},
			initialUser: { externalId: 'user_123', identityToken: 'tok_1' },
			transport: { liftOptOut, save },
		});

		const grantSave = kernel.commands.save({ marketing: true });
		await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));

		await kernel.commands.save({ marketing: false });
		grantDeferred.resolve({ ok: true, subjectId: SUBJECT });
		await grantSave;
		await flushMacrotasks();

		expect(liftOptOut).not.toHaveBeenCalled();
		expect(kernel.getSnapshot().optOut).toEqual(accountOptOut);
		kernel.dispose();
	});

	test('GPC turning on during a granting save blocks the post-save account lift', async () => {
		const accountOptOut: OptOutRecord = {
			heldBy: 'person',
			method: 'api',
			recordedAt: NOW - 1000,
			rights: ['sale', 'share'],
		};
		const saveDeferred = Promise.withResolvers<SaveResult>();
		const save = vi.fn<NonNullable<KernelTransport['save']>>(
			() => saveDeferred.promise
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
				optOut: accountOptOut,
				subject: { subjectId: SUBJECT },
			},
			initialUser: { externalId: 'user_123', identityToken: 'tok_1' },
			transport: { liftOptOut, save },
		});

		const grantSave = kernel.commands.save({ marketing: true });
		await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));

		kernel.set.privacySignals({ gpc: true });
		saveDeferred.resolve({ ok: true, subjectId: SUBJECT });
		await grantSave;
		await flushMacrotasks();

		expect(liftOptOut).not.toHaveBeenCalled();
		expect(kernel.getSnapshot().optOut).toEqual(accountOptOut);
		kernel.dispose();
	});

	test('GPC turning on while an account lift is in flight prevents clearing the held opt-out', async () => {
		const accountOptOut: OptOutRecord = {
			heldBy: 'person',
			method: 'api',
			recordedAt: NOW - 1000,
			rights: ['sale', 'share'],
		};
		const optInLift = Promise.withResolvers<LiftOptOutTransportResult>();
		const liftFromOptIn = vi.fn<NonNullable<KernelTransport['liftOptOut']>>(
			() => optInLift.promise
		);
		const first = kernelOn({
			initialRecords: {
				now: NOW,
				optOut: accountOptOut,
				subject: { subjectId: SUBJECT },
			},
			initialUser: { externalId: 'user_123', identityToken: 'tok_1' },
			transport: { liftOptOut: liftFromOptIn },
		});
		const lifted = vi.fn();
		first.events.on('opt-out:lifted', lifted);

		const optInPromise = first.commands.optIn();
		await vi.waitFor(() => expect(liftFromOptIn).toHaveBeenCalledTimes(1));
		first.set.privacySignals({ gpc: true });
		optInLift.resolve({ ok: true, optOut: null, subjectId: SUBJECT });

		expect(await optInPromise).toEqual({ ok: false, reason: 'gpc-active' });
		expect(first.getSnapshot().optOut).toEqual(accountOptOut);
		expect(lifted).not.toHaveBeenCalled();
		first.dispose();

		const postSaveLift = Promise.withResolvers<LiftOptOutTransportResult>();
		const liftAfterSave = vi.fn<NonNullable<KernelTransport['liftOptOut']>>(
			() => postSaveLift.promise
		);
		const save = vi.fn<NonNullable<KernelTransport['save']>>((payload) =>
			Promise.resolve({ ok: true, subjectId: payload.subjectId })
		);
		const second = kernelOn({
			initialRecords: {
				now: NOW,
				optOut: accountOptOut,
				subject: { subjectId: SUBJECT },
			},
			initialUser: { externalId: 'user_123', identityToken: 'tok_1' },
			transport: { liftOptOut: liftAfterSave, save },
		});

		await second.commands.save({ marketing: true });
		await vi.waitFor(() => expect(liftAfterSave).toHaveBeenCalledTimes(1));
		second.set.privacySignals({ gpc: true });
		postSaveLift.resolve({ ok: true, optOut: null, subjectId: SUBJECT });
		await flushMacrotasks();

		expect(second.getSnapshot().optOut).toEqual(accountOptOut);
		second.dispose();
	});
});
