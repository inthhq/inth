/**
 * An account opt-out lift belongs to the account that asked for it. When the
 * site identifies another account on the same browser subject while the lift,
 * or the save that leads to one, is still out, the late answer must not touch
 * the new account's opt-out, and no follow-up lift leaves with its identity.
 */
import type { OptOutRecord } from '@inth/sdk-schema/types';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import {
	matchedResolution,
	NOW,
	optOutRule,
} from '../../__tests__/fixtures/kernel-fixtures';
import type {
	KernelConfig,
	KernelTransport,
	KernelUser,
	LiftOptOutPayload,
	LiftOptOutTransportResult,
	SaveResult,
} from '../../consent-kernel.model';
import { createKernel } from '../index';
import type { InternalKernel } from '../kernel-internals.model';
import { createMemoryOutboxStore } from '../save-outbox';
import type { SaveOutboxStore } from '../save-outbox/save-outbox.store';

await import('../save-outbox/queue');

const SUBJECT = '01890000-0000-7000-8000-000000000001';
const USER_A: KernelUser = { externalId: 'user-a', identityToken: 'tok-a' };
const USER_B: KernelUser = { externalId: 'user-b', identityToken: 'tok-b' };

const HELD_A: OptOutRecord = {
	heldBy: 'person',
	method: 'api',
	recordedAt: NOW - 1000,
	rights: ['sale', 'share'],
};
// B's account refused the sale of its data on another device.
const HELD_B: OptOutRecord = {
	heldBy: 'person',
	method: 'api',
	recordedAt: NOW - 500,
	rights: ['sale', 'share'],
};

const deferred = function deferred<Value>() {
	let settle: (value: Value) => void = () => {};
	const promise = new Promise<Value>((resolve) => {
		settle = resolve;
	});
	return { promise, resolve: settle };
};

const flushMacrotasks = () =>
	new Promise<void>((resolve) => {
		setTimeout(resolve, 25);
	});

interface IdentifyAnswer {
	subjectId?: string;
	optOut?: OptOutRecord;
}

const kernelOn = function kernelOn(
	transport: KernelTransport,
	config: KernelConfig = {},
	outboxStore: SaveOutboxStore = createMemoryOutboxStore()
): InternalKernel {
	vi.spyOn(Date, 'now').mockReturnValue(NOW);
	return createKernel(
		{
			initialLocation: { countryCode: 'US', regionCode: 'CA' },
			initialPolicyResolution: matchedResolution(
				optOutRule({
					privacySignals: { gpc: { denyCategories: ['marketing'] } },
					prompt: 'none',
				})
			),
			initialPolicySnapshotToken: 'snapshot-token',
			initialRecords: {
				now: NOW,
				optOut: HELD_A,
				subject: { subjectId: SUBJECT },
			},
			initialUser: { ...USER_A },
			now: NOW,
			transport,
			...config,
		},
		{ outboxStore }
	);
};

/** B's account opt-out holds and its marketing stays denied. */
const expectBHeld = function expectBHeld(kernel: InternalKernel): void {
	const snapshot = kernel.getSnapshot();
	expect(snapshot.user?.externalId).toBe('user-b');
	expect(snapshot.optOut).toMatchObject({ heldBy: 'person' });
	expect(snapshot.effectivePermissions.marketing).toBe(false);
};

afterEach(() => {
	vi.restoreAllMocks();
});

describe('a direct account lift (optIn)', () => {
	test.each(['lift answer first', 'identify answer first'] as const)(
		'A’s late lift answer does not lift B’s opt-out (%s)',
		async (order) => {
			const lift = deferred<LiftOptOutTransportResult>();
			const link = deferred<IdentifyAnswer>();
			const liftOptOut = vi.fn((_payload: LiftOptOutPayload) => lift.promise);
			const kernel = kernelOn({
				identify: () => link.promise,
				liftOptOut,
				optOut: () => Promise.resolve({ ok: true }),
			});
			const lifted = vi.fn();
			kernel.events.on('opt-out:lifted', lifted);

			const pending = kernel.commands.optIn({ uiSource: 'dialog' });
			await vi.waitFor(() => expect(liftOptOut).toHaveBeenCalledTimes(1));
			expect(liftOptOut.mock.calls[0]?.[0].user?.externalId).toBe('user-a');
			const identified = kernel.commands.identify({ ...USER_B });

			if (order === 'lift answer first') {
				lift.resolve({ ok: true, optOut: null });
				await flushMacrotasks();
				link.resolve({ optOut: HELD_B, subjectId: SUBJECT });
			} else {
				link.resolve({ optOut: HELD_B, subjectId: SUBJECT });
				await flushMacrotasks();
				lift.resolve({ ok: true, optOut: null });
			}
			const result = await pending;
			await identified;
			await flushMacrotasks();

			expect(result.ok).toBe(false);
			expect(lifted).not.toHaveBeenCalled();
			expectBHeld(kernel);
			kernel.dispose();
		}
	);

	test('A’s late refusal answer does not replace B’s opt-out', async () => {
		const lift = deferred<LiftOptOutTransportResult>();
		const kernel = kernelOn({
			identify: () => Promise.resolve({ optOut: HELD_B, subjectId: SUBJECT }),
			liftOptOut: () => lift.promise,
			optOut: () => Promise.resolve({ ok: true }),
		});
		const pending = kernel.commands.optIn();
		await kernel.commands.identify({ ...USER_B });
		const before = kernel.getSnapshot().optOut;
		lift.resolve({
			ok: true,
			optOut: { ...HELD_A, recordedAt: NOW - 10, rights: ['sale'] },
		});
		await pending;
		await flushMacrotasks();
		expect(kernel.getSnapshot().optOut).toEqual(before);
		kernel.dispose();
	});
});

describe('the lift that follows a granting save', () => {
	test.each(['save answer first', 'identify answer first'] as const)(
		'no lift leaves with B’s identity when B is identified while A’s save is out (%s)',
		async (order) => {
			const save = deferred<SaveResult>();
			const link = deferred<IdentifyAnswer>();
			const saveSpy = vi.fn(() => save.promise);
			const liftOptOut = vi.fn((_payload: LiftOptOutPayload) =>
				Promise.resolve<LiftOptOutTransportResult>({ ok: true, optOut: null })
			);
			const kernel = kernelOn({
				identify: () => link.promise,
				liftOptOut,
				optOut: () => Promise.resolve({ ok: true }),
				save: saveSpy,
			});

			const pending = kernel.commands.save(
				{ marketing: true },
				{ uiSource: 'dialog' }
			);
			await vi.waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
			const identified = kernel.commands.identify({ ...USER_B });

			if (order === 'save answer first') {
				save.resolve({ ok: true });
				await flushMacrotasks();
				link.resolve({ optOut: HELD_B, subjectId: SUBJECT });
			} else {
				link.resolve({ optOut: HELD_B, subjectId: SUBJECT });
				await flushMacrotasks();
				save.resolve({ ok: true });
			}
			await pending;
			await identified;
			await flushMacrotasks();

			expect(
				liftOptOut.mock.calls.filter(
					([payload]) => payload.user?.externalId === 'user-b'
				)
			).toHaveLength(0);
			expectBHeld(kernel);
			kernel.dispose();
		}
	);

	test('A’s late follow-up lift answer does not lift B’s opt-out', async () => {
		const lift = deferred<LiftOptOutTransportResult>();
		const liftOptOut = vi.fn((_payload: LiftOptOutPayload) => lift.promise);
		const kernel = kernelOn({
			identify: () => Promise.resolve({ optOut: HELD_B, subjectId: SUBJECT }),
			liftOptOut,
			optOut: () => Promise.resolve({ ok: true }),
			save: () => Promise.resolve({ ok: true }),
		});
		await kernel.commands.save({ marketing: true }, { uiSource: 'dialog' });
		await vi.waitFor(() => expect(liftOptOut).toHaveBeenCalledTimes(1));
		expect(liftOptOut.mock.calls[0]?.[0].user?.externalId).toBe('user-a');
		await kernel.commands.identify({ ...USER_B });
		lift.resolve({ ok: true, optOut: null });
		await flushMacrotasks();
		expectBHeld(kernel);
		kernel.dispose();
	});

	test('with no account switch, the follow-up lift still lifts A’s opt-out', async () => {
		const liftOptOut = vi.fn((_payload: LiftOptOutPayload) =>
			Promise.resolve<LiftOptOutTransportResult>({ ok: true, optOut: null })
		);
		const kernel = kernelOn({
			liftOptOut,
			optOut: () => Promise.resolve({ ok: true }),
			save: () => Promise.resolve({ ok: true }),
		});
		await kernel.commands.save({ marketing: true }, { uiSource: 'dialog' });
		await vi.waitFor(() => expect(kernel.getSnapshot().optOut).toBeNull());
		expect(liftOptOut.mock.calls[0]?.[0].user?.externalId).toBe('user-a');
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(true);
		kernel.dispose();
	});
});

describe('the same account signing out and back in while its lift is out', () => {
	test('A’s late direct lift answer does not lift A’s opt-out again', async () => {
		const lift = deferred<LiftOptOutTransportResult>();
		const liftOptOut = vi.fn((_payload: LiftOptOutPayload) => lift.promise);
		const kernel = kernelOn({
			identify: () => Promise.resolve({ optOut: HELD_A, subjectId: SUBJECT }),
			liftOptOut,
			optOut: () => Promise.resolve({ ok: true }),
		});
		const lifted = vi.fn();
		kernel.events.on('opt-out:lifted', lifted);

		const pending = kernel.commands.optIn({ uiSource: 'dialog' });
		await vi.waitFor(() => expect(liftOptOut).toHaveBeenCalledTimes(1));
		kernel.clearIdentity();
		await kernel.commands.identify({ ...USER_A });
		lift.resolve({ ok: true, optOut: null });
		const result = await pending;
		await flushMacrotasks();

		expect(result.ok).toBe(false);
		expect(lifted).not.toHaveBeenCalled();
		expect(kernel.getSnapshot().optOut).toMatchObject({ heldBy: 'person' });
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
		kernel.dispose();
	});

	test('A’s late follow-up lift answer does not lift A’s opt-out again', async () => {
		const lift = deferred<LiftOptOutTransportResult>();
		const liftOptOut = vi.fn((_payload: LiftOptOutPayload) => lift.promise);
		const kernel = kernelOn({
			identify: () => Promise.resolve({ optOut: HELD_A, subjectId: SUBJECT }),
			liftOptOut,
			optOut: () => Promise.resolve({ ok: true }),
			save: () => Promise.resolve({ ok: true }),
		});
		await kernel.commands.save({ marketing: true }, { uiSource: 'dialog' });
		await vi.waitFor(() => expect(liftOptOut).toHaveBeenCalledTimes(1));
		kernel.clearIdentity();
		await kernel.commands.identify({ ...USER_A });
		lift.resolve({ ok: true, optOut: null });
		await flushMacrotasks();

		expect(kernel.getSnapshot().optOut).toMatchObject({ heldBy: 'person' });
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
		kernel.dispose();
	});
});

// A c15t subject id: an answer for it names its UUID, and adopting that
// moves the visitor to the UUID.
const LEGACY_SUBJECT = 'sub_01890000000070008000000000000001';
const CANONICAL_SUBJECT = '01890000-0000-7000-8000-0000000000aa';

/** Kernel state an answer for another account must leave alone. */
const accountState = function accountState(kernel: InternalKernel) {
	const snapshot = kernel.getSnapshot();
	return {
		marketing: snapshot.effectivePermissions.marketing,
		optOut: snapshot.optOut,
		subjectId: snapshot.subject?.subjectId ?? null,
		user: snapshot.user?.externalId ?? null,
	};
};

describe('signing out while A’s lift is out', () => {
	test('A’s answer does not change the anonymous state', async () => {
		const lift = deferred<LiftOptOutTransportResult>();
		const liftOptOut = vi.fn((_payload: LiftOptOutPayload) => lift.promise);
		const kernel = kernelOn(
			{ liftOptOut, optOut: () => Promise.resolve({ ok: true }) },
			{
				initialRecords: {
					now: NOW,
					optOut: HELD_A,
					subject: { subjectId: LEGACY_SUBJECT },
				},
			}
		);
		const lifted = vi.fn();
		kernel.events.on('opt-out:lifted', lifted);

		const pending = kernel.commands.optIn({ uiSource: 'dialog' });
		await vi.waitFor(() => expect(liftOptOut).toHaveBeenCalledTimes(1));
		expect(liftOptOut.mock.calls[0]?.[0].user?.externalId).toBe('user-a');

		kernel.clearIdentity();
		const anonymous = accountState(kernel);
		expect(anonymous).toMatchObject({
			marketing: false,
			subjectId: LEGACY_SUBJECT,
			user: null,
		});
		expect(anonymous.optOut).toMatchObject({ heldBy: 'person' });

		lift.resolve({ ok: true, optOut: null, subjectId: CANONICAL_SUBJECT });
		const result = await pending;
		await flushMacrotasks();

		expect(result.ok).toBe(false);
		expect(lifted).not.toHaveBeenCalled();
		expect(accountState(kernel)).toEqual(anonymous);
		kernel.dispose();
	});

	test('signing out retires IAB authority and needs no request', () => {
		const kernel = kernelOn({});
		kernel.set.iab({
			enabled: true,
			tcString: 'tc-string-for-a',
		});
		kernel.clearIdentity();
		expect(kernel.getSnapshot().user).toBeNull();
		expect(kernel.getSnapshot().iab?.tcString).toBeNull();
		kernel.dispose();
	});
});

describe('a queued account lift', () => {
	test('A’s replayed lift answered while B is current changes nothing of B’s', async () => {
		const liftOptOut = vi
			.fn((_payload: LiftOptOutPayload) =>
				Promise.resolve<LiftOptOutTransportResult>({
					ok: true,
					optOut: null,
					subjectId: CANONICAL_SUBJECT,
				})
			)
			.mockRejectedValueOnce(new Error('offline'));
		const kernel = kernelOn(
			{
				identify: () =>
					Promise.resolve({ optOut: HELD_B, subjectId: LEGACY_SUBJECT }),
				liftOptOut,
				optOut: () => Promise.resolve({ ok: true }),
			},
			{
				initialRecords: {
					now: NOW,
					optOut: HELD_A,
					subject: { subjectId: LEGACY_SUBJECT },
				},
			}
		);
		// A's lift fails and stays queued.
		const result = await kernel.commands.optIn({ uiSource: 'dialog' });
		expect(result.ok).toBe(false);
		await kernel.commands.identify({ ...USER_B });
		expectBHeld(kernel);
		const before = accountState(kernel);

		kernel.replaySaves();
		await vi.waitFor(() => expect(liftOptOut).toHaveBeenCalledTimes(2));
		expect(liftOptOut.mock.calls[1]?.[0].user?.externalId).toBe('user-a');
		// B's token never travels with A's lift.
		expect(liftOptOut.mock.calls[1]?.[0].user?.identityToken).toBeUndefined();
		await flushMacrotasks();

		expect(accountState(kernel)).toEqual(before);
		expect(before.subjectId).toBe(LEGACY_SUBJECT);
		kernel.dispose();
	});

	test('A’s lift queued on an earlier page is not applied to B on this one', async () => {
		const store = createMemoryOutboxStore();
		const first = kernelOn(
			{
				liftOptOut: () => Promise.reject(new Error('offline')),
				optOut: () => Promise.resolve({ ok: true }),
			},
			{
				initialRecords: {
					now: NOW,
					optOut: HELD_A,
					subject: { subjectId: LEGACY_SUBJECT },
				},
			},
			store
		);
		await first.commands.optIn({ uiSource: 'dialog' });
		first.dispose();

		const liftOptOut = vi.fn((_payload: LiftOptOutPayload) =>
			Promise.resolve<LiftOptOutTransportResult>({
				ok: true,
				optOut: null,
				subjectId: CANONICAL_SUBJECT,
			})
		);
		const kernel = kernelOn(
			{ liftOptOut, optOut: () => Promise.resolve({ ok: true }) },
			{
				initialRecords: {
					now: NOW,
					optOut: HELD_B,
					subject: { subjectId: LEGACY_SUBJECT },
				},
				initialUser: { ...USER_B },
			},
			store
		);
		const before = accountState(kernel);
		kernel.replaySaves();
		await vi.waitFor(() => expect(liftOptOut).toHaveBeenCalledTimes(1));
		await flushMacrotasks();

		expectBHeld(kernel);
		expect(accountState(kernel)).toEqual(before);
		kernel.dispose();
	});

	test('A’s late direct lift answer does not move B’s subject', async () => {
		const lift = deferred<LiftOptOutTransportResult>();
		const liftOptOut = vi.fn((_payload: LiftOptOutPayload) => lift.promise);
		const kernel = kernelOn(
			{
				identify: () =>
					Promise.resolve({ optOut: HELD_B, subjectId: LEGACY_SUBJECT }),
				liftOptOut,
				optOut: () => Promise.resolve({ ok: true }),
			},
			{
				initialRecords: {
					now: NOW,
					optOut: HELD_A,
					subject: { subjectId: LEGACY_SUBJECT },
				},
			}
		);
		const subjects = vi.fn();
		kernel.events.on('subject:resolved', subjects);

		const pending = kernel.commands.optIn({ uiSource: 'dialog' });
		await vi.waitFor(() => expect(liftOptOut).toHaveBeenCalledTimes(1));
		await kernel.commands.identify({ ...USER_B });
		expectBHeld(kernel);
		const before = accountState(kernel);

		lift.resolve({ ok: true, optOut: null, subjectId: CANONICAL_SUBJECT });
		const result = await pending;
		await flushMacrotasks();

		expect(result.ok).toBe(false);
		expect(subjects).not.toHaveBeenCalled();
		expect(accountState(kernel)).toEqual(before);
		expect(before.subjectId).toBe(LEGACY_SUBJECT);
		kernel.dispose();
	});

	test('with no account switch, a replayed lift still lifts A’s opt-out and adopts the UUID', async () => {
		const liftOptOut = vi
			.fn((_payload: LiftOptOutPayload) =>
				Promise.resolve<LiftOptOutTransportResult>({
					ok: true,
					optOut: null,
					subjectId: CANONICAL_SUBJECT,
				})
			)
			.mockRejectedValueOnce(new Error('offline'));
		const kernel = kernelOn(
			{ liftOptOut, optOut: () => Promise.resolve({ ok: true }) },
			{
				initialRecords: {
					now: NOW,
					optOut: HELD_A,
					subject: { subjectId: LEGACY_SUBJECT },
				},
			}
		);
		await kernel.commands.optIn({ uiSource: 'dialog' });
		kernel.replaySaves();
		await vi.waitFor(() => expect(kernel.getSnapshot().optOut).toBeNull());
		expect(kernel.getSnapshot().subject?.subjectId).toBe(CANONICAL_SUBJECT);
		kernel.dispose();
	});
});
