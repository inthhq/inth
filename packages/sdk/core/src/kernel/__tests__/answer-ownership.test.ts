/**
 * An answer belongs to the account, or the signed-out visitor, that asked.
 *
 * - Moving the subject waits for the outbox's storage transaction. When
 *   another account is identified while it waits, a link, lift or opt-out
 *   answer for the previous account must not move the new account's
 *   subject, and a `409 subject_conflict` for the previous account must not
 *   give the new one a fresh subject ID.
 * - Signing in and out again while a save or init is out leaves the user
 *   `null` as it was. The save's opt-out answer and init's records still
 *   belong to the earlier anonymous visit and must not be applied.
 */
import type { OptOutRecord } from '@inth/sdk-schema/types';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import {
	matchedResolution,
	NOW,
	optOutRule,
} from '../../__tests__/fixtures/kernel-fixtures';
import type {
	InitResponse,
	KernelConfig,
	KernelTransport,
	KernelUser,
	LiftOptOutTransportResult,
	OptOutTransportResult,
	SaveResult,
} from '../../consent-kernel.model';
import { ConsentSaveRejectedError } from '../../transports/consent-save-rejected-error';
import { createKernel } from '../index';
import type { InternalKernel } from '../kernel-internals.model';
import { createMemoryOutboxStore } from '../save-outbox';
import type { SaveOutboxStore } from '../save-outbox/save-outbox.store';

await import('../save-outbox/queue');

// A c15t subject id: an answer for it names its UUID, and adopting that
// moves the visitor to the UUID.
const LEGACY_SUBJECT = 'sub_01890000000070008000000000000001';
const CANONICAL_SUBJECT = '01890000-0000-7000-8000-0000000000aa';
const SUBJECT = '01890000-0000-7000-8000-000000000001';
const USER_A: KernelUser = { externalId: 'user-a', identityToken: 'tok-a' };
const USER_B: KernelUser = { externalId: 'user-b', identityToken: 'tok-b' };

const HELD_A: OptOutRecord = {
	heldBy: 'person',
	method: 'api',
	recordedAt: NOW - 1000,
	rights: ['sale', 'share'],
};
const HELD_B: OptOutRecord = {
	heldBy: 'person',
	method: 'api',
	recordedAt: NOW - 500,
	rights: ['sale', 'share'],
};

const deferred = function deferred<Value>() {
	let settle: (value: Value) => void = () => {};
	let fail: (error: unknown) => void = () => {};
	const promise = new Promise<Value>((resolve, reject) => {
		settle = resolve;
		fail = reject;
	});
	return { promise, reject: fail, resolve: settle };
};

const flushMacrotasks = () =>
	new Promise<void>((resolve) => {
		setTimeout(resolve, 25);
	});

const subjectConflict = () =>
	new ConsentSaveRejectedError({
		code: 'subject_conflict',
		message: 'subject belongs to another tenant',
		status: 409,
	});

type HoldPhase = 'before the move runs' | 'after the move ran';
const PHASES: readonly HoldPhase[] = [
	'before the move runs',
	'after the move ran',
];

/**
 * A memory outbox store that can hold the transaction moving a subject
 * (`claimReassignment`), as a browser lock held by another tab would: before
 * it runs, or after it ran and before the caller resumes.
 */
const holdingStore = function holdingStore() {
	const inner = createMemoryOutboxStore();
	const gate = deferred<undefined>();
	let phase: HoldPhase | null = null;
	let held = false;
	const store: SaveOutboxStore = {
		clear: () => {
			inner.clear();
		},
		async transact(run) {
			const moving =
				phase !== null &&
				(new Error('stack').stack ?? '').includes('claimReassignment');
			if (!moving) {
				return inner.transact(run);
			}
			held = true;
			if (phase === 'before the move runs') {
				await gate.promise;
				return inner.transact(run);
			}
			const result = await inner.transact(run);
			await gate.promise;
			return result;
		},
	};
	return {
		hold(next: HoldPhase) {
			phase = next;
		},
		isHeld: () => held,
		release() {
			phase = null;
			gate.resolve(undefined);
		},
		store,
	};
};

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
				subject: { subjectId: LEGACY_SUBJECT },
			},
			initialUser: { ...USER_A },
			now: NOW,
			transport,
			...config,
		},
		{ outboxStore }
	);
};

/** B's link answer: B's account opt-out, on the same browser subject. */
const linkB = () =>
	Promise.resolve({ optOut: HELD_B, subjectId: LEGACY_SUBJECT });

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

afterEach(() => {
	vi.restoreAllMocks();
});

describe('a subject move waiting for storage while B is identified', () => {
	test.each(PHASES)(
		'A’s link answer leaves B’s subject alone (%s)',
		async (phase) => {
			const hold = holdingStore();
			const linkA = deferred<{ subjectId?: string }>();
			const identify = vi.fn((user: KernelUser) =>
				user.externalId === 'user-a' ? linkA.promise : Promise.resolve({})
			);
			const kernel = kernelOn(
				{ identify },
				{
					initialRecords: {
						now: NOW,
						subject: { subjectId: LEGACY_SUBJECT },
					},
					initialUser: undefined,
				},
				hold.store
			);
			const subjects = vi.fn();
			kernel.events.on('subject:resolved', subjects);

			const identifiedA = kernel.commands.identify({ ...USER_A });
			await vi.waitFor(() => expect(identify).toHaveBeenCalledTimes(1));
			hold.hold(phase);
			linkA.resolve({ subjectId: CANONICAL_SUBJECT });
			await vi.waitFor(() => expect(hold.isHeld()).toBe(true));
			await kernel.commands.identify({ ...USER_B });
			hold.release();
			await identifiedA;
			await flushMacrotasks();

			expect(kernel.getSnapshot().user?.externalId).toBe('user-b');
			expect(kernel.getSnapshot().subject?.subjectId).toBe(LEGACY_SUBJECT);
			expect(subjects).not.toHaveBeenCalled();
			kernel.dispose();
		}
	);

	test('with no switch, A’s held link answer still adopts the UUID', async () => {
		const hold = holdingStore();
		const linkA = deferred<{ subjectId?: string }>();
		const identify = vi.fn(() => linkA.promise);
		const kernel = kernelOn(
			{ identify },
			{
				initialRecords: {
					now: NOW,
					subject: { subjectId: LEGACY_SUBJECT },
				},
				initialUser: undefined,
			},
			hold.store
		);
		const identifiedA = kernel.commands.identify({ ...USER_A });
		await vi.waitFor(() => expect(identify).toHaveBeenCalledTimes(1));
		hold.hold('before the move runs');
		linkA.resolve({ subjectId: CANONICAL_SUBJECT });
		await vi.waitFor(() => expect(hold.isHeld()).toBe(true));
		hold.release();
		await identifiedA;
		expect(kernel.getSnapshot().subject?.subjectId).toBe(CANONICAL_SUBJECT);
		kernel.dispose();
	});

	test.each(PHASES)(
		'A’s successful lift answer leaves B’s subject alone (%s)',
		async (phase) => {
			const hold = holdingStore();
			const lift = deferred<LiftOptOutTransportResult>();
			const liftOptOut = vi.fn(() => lift.promise);
			const kernel = kernelOn(
				{
					identify: linkB,
					liftOptOut,
					optOut: () => Promise.resolve({ ok: true }),
				},
				{},
				hold.store
			);
			const subjects = vi.fn();
			kernel.events.on('subject:resolved', subjects);

			const pending = kernel.commands.optIn({ uiSource: 'dialog' });
			await vi.waitFor(() => expect(liftOptOut).toHaveBeenCalledTimes(1));
			hold.hold(phase);
			lift.resolve({ ok: true, optOut: null, subjectId: CANONICAL_SUBJECT });
			await vi.waitFor(() => expect(hold.isHeld()).toBe(true));
			await kernel.commands.identify({ ...USER_B });
			const before = accountState(kernel);
			hold.release();
			await pending;
			await flushMacrotasks();

			expect(before).toMatchObject({
				subjectId: LEGACY_SUBJECT,
				user: 'user-b',
			});
			expect(accountState(kernel)).toEqual(before);
			expect(subjects).not.toHaveBeenCalled();
			kernel.dispose();
		}
	);

	test.each(PHASES)(
		'A’s successful opt-out answer leaves B’s subject alone (%s)',
		async (phase) => {
			const hold = holdingStore();
			const answer = deferred<OptOutTransportResult>();
			const optOut = vi.fn(() => answer.promise);
			const kernel = kernelOn(
				{ identify: linkB, optOut },
				{
					initialRecords: {
						now: NOW,
						subject: { subjectId: LEGACY_SUBJECT },
					},
				},
				hold.store
			);
			const subjects = vi.fn();
			kernel.events.on('subject:resolved', subjects);

			const pending = kernel.commands.optOut({ uiSource: 'widget' });
			await vi.waitFor(() => expect(optOut).toHaveBeenCalledTimes(1));
			hold.hold(phase);
			answer.resolve({
				ok: true,
				optOut: HELD_A,
				subjectId: CANONICAL_SUBJECT,
			});
			await vi.waitFor(() => expect(hold.isHeld()).toBe(true));
			await kernel.commands.identify({ ...USER_B });
			const before = accountState(kernel);
			hold.release();
			await pending;
			await flushMacrotasks();

			expect(before.subjectId).toBe(LEGACY_SUBJECT);
			expect(accountState(kernel)).toEqual(before);
			expect(subjects).not.toHaveBeenCalled();
			kernel.dispose();
		}
	);

	test.each(PHASES)(
		'A’s 409 subject_conflict gives B no new subject (%s)',
		async (phase) => {
			const hold = holdingStore();
			const lift = deferred<LiftOptOutTransportResult>();
			const liftOptOut = vi.fn(() => lift.promise);
			const kernel = kernelOn(
				{
					identify: linkB,
					liftOptOut,
					optOut: () => Promise.resolve({ ok: true }),
				},
				{
					initialRecords: {
						now: NOW,
						optOut: HELD_A,
						subject: { subjectId: SUBJECT },
					},
				},
				hold.store
			);
			const subjects = vi.fn();
			kernel.events.on('subject:resolved', subjects);

			const pending = kernel.commands.optIn({ uiSource: 'dialog' });
			await vi.waitFor(() => expect(liftOptOut).toHaveBeenCalledTimes(1));
			hold.hold(phase);
			lift.reject(subjectConflict());
			await vi.waitFor(() => expect(hold.isHeld()).toBe(true));
			await kernel.commands.identify({ ...USER_B });
			hold.release();
			await pending;
			await flushMacrotasks();

			expect(kernel.getSnapshot().subject?.subjectId).toBe(SUBJECT);
			expect(subjects).not.toHaveBeenCalled();
			// No resend under a fresh id for A.
			expect(liftOptOut).toHaveBeenCalledTimes(1);
			kernel.dispose();
		}
	);
});

describe('a 409 subject_conflict for A arriving while B is current', () => {
	test('A’s direct lift', async () => {
		const lift = deferred<LiftOptOutTransportResult>();
		const liftOptOut = vi.fn(() => lift.promise);
		const kernel = kernelOn(
			{
				identify: () => Promise.resolve({ optOut: HELD_B }),
				liftOptOut,
				optOut: () => Promise.resolve({ ok: true }),
			},
			{
				initialRecords: {
					now: NOW,
					optOut: HELD_A,
					subject: { subjectId: SUBJECT },
				},
			}
		);
		const subjects = vi.fn();
		kernel.events.on('subject:resolved', subjects);

		const pending = kernel.commands.optIn({ uiSource: 'dialog' });
		await vi.waitFor(() => expect(liftOptOut).toHaveBeenCalledTimes(1));
		await kernel.commands.identify({ ...USER_B });
		const before = accountState(kernel);
		lift.reject(subjectConflict());
		await pending;
		await flushMacrotasks();

		expect(accountState(kernel)).toEqual(before);
		expect(before.subjectId).toBe(SUBJECT);
		expect(subjects).not.toHaveBeenCalled();
		expect(liftOptOut).toHaveBeenCalledTimes(1);
		kernel.dispose();
	});

	test('A’s direct opt-out', async () => {
		const answer = deferred<OptOutTransportResult>();
		const optOut = vi.fn(() => answer.promise);
		const kernel = kernelOn(
			{ identify: () => Promise.resolve({}), optOut },
			{ initialRecords: { now: NOW, subject: { subjectId: SUBJECT } } }
		);
		const subjects = vi.fn();
		kernel.events.on('subject:resolved', subjects);

		const pending = kernel.commands.optOut({ uiSource: 'widget' });
		await vi.waitFor(() => expect(optOut).toHaveBeenCalledTimes(1));
		await kernel.commands.identify({ ...USER_B });
		answer.reject(subjectConflict());
		await pending;
		await flushMacrotasks();

		expect(kernel.getSnapshot().subject?.subjectId).toBe(SUBJECT);
		expect(subjects).not.toHaveBeenCalled();
		expect(optOut).toHaveBeenCalledTimes(1);
		kernel.dispose();
	});

	test('A’s queued lift, replayed', async () => {
		const liftOptOut = vi
			.fn(() => Promise.reject<LiftOptOutTransportResult>(subjectConflict()))
			.mockRejectedValueOnce(new Error('offline'));
		const kernel = kernelOn(
			{
				identify: () => Promise.resolve({ optOut: HELD_B }),
				liftOptOut,
				optOut: () => Promise.resolve({ ok: true }),
			},
			{
				initialRecords: {
					now: NOW,
					optOut: HELD_A,
					subject: { subjectId: SUBJECT },
				},
			}
		);
		// A's lift fails and stays queued.
		expect((await kernel.commands.optIn({ uiSource: 'dialog' })).ok).toBe(
			false
		);
		await kernel.commands.identify({ ...USER_B });
		const subjects = vi.fn();
		kernel.events.on('subject:resolved', subjects);

		kernel.replaySaves();
		await vi.waitFor(() => expect(liftOptOut).toHaveBeenCalledTimes(2));
		await flushMacrotasks();

		expect(kernel.getSnapshot().subject?.subjectId).toBe(SUBJECT);
		expect(subjects).not.toHaveBeenCalled();
		expect(liftOptOut).toHaveBeenCalledTimes(2);
		kernel.dispose();
	});
});

describe('signing in and out again while an anonymous request is out', () => {
	const anonymous: KernelConfig = {
		initialRecords: { now: NOW, subject: { subjectId: SUBJECT } },
		initialUser: undefined,
	};

	test.each([false, true])(
		'a save’s opt-out answer applies only to the same anonymous visit (signs in and out = %s)',
		async (signsInAndOut) => {
			const save = deferred<SaveResult>();
			const saveSpy = vi.fn(() => save.promise);
			const kernel = kernelOn(
				{ identify: () => Promise.resolve({}), save: saveSpy },
				anonymous
			);

			const pending = kernel.commands.save(
				{ marketing: true },
				{ uiSource: 'dialog' }
			);
			await vi.waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
			if (signsInAndOut) {
				await kernel.commands.identify({ ...USER_A });
				kernel.clearIdentity();
			}
			expect(kernel.getSnapshot().user).toBeNull();
			save.resolve({ ok: true, optOut: HELD_A });
			await pending;
			await flushMacrotasks();

			// Only the same anonymous visit takes the answered opt-out.
			expect(kernel.getSnapshot().optOut?.heldBy ?? null).toBe(
				signsInAndOut ? null : 'person'
			);
			kernel.dispose();
		}
	);

	test.each([false, true])(
		'init’s records apply only to the same anonymous visit (signs in and out = %s)',
		async (signsInAndOut) => {
			const init = deferred<InitResponse>();
			const kernel = kernelOn(
				{ identify: () => Promise.resolve({}), init: () => init.promise },
				anonymous
			);

			const pending = kernel.commands.init();
			if (signsInAndOut) {
				await kernel.commands.identify({ ...USER_A });
				kernel.clearIdentity();
			}
			expect(kernel.getSnapshot().user).toBeNull();
			init.resolve({
				policyResolution: {
					...matchedResolution(
						optOutRule({
							privacySignals: { gpc: { denyCategories: ['marketing'] } },
							prompt: 'none',
						})
					),
					version: 1,
				},
				records: { now: NOW, optOut: HELD_A },
			});
			await pending;

			// Only the same anonymous visit takes the answered opt-out.
			expect(kernel.getSnapshot().optOut?.heldBy ?? null).toBe(
				signsInAndOut ? null : 'person'
			);
			kernel.dispose();
		}
	);
});
