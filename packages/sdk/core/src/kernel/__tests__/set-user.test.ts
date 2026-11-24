/**
 * `kernel.set.user()` and the runtime's user switch. A change to the
 * user's properties is a change, and replacing or clearing the user
 * fences the previous account's `identify()` the way `clearIdentity()`
 * does: its subject read no longer applies.
 */
import type { OptOutRecord } from '@inth/sdk-schema/types';
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
	matchedResolution,
	NOW,
	optOutRule,
} from '../../__tests__/fixtures/kernel-fixtures';
import type {
	HydrationRecords,
	KernelUser,
	SavePayload,
} from '../../consent-kernel.model';
import { createKernel } from '../index';
import type { InternalKernel } from '../kernel-internals.model';
import { createMemoryOutboxStore } from '../save-outbox';

const SUBJECT = '01890000-0000-7000-8000-000000000001';
const USER_A: KernelUser = { externalId: 'user-a', identityToken: 'tok-a' };
const USER_B: KernelUser = { externalId: 'user-b', identityToken: 'tok-b' };
const HELD_A: OptOutRecord = {
	heldBy: 'person',
	method: 'api',
	recordedAt: NOW - 1000,
	rights: ['sale', 'share'],
};

const kernels: InternalKernel[] = [];
afterEach(() => {
	for (const kernel of kernels.splice(0)) {
		kernel.dispose();
	}
	vi.restoreAllMocks();
});

describe('set.user()', () => {
	test('new properties for the same user reach the next save', async () => {
		const save = vi.fn((payload: SavePayload) =>
			Promise.resolve({ ok: true, subjectId: payload.subjectId })
		);
		const kernel = createKernel(
			{
				initialPolicyResolution: matchedResolution(optOutRule()),
				initialRecords: { now: NOW, subject: { subjectId: SUBJECT } },
				initialUser: { ...USER_A, properties: { plan: 'free' } },
				now: NOW,
				transport: { save },
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		kernels.push(kernel);

		kernel.set.user({ ...USER_A, properties: { plan: 'pro' } });
		await kernel.commands.save('all');

		expect(kernel.getSnapshot().user?.properties).toEqual({ plan: 'pro' });
		expect(save.mock.calls.at(-1)?.[0].user?.properties).toEqual({
			plan: 'pro',
		});
	});
});

describe('replacing the user while identify() reads the subject', () => {
	const setup = () => {
		const read = Promise.withResolvers<HydrationRecords | null>();
		const kernel = createKernel(
			{
				initialPolicyResolution: matchedResolution(optOutRule()),
				initialRecords: { now: NOW, subject: { subjectId: SUBJECT } },
				now: NOW,
				transport: {
					identify: () => Promise.resolve({ subjectId: SUBJECT }),
					loadSubjectRecord: () => read.promise,
				},
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		kernels.push(kernel);
		return { kernel, read };
	};

	test.each([
		['set.user(B)', (kernel: InternalKernel) => kernel.set.user({ ...USER_B })],
		['set.user(null)', (kernel: InternalKernel) => kernel.set.user(null)],
		[
			'setUserWithPending(B)',
			(kernel: InternalKernel) =>
				kernel.setUserWithPending({ ...USER_B }, { pending: false }),
		],
		[
			'setUserWithPending(null)',
			(kernel: InternalKernel) =>
				kernel.setUserWithPending(null, { pending: false }),
		],
	])("%s drops A's subject read", async (_name, replace) => {
		const { kernel, read } = setup();
		const identified = kernel.commands.identify({ ...USER_A });
		await vi.waitFor(() => expect(kernel.getSnapshot().user).not.toBeNull());
		await Promise.resolve();
		replace(kernel);
		read.resolve({ optOut: HELD_A });
		await identified;

		expect(kernel.getSnapshot().optOut).toBeNull();
	});

	test("with no switch, A's subject read applies", async () => {
		const { kernel, read } = setup();
		const identified = kernel.commands.identify({ ...USER_A });
		read.resolve({ optOut: HELD_A });
		await identified;

		expect(kernel.getSnapshot().optOut).toMatchObject({
			rights: HELD_A.rights,
		});
	});

	test('a new token for the same user keeps the subject read', async () => {
		const { kernel, read } = setup();
		const identified = kernel.commands.identify({ ...USER_A });
		await Promise.resolve();
		kernel.set.user({ ...USER_A, identityToken: 'tok-a2' });
		read.resolve({ optOut: HELD_A });
		await identified;

		expect(kernel.getSnapshot().optOut).toMatchObject({
			rights: HELD_A.rights,
		});
	});
});
