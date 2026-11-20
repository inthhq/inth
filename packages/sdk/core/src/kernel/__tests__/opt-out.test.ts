/**
 * Durable opt-out record through the kernel's public boundaries: commands
 * (`optOut`, `optIn`, `save`), live GPC recording, hydration, events,
 * notice acknowledgement and freezing.
 */
import type { OptOutRecord } from '@inth/sdk-schema/types';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
	choiceRecords,
	matchedResolution,
	noticeRule,
	NOW,
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

describe('commands.optOut()', () => {
	test.each([
		['CA', ['sale', 'share']],
		['CO', ['sale', 'targeted_ads']],
		['NV', ['sale']],
		[null, ['sale', 'share', 'targeted_ads']],
	] as const)(
		'records the right set of rights for US-%s without touching explicitChoice',
		async (regionCode, expectedRights) => {
			const kernel = createKernel({
				initialLocation: { countryCode: 'US', regionCode },
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
					rights: [...expectedRights],
				},
			});
			const snap = kernel.getSnapshot();
			expect(snap.optOut).toEqual({
				heldBy: 'device',
				method: 'button',
				recordedAt: NOW,
				rights: [...expectedRights],
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
		}
	);

	test('prefers override country and region over snapshot.location', async () => {
		const kernel = createKernel({
			initialLocation: { countryCode: 'US', regionCode: 'CA' },
			initialOverrides: { country: 'US', region: 'US-NV' },
		});
		const result = await kernel.commands.optOut();
		expect(result).toEqual({
			changed: true,
			ok: true,
			optOut: {
				heldBy: 'device',
				method: 'button',
				recordedAt: NOW,
				rights: ['sale'],
			},
		});
		kernel.dispose();
	});

	test('is a no-op when an existing opt-out already covers every right the location needs', async () => {
		const existing: OptOutRecord = {
			heldBy: 'person',
			method: 'gpc',
			recordedAt: NOW - 5000,
			rights: ['sale', 'share'],
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
	});

	test('unions rights when an existing opt-out lacks some of the location rights and keeps heldBy', async () => {
		const existing: OptOutRecord = {
			heldBy: 'person',
			method: 'api',
			recordedAt: NOW - 5000,
			rights: ['sale'],
		};
		const kernel = createKernel({
			initialLocation: { countryCode: 'US', regionCode: 'CA' },
			initialRecords: { now: NOW, optOut: existing },
		});
		const recorded = vi.fn();
		kernel.events.on('opt-out:recorded', recorded);

		const result = await kernel.commands.optOut();

		expect(result).toEqual({
			changed: true,
			ok: true,
			optOut: {
				heldBy: 'person',
				method: 'button',
				recordedAt: NOW,
				rights: ['sale', 'share'],
			},
		});
		expect(recorded).toHaveBeenCalledTimes(1);
		kernel.dispose();
	});

	test('returns not-available when the active rule has an empty deny list', async () => {
		const kernel = createKernel({
			initialPolicyResolution: matchedResolution(
				optOutRule({ privacySignals: { gpc: { denyCategories: [] } } })
			),
		});
		const recorded = vi.fn();
		kernel.events.on('opt-out:recorded', recorded);

		const result = await kernel.commands.optOut();

		expect(result).toEqual({ ok: false, reason: 'not-available' });
		expect(kernel.getSnapshot().optOut).toBeNull();
		expect(recorded).not.toHaveBeenCalled();
		kernel.dispose();
	});

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
			rights: ['sale', 'targeted_ads'],
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
			rights: ['sale', 'share'],
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
			rights: ['sale', 'share'],
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

		const beforeBad = kernel.getSnapshot();
		const invalid = kernel.hydrate({
			now: NOW,
			optOut: {
				heldBy: 'device',
				method: 'button',
				recordedAt: NOW + 1000,
				rights: ['sale'],
			},
		});
		expect(invalid.ok).toBe(false);
		expect(kernel.getSnapshot()).toBe(beforeBad);
		kernel.dispose();
	});
});
