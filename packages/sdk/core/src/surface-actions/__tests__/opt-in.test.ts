import { describe, expect, test, vi } from 'vitest';

import {
	choiceRecords,
	matchedResolution,
	NOW,
	optInRule,
	optOutRule,
} from '../../__tests__/fixtures/kernel-fixtures';
import { saveWouldLiftOptOut } from '../../consent-record/opt-out-rules';
import { createConsentKernel } from '../../index';
import type { ConsentKernel, KernelConfig } from '../../index';
import { createPreferenceDraft } from '../../preference-draft/index';
import {
	closeOptInConfirmation,
	confirmOptInConfirmation,
	isOptInConfirmationOpen,
	openOptInConfirmation,
	optInConsentSurface,
	saveConsentBlanket,
	subscribeOptInConfirmation,
} from '../index';

const CATEGORIES = [
	'necessary',
	'functionality',
	'marketing',
	'measurement',
] as const;

const createOptOutKernel = function createOptOutKernel(
	config: Partial<KernelConfig> = {},
	rule = optOutRule({
		categories: ['functionality', 'marketing', 'measurement'],
		privacySignals: { gpc: { denyCategories: ['marketing', 'measurement'] } },
	})
): ConsentKernel {
	return createConsentKernel({
		consentCategories: CATEGORIES,
		initialPolicyResolution: matchedResolution(rule),
		initialRecords: {
			optOut: {
				heldBy: 'device',
				method: 'button',
				recordedAt: NOW - 1000,
				rights: ['sale', 'share'],
			},
		},
		now: NOW,
		transport: {
			liftOptOut: vi.fn(() => Promise.resolve({ ok: true, optOut: null })),
			save: vi.fn(() => Promise.resolve({ ok: true })),
		},
		...config,
	});
};

describe('saveWouldLiftOptOut predicate', () => {
	test('returns true for bulk accept and deciding-category grant under opt-out with held opt-out', () => {
		const kernel = createOptOutKernel();
		const snapshot = kernel.getSnapshot();
		expect(saveWouldLiftOptOut(snapshot, 'all')).toBe(true);
		expect(saveWouldLiftOptOut(snapshot, { marketing: true })).toBe(true);
		expect(
			saveWouldLiftOptOut(snapshot, { marketing: true, measurement: false })
		).toBe(true);
	});

	test('returns false for reject and non-deciding saves', () => {
		const kernel = createOptOutKernel();
		const snapshot = kernel.getSnapshot();
		expect(saveWouldLiftOptOut(snapshot, 'none')).toBe(false);
		expect(
			saveWouldLiftOptOut(snapshot, { marketing: false, measurement: true })
		).toBe(false);
		expect(saveWouldLiftOptOut(snapshot, { functionality: true })).toBe(false);
		expect(
			saveWouldLiftOptOut(snapshot, 'all', ['functionality', 'measurement'])
		).toBe(false);
	});

	test('uses measurement as deciding category when marketing is out of scope', () => {
		const kernel = createOptOutKernel(
			{ consentCategories: ['necessary', 'functionality', 'measurement'] },
			optOutRule({
				categories: ['functionality', 'measurement'],
				privacySignals: { gpc: { denyCategories: ['measurement'] } },
			})
		);
		const snapshot = kernel.getSnapshot();
		expect(saveWouldLiftOptOut(snapshot, { measurement: true })).toBe(true);
		expect(saveWouldLiftOptOut(snapshot, { functionality: true })).toBe(false);
	});

	test('returns false when no opt-out is held, when GPC blocks lift, or under opt-in policy', () => {
		const notOptedOut = createOptOutKernel({ initialRecords: {} });
		expect(saveWouldLiftOptOut(notOptedOut.getSnapshot(), 'all')).toBe(false);

		const gpcActive = createOptOutKernel({
			initialPrivacySignals: { gpc: true },
		});
		expect(saveWouldLiftOptOut(gpcActive.getSnapshot(), 'all')).toBe(false);
		expect(
			saveWouldLiftOptOut(gpcActive.getSnapshot(), { marketing: true })
		).toBe(false);

		const optIn = createConsentKernel({
			consentCategories: CATEGORIES,
			initialPolicyResolution: matchedResolution(optInRule()),
			initialRecords: {
				optOut: {
					heldBy: 'device',
					method: 'button',
					recordedAt: NOW - 1000,
					rights: ['sale', 'share'],
				},
			},
			now: NOW,
		});
		expect(saveWouldLiftOptOut(optIn.getSnapshot(), 'all')).toBe(false);
		expect(saveWouldLiftOptOut(optIn.getSnapshot(), { marketing: true })).toBe(
			false
		);
	});

	test('returns true for held-by-account opt-out when GPC is off because save requests a lift', () => {
		const accountKernel = createOptOutKernel({
			initialRecords: {
				optOut: {
					heldBy: 'person',
					method: 'button',
					recordedAt: NOW - 1000,
					rights: ['sale', 'share'],
				},
			},
		});
		expect(saveWouldLiftOptOut(accountKernel.getSnapshot(), 'all')).toBe(true);
		expect(
			saveWouldLiftOptOut(accountKernel.getSnapshot(), { marketing: true })
		).toBe(true);
	});
});

describe('opt-in confirmation registry', () => {
	test('opens, notifies subscribers, confirms pending action once, and cancels without running it', async () => {
		const kernel = createOptOutKernel();
		const listener = vi.fn();
		const stop = subscribeOptInConfirmation(kernel, listener);

		expect(isOptInConfirmationOpen(kernel)).toBe(false);

		const action = vi.fn(() => Promise.resolve({ ok: true }));
		openOptInConfirmation(kernel, action);
		expect(isOptInConfirmationOpen(kernel)).toBe(true);
		expect(listener).toHaveBeenCalledTimes(1);
		expect(action).not.toHaveBeenCalled();

		closeOptInConfirmation(kernel);
		expect(isOptInConfirmationOpen(kernel)).toBe(false);
		expect(listener).toHaveBeenCalledTimes(2);
		expect(action).not.toHaveBeenCalled();

		// Confirming after cancel runs nothing.
		await confirmOptInConfirmation(kernel);
		expect(action).not.toHaveBeenCalled();

		openOptInConfirmation(kernel, action);
		await confirmOptInConfirmation(kernel);
		expect(isOptInConfirmationOpen(kernel)).toBe(false);
		expect(action).toHaveBeenCalledTimes(1);

		// Confirming again does not rerun the action.
		await confirmOptInConfirmation(kernel);
		expect(action).toHaveBeenCalledTimes(1);

		stop();
	});

	test('follows a stand-in kernel when its events reference switches on attach', () => {
		const first = createOptOutKernel();
		const second = createOptOutKernel();
		let current = first;
		const listeners = new Set<() => void>();
		const standIn = {
			get events() {
				return current.events;
			},
			getSnapshot: () => current.getSnapshot(),
			subscribe(listener: () => void) {
				listeners.add(listener);
				return () => listeners.delete(listener);
			},
		} as unknown as ConsentKernel;

		const onState = vi.fn();
		const stop = subscribeOptInConfirmation(standIn, onState);
		expect(isOptInConfirmationOpen(standIn)).toBe(false);

		openOptInConfirmation(second, () => undefined);
		current = second;
		for (const notifyListener of listeners) {
			notifyListener();
		}

		expect(onState).toHaveBeenCalledTimes(1);
		expect(isOptInConfirmationOpen(standIn)).toBe(true);
		closeOptInConfirmation(standIn);
		expect(isOptInConfirmationOpen(second)).toBe(false);
		stop();
	});
});

describe('shared surface actions defer lifting saves until confirmed', () => {
	test('saveConsentBlanket opens confirmation instead of saving under opt-out, then lifts on confirm', async () => {
		const kernel = createOptOutKernel();
		kernel.set.activeUI('banner');

		const result = await saveConsentBlanket(kernel, 'all');
		expect(result.ok).toBe(false);
		expect(isOptInConfirmationOpen(kernel)).toBe(true);
		expect(kernel.getSnapshot().optOut).not.toBeNull();
		expect(kernel.getSnapshot().explicitChoice).toBeNull();
		expect(kernel.getSnapshot().activeUI).toBe('banner');

		closeOptInConfirmation(kernel);
		expect(kernel.getSnapshot().optOut).not.toBeNull();
		expect(kernel.getSnapshot().activeUI).toBe('banner');

		await saveConsentBlanket(kernel, 'all');
		expect(isOptInConfirmationOpen(kernel)).toBe(true);
		await confirmOptInConfirmation(kernel);
		expect(isOptInConfirmationOpen(kernel)).toBe(false);
		expect(kernel.getSnapshot().optOut).toBeNull();
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(true);
		expect(kernel.getSnapshot().activeUI).toBe('none');
	});

	test('saveConsentBlanket lifts in one step under opt-in policy', async () => {
		const kernel = createConsentKernel({
			consentCategories: CATEGORIES,
			initialPolicyResolution: matchedResolution(optInRule()),
			initialRecords: {
				optOut: {
					heldBy: 'device',
					method: 'button',
					recordedAt: NOW - 1000,
					rights: ['sale', 'share'],
				},
			},
			now: NOW,
			transport: { save: vi.fn(() => Promise.resolve({ ok: true })) },
		});

		const result = await saveConsentBlanket(kernel, 'all');
		expect(result.ok).toBe(true);
		expect(isOptInConfirmationOpen(kernel)).toBe(false);
		expect(kernel.getSnapshot().optOut).toBeNull();
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(true);
	});

	test('preference draft defers lifting saves and passes non-lifting saves through immediately', async () => {
		const kernel = createOptOutKernel();
		const draft = createPreferenceDraft(kernel);

		// Non-lifting save: measurement on, marketing stays off.
		draft.set('measurement', true);
		const nonLifting = await draft.save();
		expect(nonLifting.ok).toBe(true);
		expect(isOptInConfirmationOpen(kernel)).toBe(false);
		expect(kernel.getSnapshot().optOut).not.toBeNull();
		expect(kernel.getSnapshot().effectivePermissions.measurement).toBe(true);

		// Lifting draft save: marketing on.
		draft.set('marketing', true);
		const deferred = await draft.save();
		expect(deferred.ok).toBe(false);
		expect(isOptInConfirmationOpen(kernel)).toBe(true);
		expect(kernel.getSnapshot().optOut).not.toBeNull();
		expect(draft.getState().isDirty).toBe(true);

		closeOptInConfirmation(kernel);
		expect(kernel.getSnapshot().optOut).not.toBeNull();
		expect(draft.getState().values.marketing).toBe(true);

		await draft.save();
		await confirmOptInConfirmation(kernel);
		expect(kernel.getSnapshot().optOut).toBeNull();
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(true);
		expect(draft.getState().isDirty).toBe(false);
	});

	test('preference draft bulk accept opens confirmation and lifts only when confirmed', async () => {
		const kernel = createOptOutKernel({
			initialRecords: {
				...choiceRecords({ functionality: false, marketing: false }),
				optOut: {
					heldBy: 'device',
					method: 'button',
					recordedAt: NOW - 1000,
					rights: ['sale', 'share'],
				},
			},
		});
		const draft = createPreferenceDraft(kernel);

		const deferred = await draft.save({ input: 'all' });
		expect(deferred.ok).toBe(false);
		expect(isOptInConfirmationOpen(kernel)).toBe(true);
		expect(kernel.getSnapshot().optOut).not.toBeNull();
		expect(kernel.getSnapshot().effectivePermissions.functionality).toBe(false);

		await confirmOptInConfirmation(kernel);
		expect(kernel.getSnapshot().optOut).toBeNull();
		expect(kernel.getSnapshot().effectivePermissions.functionality).toBe(true);
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(true);
	});

	test('optInConsentSurface opens confirmation with commands.optIn() and lifts only on confirm', async () => {
		const kernel = createOptOutKernel();

		optInConsentSurface(kernel, { uiSource: 'dialog' });
		expect(isOptInConfirmationOpen(kernel)).toBe(true);
		expect(kernel.getSnapshot().optOut).not.toBeNull();

		closeOptInConfirmation(kernel);
		expect(kernel.getSnapshot().optOut).not.toBeNull();

		optInConsentSurface(kernel, { uiSource: 'dialog' });
		await confirmOptInConfirmation(kernel);
		expect(kernel.getSnapshot().optOut).toBeNull();
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(true);
	});
});
