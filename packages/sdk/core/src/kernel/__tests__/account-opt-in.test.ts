/**
 * @vitest-environment jsdom
 *
 * How a device opt-out, the account's opt-out and the account's opt-in combine
 * across domains, and how a backend answer's `device` row sets this browser's
 * own opt-out rights.
 */
import { writePolicyResolutionWire } from '@inth/sdk-schema/types';
import type {
	OptOutRecord,
	OptOutRight,
	UserConsent,
} from '@inth/sdk-schema/types';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
	matchedResolution,
	NOW,
	optOutRule,
} from '../../__tests__/fixtures/kernel-fixtures';
import type { OptOutAnswer } from '../../consent-kernel.model';
import {
	normalizeUserConsent,
	sameAccountLayerContent,
} from '../account-layer';
import { createKernel } from '../index';
import { createMemoryOutboxStore } from '../save-outbox';

const SUBJECT_UUID = '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c';
const RECORD_UUID = '0193e5a8-7c1e-7b7a-9d7e-2f0c9a3b4d5e';
const USER = { externalId: 'user_a', identityToken: 'token_a' };
const RESOLUTION = matchedResolution(optOutRule({ prompt: 'choice' }));

const deviceOptOut = (
	recordedAt: number,
	rights: OptOutRight[] = ['sale', 'share'],
	method: OptOutRecord['method'] = 'button'
): OptOutRecord => ({ heldBy: 'device', method, recordedAt, rights });

const accountDocument = (
	sync: Partial<UserConsent['sync']> = {},
	optOut: UserConsent['optOut'] = null
): UserConsent => ({
	categories: {},
	optOut,
	sync: {
		checkedAt: NOW,
		choices: {},
		externalId: USER.externalId,
		optOut: null,
		vendors: {},
		...sync,
	},
});

const signedInKernel = (optOut: OptOutRecord | null) =>
	createKernel(
		{
			consentCategories: ['marketing'],
			initialPolicyResolution: RESOLUTION,
			initialRecords: {
				now: NOW,
				optOut,
				subject: { subjectId: SUBJECT_UUID },
			},
			initialUser: USER,
			now: NOW,
		},
		{ outboxStore: createMemoryOutboxStore() }
	);

beforeEach(() => {
	vi.spyOn(Date, 'now').mockReturnValue(NOW);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('an account opt-in and this device opt-out', () => {
	test('a newer account opt-in outranks the device opt-out while signed in, without changing the browser record', () => {
		const device = deviceOptOut(NOW - 10_000);
		const kernel = signedInKernel(device);
		try {
			expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
			const synced = vi.fn();
			kernel.events.on('opt-out:synced', synced);

			kernel.syncUserConsent(
				accountDocument({ optIn: { sale: NOW - 5000, share: NOW - 5000 } })
			);

			expect(kernel.getSnapshot().optOut).toBeNull();
			expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(true);
			expect(kernel.getBrowserRecords().optOut).toEqual(device);
			expect(synced).toHaveBeenCalledOnce();
		} finally {
			kernel.dispose();
		}
	});

	test('after sign-out the device opt-out applies again', () => {
		const device = deviceOptOut(NOW - 10_000);
		const kernel = signedInKernel(device);
		try {
			kernel.syncUserConsent(
				accountDocument({ optIn: { sale: NOW - 5000, share: NOW - 5000 } })
			);
			expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(true);

			kernel.setUserWithPending(null, { pending: false });

			expect(kernel.getSnapshot().optOut).toEqual(device);
			expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
		} finally {
			kernel.dispose();
		}
	});

	test('the device opt-out applies again when the account layer is dropped with userConsent null', () => {
		const device = deviceOptOut(NOW - 10_000);
		const kernel = signedInKernel(device);
		try {
			kernel.syncUserConsent(
				accountDocument({ optIn: { sale: NOW - 5000, share: NOW - 5000 } })
			);
			kernel.syncUserConsent(null);

			expect(kernel.getSnapshot().optOut).toEqual(device);
			expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
		} finally {
			kernel.dispose();
		}
	});

	test('an account opt-in older than the device opt-out leaves the device opt-out in force', () => {
		const device = deviceOptOut(NOW - 5000);
		const kernel = signedInKernel(device);
		try {
			kernel.syncUserConsent(
				accountDocument({ optIn: { sale: NOW - 10_000, share: NOW - 10_000 } })
			);

			expect(kernel.getSnapshot().optOut).toEqual(device);
			expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
		} finally {
			kernel.dispose();
		}
	});

	test('an opt-in at the same time as the device opt-out leaves the opt-out in force', () => {
		const device = deviceOptOut(NOW - 5000);
		const kernel = signedInKernel(device);
		try {
			kernel.syncUserConsent(
				accountDocument({ optIn: { sale: NOW - 5000, share: NOW - 5000 } })
			);

			expect(kernel.getSnapshot().optOut).toEqual(device);
		} finally {
			kernel.dispose();
		}
	});

	test('an opt-in that covers sale but not share leaves only share in force', () => {
		const device = deviceOptOut(NOW - 10_000);
		const kernel = signedInKernel(device);
		try {
			kernel.syncUserConsent(accountDocument({ optIn: { sale: NOW - 5000 } }));

			expect(kernel.getSnapshot().optOut).toMatchObject({
				heldBy: 'device',
				rights: ['share'],
			});
			expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
			expect(kernel.getBrowserRecords().optOut).toEqual(device);
		} finally {
			kernel.dispose();
		}
	});

	test('a GPC device opt-out stays in force under a newer account opt-in', () => {
		const device = deviceOptOut(NOW - 10_000, ['sale', 'share'], 'gpc');
		const kernel = signedInKernel(device);
		try {
			kernel.syncUserConsent(
				accountDocument({ optIn: { sale: NOW - 5000, share: NOW - 5000 } })
			);

			expect(kernel.getSnapshot().optOut).toEqual(device);
			expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
		} finally {
			kernel.dispose();
		}
	});

	test('an account with no opt-out and no opt-in never clears the device opt-out', () => {
		const device = deviceOptOut(NOW - 10_000);
		const kernel = signedInKernel(device);
		try {
			kernel.syncUserConsent(accountDocument({ checkedAt: NOW + 60_000 }));

			expect(kernel.getSnapshot().optOut).toEqual(device);
			expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
			expect(kernel.getBrowserRecords().optOut).toEqual(device);
		} finally {
			kernel.dispose();
		}
	});

	test('a newer account document without an opt-out keeps a confirmed, linked device opt-out', async () => {
		// An older backend still sends the device row's write time.
		const device = {
			rights: ['sale', 'share', 'targeted_ads'] as OptOutRight[],
			writtenAt: NOW - 5000,
		};
		const kernel = createKernel(
			{
				consentCategories: ['marketing'],
				initialPolicyResolution: RESOLUTION,
				initialUser: USER,
				now: NOW - 5000,
				transport: {
					optOut: (payload) =>
						Promise.resolve({
							link: { stored: true, verifiedBy: 'identity_token' },
							ok: true,
							optOut: {
								device,
								heldBy: 'both',
								method: 'button',
								recordedAt: NOW - 5000,
								rights: ['sale', 'share', 'targeted_ads'],
							},
							recordId: RECORD_UUID,
							subjectId: payload.subjectId,
						}),
				},
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		try {
			kernel.syncUserConsent(accountDocument({ checkedAt: NOW - 6000 }));
			expect((await kernel.commands.optOut({ actionAt: NOW - 5000 })).ok).toBe(
				true
			);

			kernel.syncUserConsent(accountDocument({ checkedAt: NOW }));

			expect(kernel.getBrowserRecords().optOut).toMatchObject({
				heldBy: 'device',
				rights: ['sale', 'share', 'targeted_ads'],
			});
			expect(kernel.getSnapshot().optOut).not.toBeNull();
			expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
		} finally {
			kernel.dispose();
		}
	});

	test('the account opt-out and the account opt-in compare per right in server time', () => {
		const kernel = signedInKernel(null);
		try {
			kernel.syncUserConsent(
				accountDocument(
					{
						optIn: { sale: NOW - 2000, share: NOW - 4000 },
						optOut: {
							method: 'button',
							recordedAt: NOW - 3000,
							rights: ['sale', 'share', 'targeted_ads'],
						},
					},
					{
						advertising: true,
						limitSensitive: false,
						recordedAt: NOW - 3000,
						rights: ['sale', 'share', 'targeted_ads'],
						sale: true,
					}
				)
			);

			expect(kernel.getSnapshot().optOut).toMatchObject({
				heldBy: 'person',
				rights: ['share', 'targeted_ads'],
			});
		} finally {
			kernel.dispose();
		}
	});

	test('a click here after the account opt-in records a new device opt-out', async () => {
		const device = deviceOptOut(NOW - 10_000);
		const optOut = vi.fn((payload: { givenAt: number; subjectId: string }) =>
			Promise.resolve({
				ok: true as const,
				optOut: {
					device: { rights: ['sale', 'share'] as OptOutRight[] },
					heldBy: 'both' as const,
					method: 'button' as const,
					recordedAt: payload.givenAt,
					rights: ['sale', 'share'] as OptOutRight[],
				},
				recordId: RECORD_UUID,
				subjectId: payload.subjectId,
			})
		);
		const kernel = createKernel(
			{
				consentCategories: ['marketing'],
				initialPolicyResolution: RESOLUTION,
				initialRecords: {
					now: NOW,
					optOut: device,
					subject: { subjectId: SUBJECT_UUID },
				},
				initialUser: USER,
				now: NOW,
				transport: { optOut },
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		try {
			kernel.syncUserConsent(
				accountDocument({ optIn: { sale: NOW - 5000, share: NOW - 5000 } })
			);
			expect(kernel.getSnapshot().optOut).toBeNull();

			const result = await kernel.commands.optOut();

			expect(result).toMatchObject({ changed: true, ok: true });
			expect(optOut).toHaveBeenCalledOnce();
			expect(kernel.getBrowserRecords().optOut).toMatchObject({
				heldBy: 'device',
				recordedAt: NOW,
				rights: ['sale', 'share'],
			});
			expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
		} finally {
			kernel.dispose();
		}
	});

	test('a document from a backend without optIn reads as no opt-ins', () => {
		const layer = normalizeUserConsent(accountDocument(), NOW);
		expect(layer).not.toBeNull();
		expect(layer?.optIn).toBeUndefined();
	});

	test('two documents that differ only in optIn are not the same content', () => {
		const without = normalizeUserConsent(accountDocument(), NOW);
		const withOptIn = normalizeUserConsent(
			accountDocument({ optIn: { sale: NOW - 1000 } }),
			NOW
		);
		expect(sameAccountLayerContent(without, withOptIn)).toBe(false);
		expect(
			sameAccountLayerContent(
				withOptIn,
				normalizeUserConsent(
					accountDocument({ optIn: { sale: NOW - 1000 } }),
					NOW
				)
			)
		).toBe(true);
	});
});

describe('this device opt-out rights come from the device row', () => {
	const bothAnswer = (
		device: OptOutRight[] | undefined,
		recordedAt = NOW - 2000
	): OptOutAnswer => {
		const answer: OptOutAnswer = {
			heldBy: 'both',
			method: 'button',
			recordedAt,
			rights: ['sale', 'share', 'targeted_ads'],
		};
		if (device !== undefined) {
			answer.device = { rights: device };
		}
		return answer;
	};

	test('a link answer before a delayed account document stores only the device rights', async () => {
		const kernel = createKernel(
			{
				consentCategories: ['marketing'],
				initialPolicyResolution: RESOLUTION,
				initialRecords: { subject: { subjectId: SUBJECT_UUID } },
				initialUser: USER,
				now: NOW,
				transport: {
					identify: () =>
						Promise.resolve({
							optOut: bothAnswer(['sale', 'share']),
							subjectId: SUBJECT_UUID,
						}),
				},
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		try {
			kernel.setUserConsentPending(true);
			await kernel.commands.identify(USER);
			kernel.settleUserConsent(
				accountDocument(
					{
						optOut: {
							method: 'button',
							recordedAt: NOW - 3000,
							rights: ['targeted_ads'],
						},
					},
					{
						advertising: true,
						limitSensitive: false,
						recordedAt: NOW - 3000,
						rights: ['targeted_ads'],
						sale: false,
					}
				),
				{ clearPending: true }
			);
			kernel.setUserWithPending(null, { pending: false });

			expect(kernel.getBrowserRecords().optOut?.rights).toEqual([
				'sale',
				'share',
			]);
		} finally {
			kernel.dispose();
		}
	});

	test('sign-in identify answering both before a pending userConsent resolves keeps only device rights after sign-out', async () => {
		const kernel = createKernel(
			{
				consentCategories: ['marketing'],
				initialOverrides: { country: 'US', region: 'CA' },
				initialPolicyResolution: RESOLUTION,
				initialRecords: {
					optOut: deviceOptOut(NOW - 86_400_000),
					subject: { subjectId: SUBJECT_UUID },
				},
				now: NOW,
				transport: {
					identify: () =>
						Promise.resolve({
							optOut: bothAnswer(['sale', 'share'], NOW - 86_400_000),
							subjectId: SUBJECT_UUID,
						}),
				},
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		try {
			kernel.setUserWithPending(USER, { pending: true });
			await kernel.commands.identify(USER);
			kernel.settleUserConsent(
				accountDocument({
					optOut: {
						method: 'button',
						recordedAt: NOW - 3000,
						rights: ['targeted_ads'],
					},
				}),
				{ clearPending: true }
			);
			kernel.setUserWithPending(null, { pending: false });

			expect(kernel.getSnapshot().optOut?.rights).toEqual(['sale', 'share']);
		} finally {
			kernel.dispose();
		}
	});

	test('a both answer seen before the account layer arrives keeps only device rights after sign-out', async () => {
		const kernel = createKernel(
			{
				consentCategories: ['marketing'],
				initialOverrides: { country: 'US', region: 'CA' },
				initialPolicyResolution: RESOLUTION,
				initialRecords: { subject: { subjectId: SUBJECT_UUID } },
				initialUser: USER,
				now: NOW,
				transport: {
					optOut: (payload) =>
						Promise.resolve({
							link: { stored: true, verifiedBy: 'identity_token' },
							ok: true,
							optOut: bothAnswer(['sale', 'share'], NOW),
							recordId: RECORD_UUID,
							subjectId: payload.subjectId,
						}),
				},
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		try {
			expect(await kernel.commands.optOut()).toMatchObject({ ok: true });
			kernel.syncUserConsent(
				accountDocument({
					checkedAt: NOW + 10,
					optOut: {
						method: 'button',
						recordedAt: NOW - 3000,
						rights: ['targeted_ads'],
					},
				})
			);
			kernel.setUserWithPending(null, { pending: false });

			expect(kernel.getSnapshot().optOut?.rights).toEqual(['sale', 'share']);
		} finally {
			kernel.dispose();
		}
	});

	test('an older backend without device: with no user set, a both answer is stored as before', async () => {
		const kernel = createKernel(
			{
				consentCategories: ['marketing'],
				initialPolicyResolution: RESOLUTION,
				initialRecords: { subject: { subjectId: SUBJECT_UUID } },
				now: NOW,
				transport: {
					init: () =>
						Promise.resolve({
							policyResolution: writePolicyResolutionWire(RESOLUTION),
							records: { optOut: bothAnswer(undefined) },
							subjectId: SUBJECT_UUID,
						}),
				},
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		try {
			await kernel.commands.init();
			expect(kernel.getBrowserRecords().optOut?.rights).toEqual([
				'sale',
				'share',
				'targeted_ads',
			]);
		} finally {
			kernel.dispose();
		}
	});

	test('an older backend without device: with a user set, a both answer leaves the browser rights unconfirmed', async () => {
		const held = deviceOptOut(NOW - 2000, ['sale', 'share']);
		const kernel = createKernel(
			{
				consentCategories: ['marketing'],
				initialPolicyResolution: RESOLUTION,
				initialRecords: { optOut: held, subject: { subjectId: SUBJECT_UUID } },
				initialUser: USER,
				now: NOW,
				transport: {
					identify: () =>
						Promise.resolve({
							optOut: bothAnswer(undefined),
							subjectId: SUBJECT_UUID,
						}),
					init: () =>
						Promise.resolve({
							policyResolution: writePolicyResolutionWire(RESOLUTION),
							records: { optOut: bothAnswer(undefined) },
							subjectId: SUBJECT_UUID,
						}),
				},
			},
			{ outboxStore: createMemoryOutboxStore() }
		);
		try {
			await kernel.commands.init();
			await kernel.commands.identify(USER);

			expect(kernel.getBrowserRecords().optOut).toEqual(held);
			expect(kernel.getOptOutReceiptData().rightsConfirmed).toBe(false);
		} finally {
			kernel.dispose();
		}
	});
});

describe('receipt metadata after a server answer with a device row', () => {
	const kernelWithInit = (
		answer: OptOutAnswer,
		held: OptOutRecord = deviceOptOut(NOW - 10_000, ['sale'])
	) =>
		createKernel(
			{
				consentCategories: ['marketing'],
				initialPolicyResolution: RESOLUTION,
				initialRecords: {
					now: NOW,
					optOut: held,
					optOutLocalAct: 'button',
					optOutReference: RECORD_UUID,
					optOutRightsConfirmed: false,
					subject: { subjectId: SUBJECT_UUID },
				},
				now: NOW,
				transport: {
					init: () =>
						Promise.resolve({
							policyResolution: writePolicyResolutionWire(RESOLUTION),
							records: { optOut: answer },
							subjectId: SUBJECT_UUID,
						}),
				},
			},
			{ outboxStore: createMemoryOutboxStore() }
		);

	test('a newer, different opt-out on init() clears the old local act and reference', async () => {
		const kernel = kernelWithInit({
			device: { rights: ['sale', 'share'] },
			heldBy: 'device',
			method: 'gpc',
			recordedAt: NOW - 1000,
			rights: ['sale', 'share'],
		});
		try {
			await kernel.commands.init();
			expect(kernel.getBrowserRecords().optOut?.method).toBe('gpc');
			expect(kernel.getOptOutReceiptData()).toEqual({
				localAct: null,
				reference: null,
				rightsConfirmed: true,
			});
		} finally {
			kernel.dispose();
		}
	});

	test('an older answer the fold rejects leaves the receipt unchanged', async () => {
		const kernel = kernelWithInit({
			device: { rights: ['sale', 'share'] },
			heldBy: 'device',
			method: 'gpc',
			recordedAt: NOW - 20_000,
			rights: ['sale', 'share'],
		});
		try {
			await kernel.commands.init();
			expect(kernel.getBrowserRecords().optOut?.method).toBe('button');
			expect(kernel.getOptOutReceiptData()).toEqual({
				localAct: 'button',
				reference: RECORD_UUID,
				rightsConfirmed: false,
			});
		} finally {
			kernel.dispose();
		}
	});

	test('the answer to the same act confirms the receipt and keeps the local act', async () => {
		const kernel = kernelWithInit({
			device: { rights: ['sale'] },
			heldBy: 'device',
			method: 'button',
			recordedAt: NOW - 10_000,
			rights: ['sale'],
		});
		try {
			await kernel.commands.init();
			expect(kernel.getOptOutReceiptData()).toEqual({
				localAct: 'button',
				reference: RECORD_UUID,
				rightsConfirmed: true,
			});
		} finally {
			kernel.dispose();
		}
	});
});
