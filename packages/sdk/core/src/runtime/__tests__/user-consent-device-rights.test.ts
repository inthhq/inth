/**
 * @vitest-environment jsdom
 *
 * A link answer that arrives while a `userConsent` Promise is pending stores
 * only this device's own opt-out rights, so the account's rights never
 * survive sign-out as this browser's.
 */
import type { OptOutRight, UserConsent } from '@inth/sdk-schema/types';
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
	matchedResolution,
	NOW,
	optOutRule,
} from '../../__tests__/fixtures/kernel-fixtures';
import type { OptOutAnswer } from '../../types';
import { createConsentProviderRuntime, defaultRuntimeModules } from '../index';

const SUBJECT_UUID = '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c';

const accountDocument = (
	externalId: string,
	rights: OptOutRight[],
	recordedAt: number
): UserConsent => ({
	categories: {},
	optOut: {
		advertising: rights.includes('share') || rights.includes('targeted_ads'),
		limitSensitive: false,
		recordedAt,
		rights,
		sale: rights.includes('sale'),
	},
	sync: {
		checkedAt: NOW,
		choices: {},
		externalId,
		optOut: { method: 'button', recordedAt, rights },
		vendors: {},
	},
});

const flushMacrotasks = () =>
	new Promise<void>((resolve) => {
		setTimeout(resolve, 0);
	});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('device opt-out rights from a link answer during a pending userConsent', () => {
	test('identify during a provider userConsent Promise does not keep account-only rights after sign-out', async () => {
		vi.spyOn(Date, 'now').mockReturnValue(NOW);
		const user = { externalId: 'user', identityToken: 'token' };
		const document = Promise.withResolvers<UserConsent>();
		const optOut: OptOutAnswer = {
			device: { rights: ['sale', 'share'] },
			heldBy: 'both',
			method: 'button',
			recordedAt: NOW - 2000,
			rights: ['sale', 'share', 'targeted_ads'],
		};
		const runtime = createConsentProviderRuntime(
			{
				consentCategories: ['marketing'],
				mode: Object.assign(
					() => ({
						identify: () =>
							Promise.resolve({ optOut, subjectId: SUBJECT_UUID }),
					}),
					{ kind: 'offline' as const }
				),
				persistence: false,
				prefetch: {
					initialPolicyPending: false,
					initialPolicyResolution: matchedResolution(
						optOutRule({ prompt: 'none' })
					),
					initialRecords: { subject: { subjectId: SUBJECT_UUID } },
					now: NOW,
				},
				user,
				userConsent: document.promise,
			},
			defaultRuntimeModules
		);
		try {
			runtime.start();
			expect(runtime.kernel.getSnapshot().userConsentPending).toBe(true);
			await runtime.identify(user);
			document.resolve(
				accountDocument(user.externalId, ['targeted_ads'], NOW - 500)
			);
			await vi.waitFor(() =>
				expect(runtime.kernel.getSnapshot().hasAccountLayer).toBe(true)
			);
			await runtime.identify(null);
			expect(runtime.kernel.getSnapshot().optOut?.rights).toEqual([
				'sale',
				'share',
			]);
		} finally {
			runtime.dispose();
		}
	});

	test('a both answer to identify() while the userConsent Promise is pending does not copy account-only rights into browser records', async () => {
		vi.spyOn(Date, 'now').mockReturnValue(NOW);
		const resolution = matchedResolution(optOutRule({ prompt: 'choice' }));
		const user = { externalId: 'user_pending', identityToken: 'tok_pending' };
		const consent = Promise.withResolvers<UserConsent>();
		let identifyCalls = 0;
		const runtime = createConsentProviderRuntime(
			{
				consentCategories: ['marketing'],
				mode: Object.assign(
					() => ({
						identify: (_user: unknown, subjectId: string | null) => {
							identifyCalls += 1;
							return Promise.resolve({
								optOut: {
									device: { rights: ['sale', 'share'] },
									heldBy: 'both',
									method: 'button',
									recordedAt: NOW - 5000,
									rights: ['sale', 'share', 'targeted_ads'],
								} satisfies OptOutAnswer,
								subjectId: subjectId ?? SUBJECT_UUID,
							});
						},
					}),
					{ kind: 'offline' as const }
				),
				persistence: false,
				prefetch: {
					initialPolicyPending: false,
					initialPolicyResolution: resolution,
					initialRecords: {
						now: NOW,
						optOut: {
							heldBy: 'device',
							method: 'button',
							recordedAt: NOW - 5000,
							rights: ['sale', 'share'],
						},
						subject: { subjectId: SUBJECT_UUID },
					},
					now: NOW,
				},
			},
			defaultRuntimeModules
		);
		try {
			runtime.start();
			runtime.update({ user, userConsent: consent.promise });
			// The lazy update runs identify() before the Promise resolves.
			await vi.waitFor(() => expect(identifyCalls).toBe(1));
			await flushMacrotasks();

			consent.resolve(
				accountDocument(user.externalId, ['targeted_ads'], NOW - 10_000)
			);
			await consent.promise;
			await flushMacrotasks();

			runtime.update({ user: null, userConsent: null });
			await flushMacrotasks();

			expect(runtime.kernel.getBrowserRecords().optOut?.rights).toEqual([
				'sale',
				'share',
			]);
			expect(runtime.kernel.getSnapshot().optOut?.rights).toEqual([
				'sale',
				'share',
			]);
		} finally {
			runtime.dispose();
		}
	});
});
