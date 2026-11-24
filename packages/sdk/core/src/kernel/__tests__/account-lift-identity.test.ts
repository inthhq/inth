/**
 * An account opt-out lift belongs to the account that asked for it. When the
 * site identifies another account on the same browser subject while the lift,
 * or the save that leads to one, is still out, the late answer must not touch
 * the new account's opt-out, and no follow-up lift leaves with its identity.
 */
import type { OptOutRecord } from '@inth/sdk-schema/types';
import { afterEach, describe, expect, test, vi } from 'vitest';

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
	config: KernelConfig = {}
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
		{ outboxStore: createMemoryOutboxStore() }
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
