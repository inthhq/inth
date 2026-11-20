/**
 * Durable opt-out record through the kernel's public boundaries: commands
 * (`optOut`, `optIn`, `save`), live GPC recording, hydration, events,
 * notice acknowledgement and freezing.
 */
import type { OptOutRecord } from '@inth/sdk-schema/types';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
	choiceRecords,
	DAY,
	matchedResolution,
	noneRule,
	noticeRule,
	NOW,
	optInRule,
	optOutRule,
} from '../../__tests__/fixtures/kernel-fixtures';
import type { KernelConfig } from '../../types';
import { createKernel as assembleKernel } from '../index';

const usOptOutRule = () =>
	optOutRule({
		privacySignals: { gpc: { denyCategories: ['marketing', 'measurement'] } },
		prompt: 'none',
	});

const createKernel = function createKernel(overrides: KernelConfig = {}) {
	return assembleKernel({
		initialLocation: { countryCode: 'US', regionCode: 'CA' },
		initialPolicyResolution: matchedResolution(usOptOutRule()),
		now: NOW,
		...overrides,
	});
};

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

const ALL_RIGHTS = ['sale', 'share', 'targeted_ads'] as const;

describe('commands.optOut()', () => {
	test('records all three rights locally when the transport has no optOut method, without touching explicitChoice', async () => {
		const kernel = createKernel({
			initialLocation: { countryCode: 'US', regionCode: 'CA' },
		});
		const recorded = vi.fn();
		const choiceRecorded = vi.fn();
		kernel.events.on('opt-out:recorded', recorded);
		kernel.events.on('choice:recorded', choiceRecorded);

		const result = await kernel.commands.optOut({ uiSource: 'widget' });

		expect(result).toEqual({
			changed: true,
			ok: true,
			optOut: {
				heldBy: 'device',
				method: 'button',
				recordedAt: NOW,
				rights: [...ALL_RIGHTS],
			},
		});
		const snap = kernel.getSnapshot();
		expect(snap.optOut).toEqual({
			heldBy: 'device',
			method: 'button',
			recordedAt: NOW,
			rights: [...ALL_RIGHTS],
		});
		expect(Object.isFrozen(snap.optOut)).toBe(true);
		expect(Object.isFrozen(snap.optOut?.rights)).toBe(true);
		expect(snap.explicitChoice).toBeNull();
		expect(snap.effectivePermissions.marketing).toBe(false);
		expect(snap.effectivePermissions.measurement).toBe(false);
		expect(snap.effectivePermissions.functionality).toBe(true);
		expect(snap.restrictions).toEqual({
			marketing: ['opt-out'],
			measurement: ['opt-out'],
		});
		expect(recorded).toHaveBeenCalledTimes(1);
		expect(recorded.mock.calls[0]?.[0]).toMatchObject({
			actionAt: NOW,
			optOut: snap.optOut,
			snapshot: snap,
			type: 'opt-out:recorded',
			uiSource: 'widget',
		});
		expect(choiceRecorded).not.toHaveBeenCalled();
		kernel.dispose();
	});

	test.each([
		['empty rights', [] as const],
		['subset of rights', ['sale'] as const],
		['state rights', ['sale', 'share'] as const],
		['all rights', ALL_RIGHTS],
	])(
		'is a no-op when an opt-out record already exists (%s)',
		async (_label, rights) => {
			const existing: OptOutRecord = {
				heldBy: 'person',
				method: 'gpc',
				recordedAt: NOW - 5000,
				rights: [...rights],
			};
			const kernel = createKernel({
				initialLocation: { countryCode: 'US', regionCode: 'CA' },
				initialRecords: { now: NOW, optOut: existing },
			});
			const recorded = vi.fn();
			kernel.events.on('opt-out:recorded', recorded);
			const before = kernel.getSnapshot();

			const result = await kernel.commands.optOut();

			expect(result).toEqual({
				changed: false,
				ok: true,
				optOut: existing,
			});
			expect(kernel.getSnapshot()).toBe(before);
			expect(recorded).not.toHaveBeenCalled();
			kernel.dispose();
		}
	);

	test('works under an opt-out rule with no GPC mapping and denies marketing and measurement', async () => {
		const kernel = createKernel({
			initialPolicyResolution: matchedResolution(
				optOutRule({ privacySignals: { gpc: { denyCategories: [] } } })
			),
		});
		const recorded = vi.fn();
		kernel.events.on('opt-out:recorded', recorded);

		const result = await kernel.commands.optOut();

		expect(result).toEqual({
			changed: true,
			ok: true,
			optOut: {
				heldBy: 'device',
				method: 'button',
				recordedAt: NOW,
				rights: [...ALL_RIGHTS],
			},
		});
		const snap = kernel.getSnapshot();
		expect(snap.effectivePermissions.marketing).toBe(false);
		expect(snap.effectivePermissions.measurement).toBe(false);
		expect(snap.effectivePermissions.functionality).toBe(true);
		expect(snap.restrictions).toEqual({
			marketing: ['opt-out'],
			measurement: ['opt-out'],
		});
		expect(recorded).toHaveBeenCalledTimes(1);
		kernel.dispose();
	});

	test('records the opt-out under an opt-out rule where neither marketing nor measurement is in scope', async () => {
		const kernel = createKernel({
			initialPolicyResolution: matchedResolution(
				optOutRule({
					categories: ['functionality', 'experience'],
					prompt: 'none',
					scopeMode: 'permissive',
				})
			),
		});

		const result = await kernel.commands.optOut();

		expect(result.ok).toBe(true);
		expect(kernel.getSnapshot().optOut).toEqual({
			heldBy: 'device',
			method: 'button',
			recordedAt: NOW,
			rights: [...ALL_RIGHTS],
		});
		expect(kernel.getSnapshot().restrictions).toEqual({});
		kernel.dispose();
	});

	test.each([
		['opt-in', { initialPolicyResolution: matchedResolution(optInRule()) }],
		['none', { initialPolicyResolution: matchedResolution(noneRule()) }],
		[
			'pending fallback',
			{ initialPolicyPending: true, initialPolicyResolution: undefined },
		],
	] as [string, KernelConfig][])(
		'returns not-available under a %s rule',
		async (_label, config) => {
			const kernel = createKernel(config);
			const recorded = vi.fn();
			kernel.events.on('opt-out:recorded', recorded);

			const result = await kernel.commands.optOut();

			expect(result).toEqual({ ok: false, reason: 'not-available' });
			expect(kernel.getSnapshot().optOut).toBeNull();
			expect(recorded).not.toHaveBeenCalled();
			kernel.dispose();
		}
	);

	test('acknowledges an owed notice prompt in the same commit', async () => {
		const kernel = createKernel({
			initialPolicyResolution: matchedResolution(
				noticeRule({
					privacySignals: { gpc: { denyCategories: ['marketing'] } },
				})
			),
		});
		expect(kernel.getSnapshot().promptRequirement.kind).toBe('notice');

		const result = await kernel.commands.optOut();

		expect(result.ok).toBe(true);
		expect(kernel.getSnapshot().promptRequirement).toEqual({ kind: 'none' });
		expect(kernel.getSnapshot().noticeDismissal).toEqual({
			dismissedAt: NOW,
			fingerprint: kernel.getSnapshot().evaluationPolicy.notice.fingerprint,
			version: 1,
		});
		kernel.dispose();
	});

	test('throws when external CMP permissions own consent', async () => {
		const kernel = createKernel({ initialExternalPermissions: {} });
		await expect(kernel.commands.optOut()).rejects.toThrow(/external CMP/u);
		kernel.dispose();
	});
});

describe('commands.optIn()', () => {
	test('returns not-opted-out when no opt-out record is held', async () => {
		const kernel = createKernel();
		expect(await kernel.commands.optIn()).toEqual({
			ok: false,
			reason: 'not-opted-out',
		});
		kernel.dispose();
	});

	test('returns gpc-active and keeps the record when GPC is active under a rule with a deny list', async () => {
		const existing: OptOutRecord = {
			heldBy: 'device',
			method: 'gpc',
			recordedAt: NOW - 1000,
			rights: ['sale', 'share'],
		};
		const kernel = createKernel({
			initialPrivacySignals: { gpc: true },
			initialRecords: { now: NOW, optOut: existing },
		});
		const lifted = vi.fn();
		kernel.events.on('opt-out:lifted', lifted);

		expect(await kernel.commands.optIn()).toEqual({
			ok: false,
			reason: 'gpc-active',
		});
		expect(kernel.getSnapshot().optOut).toEqual(existing);
		expect(lifted).not.toHaveBeenCalled();
		kernel.dispose();
	});

	test.each(['person', 'both'] as const)(
		'returns held-by-account and keeps the record when heldBy is %s',
		async (heldBy) => {
			const existing: OptOutRecord = {
				heldBy,
				method: 'propagated',
				recordedAt: NOW - 1000,
				rights: ['sale', 'share'],
			};
			const kernel = createKernel({
				initialRecords: { now: NOW, optOut: existing },
			});
			const lifted = vi.fn();
			kernel.events.on('opt-out:lifted', lifted);

			expect(await kernel.commands.optIn()).toEqual({
				ok: false,
				reason: 'held-by-account',
			});
			expect(kernel.getSnapshot().optOut).toEqual(existing);
			expect(lifted).not.toHaveBeenCalled();
			kernel.dispose();
		}
	);

	test('lifts a device-held opt-out when GPC is off, re-evaluates and emits opt-out:lifted', async () => {
		const existing: OptOutRecord = {
			heldBy: 'device',
			method: 'button',
			recordedAt: NOW - 1000,
			rights: ['sale', 'share'],
		};
		const kernel = createKernel({
			initialRecords: { now: NOW, optOut: existing },
		});
		const lifted = vi.fn();
		kernel.events.on('opt-out:lifted', lifted);
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);

		const result = await kernel.commands.optIn({ uiSource: 'dialog' });

		expect(result).toEqual({ ok: true, optOut: null });
		expect(kernel.getSnapshot().optOut).toBeNull();
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(true);
		expect(kernel.getSnapshot().effectivePermissions.measurement).toBe(true);
		expect(kernel.getSnapshot().restrictions).toEqual({});
		expect(lifted).toHaveBeenCalledTimes(1);
		expect(lifted.mock.calls[0]?.[0]).toMatchObject({
			actionAt: NOW,
			snapshot: kernel.getSnapshot(),
			type: 'opt-out:lifted',
			uiSource: 'dialog',
		});
		kernel.dispose();
	});

	test('throws when external CMP permissions own consent', async () => {
		const kernel = createKernel({ initialExternalPermissions: {} });
		await expect(kernel.commands.optIn()).rejects.toThrow(/external CMP/u);
		kernel.dispose();
	});
});

describe('commands.save() interaction with opt-out', () => {
	test('granting a denied category lifts a device-held opt-out in the same commit and emits opt-out:lifted after choice:recorded', async () => {
		const kernel = createKernel({
			initialRecords: {
				now: NOW,
				optOut: {
					heldBy: 'device',
					method: 'button',
					recordedAt: NOW - 1000,
					rights: ['sale', 'share'],
				},
			},
		});
		const order: string[] = [];
		const seenOptOutInChoice: (OptOutRecord | null)[] = [];
		kernel.events.on('choice:recorded', ({ snapshot }) => {
			order.push('choice:recorded');
			seenOptOutInChoice.push(snapshot.optOut);
		});
		kernel.events.on('opt-out:lifted', () => {
			order.push('opt-out:lifted');
		});

		await kernel.commands.save({ marketing: true });

		expect(order).toEqual(['choice:recorded', 'opt-out:lifted']);
		expect(seenOptOutInChoice).toEqual([null]);
		expect(kernel.getSnapshot().optOut).toBeNull();
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(true);
		kernel.dispose();
	});

	test('does not lift when GPC is active; choice saves and category stays restricted', async () => {
		const existing: OptOutRecord = {
			heldBy: 'device',
			method: 'gpc',
			recordedAt: NOW - 1000,
			rights: ['sale', 'share'],
		};
		const kernel = createKernel({
			initialPrivacySignals: { gpc: true },
			initialRecords: { now: NOW, optOut: existing },
		});
		const lifted = vi.fn();
		kernel.events.on('opt-out:lifted', lifted);

		await kernel.commands.save({ marketing: true });

		expect(
			kernel.getSnapshot().explicitChoice?.categories.marketing?.value
		).toBe(true);
		expect(kernel.getSnapshot().optOut).toEqual(existing);
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
		expect(kernel.getSnapshot().restrictions.marketing).toEqual([
			'gpc',
			'opt-out',
		]);
		expect(lifted).not.toHaveBeenCalled();
		kernel.dispose();
	});

	test.each(['person', 'both'] as const)(
		'does not lift when heldBy is %s; choice saves and category stays restricted',
		async (heldBy) => {
			const existing: OptOutRecord = {
				heldBy,
				method: 'api',
				recordedAt: NOW - 1000,
				rights: ['sale', 'share'],
			};
			const kernel = createKernel({
				initialRecords: { now: NOW, optOut: existing },
			});
			const lifted = vi.fn();
			kernel.events.on('opt-out:lifted', lifted);

			await kernel.commands.save({ marketing: true });

			expect(
				kernel.getSnapshot().explicitChoice?.categories.marketing?.value
			).toBe(true);
			expect(kernel.getSnapshot().optOut).toEqual(existing);
			expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
			expect(kernel.getSnapshot().restrictions.marketing).toEqual(['opt-out']);
			expect(lifted).not.toHaveBeenCalled();
			kernel.dispose();
		}
	);

	test('granting one switched-off category lifts a device-held opt-out even when the other stays refused and GPC mapping is empty', async () => {
		const kernel = createKernel({
			initialPolicyResolution: matchedResolution(
				optOutRule({
					privacySignals: { gpc: { denyCategories: [] } },
					prompt: 'none',
				})
			),
			initialRecords: {
				...choiceRecords({ marketing: false, measurement: false }),
				now: NOW,
				optOut: {
					heldBy: 'device',
					method: 'button',
					recordedAt: NOW - 1000,
					rights: ['sale', 'share'],
				},
			},
		});
		const lifted = vi.fn();
		kernel.events.on('opt-out:lifted', lifted);

		await kernel.commands.save({ marketing: true });

		expect(kernel.getSnapshot().optOut).toBeNull();
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(true);
		expect(kernel.getSnapshot().effectivePermissions.measurement).toBe(false);
		expect(kernel.getSnapshot().restrictions).toEqual({
			measurement: ['explicit-denial'],
		});
		expect(lifted).toHaveBeenCalledTimes(1);
		kernel.dispose();
	});

	test('granting one and refusing the other in one save lifts the opt-out and does not record one', async () => {
		const kernel = createKernel({
			initialRecords: {
				now: NOW,
				optOut: {
					heldBy: 'device',
					method: 'button',
					recordedAt: NOW - 1000,
					rights: ['sale', 'share'],
				},
			},
		});
		const lifted = vi.fn();
		const recorded = vi.fn();
		kernel.events.on('opt-out:lifted', lifted);
		kernel.events.on('opt-out:recorded', recorded);

		await kernel.commands.save({ marketing: true, measurement: false });

		expect(kernel.getSnapshot().optOut).toBeNull();
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(true);
		expect(kernel.getSnapshot().effectivePermissions.measurement).toBe(false);
		expect(lifted).toHaveBeenCalledTimes(1);
		expect(recorded).not.toHaveBeenCalled();
		kernel.dispose();
	});

	test('reject-all under an opt-out rule records an opt-out in the same commit after choice:recorded', async () => {
		const kernel = createKernel({
			consentCategories: [
				'necessary',
				'functionality',
				'experience',
				'measurement',
				'marketing',
			],
			initialPolicyResolution: matchedResolution(
				optOutRule({
					privacySignals: { gpc: { denyCategories: [] } },
					prompt: 'none',
				})
			),
		});
		const order: string[] = [];
		const seenOptOutInChoice: (OptOutRecord | null)[] = [];
		const recorded = vi.fn();
		kernel.events.on('choice:recorded', ({ snapshot }) => {
			order.push('choice:recorded');
			seenOptOutInChoice.push(snapshot.optOut);
		});
		kernel.events.on('opt-out:recorded', (event) => {
			order.push('opt-out:recorded');
			recorded(event);
		});

		await kernel.commands.save('none', { uiSource: 'dialog' });

		expect(order).toEqual(['choice:recorded', 'opt-out:recorded']);
		const snap = kernel.getSnapshot();
		expect(snap.optOut).toEqual({
			heldBy: 'device',
			method: 'button',
			recordedAt: NOW,
			rights: [...ALL_RIGHTS],
		});
		expect(seenOptOutInChoice).toEqual([snap.optOut]);
		expect(recorded.mock.calls[0]?.[0]).toMatchObject({
			actionAt: NOW,
			optOut: snap.optOut,
			snapshot: snap,
			type: 'opt-out:recorded',
			uiSource: 'dialog',
		});
		kernel.dispose();
	});

	test('turning both marketing and measurement off in one save records an opt-out', async () => {
		const kernel = createKernel();
		const recorded = vi.fn();
		kernel.events.on('opt-out:recorded', recorded);

		await kernel.commands.save(
			{ marketing: false, measurement: false },
			{ uiSource: 'widget' }
		);

		expect(kernel.getSnapshot().optOut).toEqual({
			heldBy: 'device',
			method: 'button',
			recordedAt: NOW,
			rights: [...ALL_RIGHTS],
		});
		expect(recorded).toHaveBeenCalledTimes(1);
		expect(recorded.mock.calls[0]?.[0].uiSource).toBe('widget');
		kernel.dispose();
	});

	test.each([
		['undecided', { marketing: false }],
		['granted', { marketing: false, measurement: true }],
		['refused', { marketing: false, measurement: false }],
	] as const)(
		'refusing marketing alone records an opt-out while measurement is %s',
		async (state, input) => {
			const kernel = createKernel();
			const recorded = vi.fn();
			kernel.events.on('opt-out:recorded', recorded);

			await kernel.commands.save(input, { uiSource: 'widget' });

			expect(kernel.getSnapshot().optOut).toEqual({
				heldBy: 'device',
				method: 'button',
				recordedAt: NOW,
				rights: [...ALL_RIGHTS],
			});
			expect(recorded).toHaveBeenCalledTimes(1);
			expect(recorded.mock.calls[0]?.[0].uiSource).toBe('widget');
			expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
			expect(kernel.getSnapshot().effectivePermissions.measurement).toBe(
				state === 'granted'
			);
			kernel.dispose();
		}
	);

	test('refusing measurement alone records nothing when marketing is in scope', async () => {
		const kernel = createKernel();
		const recorded = vi.fn();
		kernel.events.on('opt-out:recorded', recorded);

		await kernel.commands.save({ measurement: false });
		expect(kernel.getSnapshot().optOut).toBeNull();
		expect(recorded).not.toHaveBeenCalled();

		// A later save refusing marketing records the opt-out.
		vi.setSystemTime(NOW + 2000);
		await kernel.commands.save({ marketing: false });
		expect(kernel.getSnapshot().optOut).toEqual({
			heldBy: 'device',
			method: 'button',
			recordedAt: NOW + 2000,
			rights: [...ALL_RIGHTS],
		});
		expect(recorded).toHaveBeenCalledTimes(1);

		// A later save when an opt-out already exists records nothing new.
		vi.setSystemTime(NOW + 4000);
		await kernel.commands.save({ marketing: false });
		expect(kernel.getSnapshot().optOut?.recordedAt).toBe(NOW + 2000);
		expect(recorded).toHaveBeenCalledTimes(1);
		kernel.dispose();
	});

	test('granting measurement alone does not lift a held opt-out when marketing is in scope', async () => {
		const existing: OptOutRecord = {
			heldBy: 'device',
			method: 'button',
			recordedAt: NOW - 1000,
			rights: ['sale', 'share'],
		};
		const kernel = createKernel({
			initialRecords: {
				...choiceRecords({ marketing: false, measurement: false }),
				now: NOW,
				optOut: existing,
			},
		});
		const lifted = vi.fn();
		kernel.events.on('opt-out:lifted', lifted);

		await kernel.commands.save({ measurement: true });

		expect(kernel.getSnapshot().optOut).toEqual(existing);
		expect(lifted).not.toHaveBeenCalled();
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
		expect(kernel.getSnapshot().effectivePermissions.measurement).toBe(true);
		expect(kernel.getSnapshot().restrictions).toEqual({
			marketing: ['explicit-denial', 'opt-out'],
		});
		kernel.dispose();
	});

	test('when marketing is not in scope, measurement decides both recording and lifting', async () => {
		const kernel = createKernel({
			consentCategories: ['necessary', 'functionality', 'measurement'],
			initialPolicyResolution: matchedResolution(
				optOutRule({
					categories: ['functionality', 'measurement'],
					prompt: 'none',
					scopeMode: 'permissive',
				})
			),
		});
		const recorded = vi.fn();
		const lifted = vi.fn();
		kernel.events.on('opt-out:recorded', recorded);
		kernel.events.on('opt-out:lifted', lifted);

		await kernel.commands.save({ measurement: false });
		expect(kernel.getSnapshot().optOut).toEqual({
			heldBy: 'device',
			method: 'button',
			recordedAt: NOW,
			rights: [...ALL_RIGHTS],
		});
		expect(recorded).toHaveBeenCalledTimes(1);

		await kernel.commands.save({ measurement: true });
		expect(kernel.getSnapshot().optOut).toBeNull();
		expect(lifted).toHaveBeenCalledTimes(1);
		expect(kernel.getSnapshot().effectivePermissions.measurement).toBe(true);
		kernel.dispose();
	});

	test('under an opt-in rule, granting marketing lifts a held opt-out while refusing marketing records none', async () => {
		const existing: OptOutRecord = {
			heldBy: 'device',
			method: 'button',
			recordedAt: NOW - 1000,
			rights: ['sale', 'share'],
		};
		const kernel = createKernel({
			consentCategories: [
				'necessary',
				'functionality',
				'experience',
				'measurement',
				'marketing',
			],
			initialPolicyResolution: matchedResolution(optInRule()),
			initialRecords: { now: NOW, optOut: existing },
		});
		const lifted = vi.fn();
		const recorded = vi.fn();
		kernel.events.on('opt-out:lifted', lifted);
		kernel.events.on('opt-out:recorded', recorded);

		// Granting measurement alone does not lift.
		await kernel.commands.save({ measurement: true });
		expect(kernel.getSnapshot().optOut).toEqual(existing);
		expect(lifted).not.toHaveBeenCalled();

		// Granting marketing lifts under opt-in.
		await kernel.commands.save({ marketing: true });
		expect(kernel.getSnapshot().optOut).toBeNull();
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(true);
		expect(lifted).toHaveBeenCalledTimes(1);

		// Refusing marketing under opt-in never records an opt-out.
		await kernel.commands.save({ marketing: false });
		expect(kernel.getSnapshot().optOut).toBeNull();
		expect(recorded).not.toHaveBeenCalled();
		kernel.dispose();
	});

	test('with GPC active and mapping measurement, saving marketing false and measurement true keeps measurement denied with gpc', async () => {
		const kernel = createKernel({
			initialPrivacySignals: { gpc: true },
		});
		await kernel.commands.init();
		expect(kernel.getSnapshot().optOut?.method).toBe('gpc');

		await kernel.commands.save({ marketing: false, measurement: true });
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
		expect(kernel.getSnapshot().effectivePermissions.measurement).toBe(false);
		expect(kernel.getSnapshot().restrictions).toEqual({
			marketing: ['explicit-denial', 'gpc', 'opt-out'],
			measurement: ['gpc'],
		});
		kernel.dispose();
	});

	test('refusal save records nothing new when an opt-out already exists', async () => {
		const existing: OptOutRecord = {
			heldBy: 'person',
			method: 'api',
			recordedAt: NOW - 5000,
			rights: ['sale'],
		};
		const kernel = createKernel({
			consentCategories: [
				'necessary',
				'functionality',
				'experience',
				'measurement',
				'marketing',
			],
			initialLocation: { countryCode: 'US', regionCode: 'CA' },
			initialRecords: { now: NOW, optOut: existing },
		});
		const recorded = vi.fn();
		kernel.events.on('opt-out:recorded', recorded);

		await kernel.commands.save('none', { uiSource: 'dialog' });

		expect(kernel.getSnapshot().optOut).toEqual(existing);
		expect(recorded).not.toHaveBeenCalled();
		kernel.dispose();
	});

	test('a save under an opt-out rule where neither marketing nor measurement is in scope never records an opt-out', async () => {
		const kernel = createKernel({
			consentCategories: ['necessary', 'experience', 'functionality'],
			initialPolicyResolution: matchedResolution(
				optOutRule({
					categories: ['experience', 'functionality'],
					prompt: 'none',
					scopeMode: 'permissive',
				})
			),
		});
		const recorded = vi.fn();
		kernel.events.on('opt-out:recorded', recorded);

		const result = await kernel.commands.save('none');
		expect(result.confirmed).toEqual(['experience', 'functionality']);
		expect(kernel.getSnapshot().optOut).toBeNull();
		expect(recorded).not.toHaveBeenCalled();
		kernel.dispose();
	});

	test('refusals under an opt-in rule never record an opt-out', async () => {
		const kernel = createKernel({
			consentCategories: [
				'necessary',
				'functionality',
				'experience',
				'measurement',
				'marketing',
			],
			initialPolicyResolution: matchedResolution(optInRule()),
		});
		const recorded = vi.fn();
		kernel.events.on('opt-out:recorded', recorded);

		const rejectResult = await kernel.commands.save('none');
		expect(rejectResult.confirmed?.length).toBeGreaterThan(0);
		await kernel.commands.save({ marketing: false, measurement: false });
		expect(kernel.getSnapshot().optOut).toBeNull();
		expect(recorded).not.toHaveBeenCalled();
		kernel.dispose();
	});

	test('denying or saving untouched categories leaves the opt-out alone', async () => {
		const existing: OptOutRecord = {
			heldBy: 'device',
			method: 'button',
			recordedAt: NOW - 1000,
			rights: ['sale', 'share'],
		};
		const kernel = createKernel({
			initialRecords: { now: NOW, optOut: existing },
		});
		const lifted = vi.fn();
		kernel.events.on('opt-out:lifted', lifted);

		await kernel.commands.save({ marketing: false });
		expect(kernel.getSnapshot().optOut).toEqual(existing);

		await kernel.commands.save({ functionality: true });
		expect(kernel.getSnapshot().optOut).toEqual(existing);
		expect(lifted).not.toHaveBeenCalled();
		kernel.dispose();
	});
});

describe('live GPC opt-out recording', () => {
	test('records exactly once across repeated evaluations, re-inits and signal toggles', async () => {
		const kernel = createKernel({
			initialLocation: { countryCode: 'US', regionCode: 'CO' },
			initialPrivacySignals: { gpc: true },
		});
		const recorded = vi.fn();
		kernel.events.on('opt-out:recorded', recorded);

		// Not live yet: construction never records.
		expect(kernel.getSnapshot().optOut).toBeNull();
		expect(recorded).not.toHaveBeenCalled();

		await kernel.commands.init();
		expect(recorded).toHaveBeenCalledTimes(1);
		const first = kernel.getSnapshot().optOut;
		expect(first).toEqual({
			heldBy: 'device',
			method: 'gpc',
			recordedAt: NOW,
			rights: [...ALL_RIGHTS],
		});

		vi.setSystemTime(NOW + 5000);
		kernel.refresh();
		await kernel.commands.init();
		kernel.set.privacySignals({ gpc: false });
		kernel.set.privacySignals({ gpc: true });

		expect(recorded).toHaveBeenCalledTimes(1);
		expect(kernel.getSnapshot().optOut).toBe(first);
		kernel.dispose();
	});

	test('does not record under a rule without a deny list or while policy is provisional', async () => {
		const noMapping = createKernel({
			initialPolicyResolution: matchedResolution(
				optOutRule({ privacySignals: { gpc: { denyCategories: [] } } })
			),
			initialPrivacySignals: { gpc: true },
		});
		const recordedNoMap = vi.fn();
		noMapping.events.on('opt-out:recorded', recordedNoMap);
		await noMapping.commands.init();
		expect(noMapping.getSnapshot().optOut).toBeNull();
		expect(recordedNoMap).not.toHaveBeenCalled();
		noMapping.dispose();

		const pendingInit = Promise.withResolvers<{ policyResolution: unknown }>();
		const pending = createKernel({
			initialPolicyPending: true,
			initialPrivacySignals: { gpc: true },
			transport: { init: () => pendingInit.promise },
		});
		const recordedPending = vi.fn();
		pending.events.on('opt-out:recorded', recordedPending);
		const initPromise = pending.commands.init();
		expect(pending.getSnapshot().policyPending).toBe(true);
		expect(pending.getSnapshot().optOut).toBeNull();
		expect(recordedPending).not.toHaveBeenCalled();

		const matched = matchedResolution(usOptOutRule());
		pendingInit.resolve({ policyResolution: { ...matched, version: 1 } });
		await initPromise;
		expect(pending.getSnapshot().policyPending).toBe(false);
		expect(pending.getSnapshot().optOut).toEqual({
			heldBy: 'device',
			method: 'gpc',
			recordedAt: NOW,
			rights: [...ALL_RIGHTS],
		});
		expect(recordedPending).toHaveBeenCalledTimes(1);
		pending.dispose();
	});

	test('does not duplicate a record that was hydrated before init', async () => {
		const hydrated: OptOutRecord = {
			heldBy: 'device',
			method: 'button',
			recordedAt: NOW - 5000,
			rights: ['sale', 'share'],
		};
		const kernel = createKernel({
			initialPrivacySignals: { gpc: true },
		});
		const recorded = vi.fn();
		kernel.events.on('opt-out:recorded', recorded);

		kernel.hydrate({ now: NOW, optOut: hydrated });
		await kernel.commands.init();

		expect(kernel.getSnapshot().optOut).toEqual(hydrated);
		expect(recorded).not.toHaveBeenCalled();
		kernel.dispose();
	});

	test('fires when GPC turns on later via set.privacySignals or set.overrides', async () => {
		const bySignal = createKernel();
		await bySignal.commands.init();
		expect(bySignal.getSnapshot().optOut).toBeNull();

		const recorded = vi.fn();
		bySignal.events.on('opt-out:recorded', recorded);
		bySignal.set.privacySignals({ gpc: true });
		expect(bySignal.getSnapshot().optOut).toEqual({
			heldBy: 'device',
			method: 'gpc',
			recordedAt: NOW,
			rights: [...ALL_RIGHTS],
		});
		expect(recorded).toHaveBeenCalledTimes(1);
		bySignal.dispose();

		const byOverride = createKernel();
		await byOverride.commands.init();
		const recordedOverride = vi.fn();
		byOverride.events.on('opt-out:recorded', recordedOverride);
		byOverride.set.overrides({ gpc: true });
		expect(byOverride.getSnapshot().optOut?.method).toBe('gpc');
		expect(recordedOverride).toHaveBeenCalledTimes(1);
		byOverride.dispose();
	});
});

describe('hydration of opt-out records', () => {
	test('hydrating a record denies at once, hydrating null clears it, and invalid records reject the hydration', () => {
		const kernel = createKernel({
			initialRecords: choiceRecords({ marketing: true, measurement: true }),
		});
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(true);

		const applied = kernel.hydrate({
			now: NOW,
			optOut: {
				heldBy: 'device',
				method: 'button',
				recordedAt: NOW - 100,
				rights: ['sale', 'share'],
			},
		});
		expect(applied).toEqual({ changed: true, ok: true });
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
		expect(kernel.getSnapshot().restrictions.marketing).toEqual(['opt-out']);

		const cleared = kernel.hydrate({ now: NOW, optOut: null });
		expect(cleared).toEqual({ changed: true, ok: true });
		expect(kernel.getSnapshot().optOut).toBeNull();
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(true);

		const futureRecord: OptOutRecord = {
			heldBy: 'person',
			method: 'api',
			recordedAt: NOW + DAY,
			rights: ['sale', 'share'],
		};
		const futureApplied = kernel.hydrate({ now: NOW, optOut: futureRecord });
		expect(futureApplied).toEqual({ changed: true, ok: true });
		expect(kernel.getSnapshot().optOut).toEqual(futureRecord);
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);

		const beforeBad = kernel.getSnapshot();
		const invalid = kernel.hydrate({
			now: NOW,
			optOut: {
				heldBy: 'device',
				method: 'button',
				recordedAt: -1,
				rights: ['sale'],
			},
		});
		expect(invalid.ok).toBe(false);
		expect(kernel.getSnapshot()).toBe(beforeBad);
		kernel.dispose();
	});
});
