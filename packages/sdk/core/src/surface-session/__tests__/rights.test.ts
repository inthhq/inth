/**
 * Rights decisions, tested through the kernel's own commands where the
 * kernel already enforces the rule.
 */
import type { OptOutRecord } from '@inth/sdk-schema/types';
import { describe, expect, test, vi } from 'vitest';

import {
	choiceRecords,
	matchedResolution,
	NOW,
	optInRule,
	optOutRule,
} from '../../__tests__/fixtures/kernel-fixtures';
import { createConsentKernel } from '../../kernel';
import type { ConsentKernel, KernelConfig } from '../../types';
import {
	commitBannerChoice,
	confirmSaleRight,
	pressSaleRight,
} from '../commands';
import {
	resolveBannerCommit,
	resolveRightPress,
	resolveSaleRight,
} from '../rights';
import type { RightPressInput } from '../rights';
import { getSurfaceSession } from '../session';

const CATEGORIES = [
	'necessary',
	'functionality',
	'marketing',
	'measurement',
] as const;

const GPC = { gpc: { denyCategories: ['marketing' as const] } };

const HELD: OptOutRecord = {
	heldBy: 'device',
	method: 'button',
	recordedAt: NOW - 1000,
	rights: ['sale', 'share'],
};

const kernelFor = function kernelFor(
	model: 'opt-in' | 'opt-out',
	config: Partial<KernelConfig> = {}
): ConsentKernel {
	vi.spyOn(Date, 'now').mockReturnValue(NOW);
	const rule = (model === 'opt-in' ? optInRule : optOutRule)({
		categories: ['functionality', 'marketing', 'measurement'],
		privacySignals: GPC,
	});
	return createConsentKernel({
		consentCategories: CATEGORIES,
		initialPolicyResolution: matchedResolution(rule),
		now: NOW,
		transport: {
			liftOptOut: () => Promise.resolve({ ok: true, optOut: null }),
			optOut: () => Promise.resolve({ ok: true }),
			save: () => Promise.resolve({ ok: true }),
		},
		...config,
	});
};

const openBanner = function openBanner(kernel: ConsentKernel): ConsentKernel {
	kernel.set.activeUI('banner');
	return kernel;
};

describe('resolveSaleRight', () => {
	test('opt-out policy, untouched: allowed by default', () => {
		expect(resolveSaleRight(kernelFor('opt-out').getSnapshot())).toMatchObject({
			available: true,
			category: 'marketing',
			locked: false,
			selected: 'allow',
			source: 'default',
		});
	});

	test('opt-in policy, untouched: off by default (LAW-11)', () => {
		expect(resolveSaleRight(kernelFor('opt-in').getSnapshot())).toMatchObject({
			selected: 'protect',
			source: 'default',
		});
	});

	test('a held opt-out is the visitor’s refusal', () => {
		const kernel = kernelFor('opt-out', { initialRecords: { optOut: HELD } });
		expect(resolveSaleRight(kernel.getSnapshot())).toMatchObject({
			locked: false,
			selected: 'protect',
			source: 'user',
			viaSignal: false,
		});
	});

	test('[GPC-03] a live GPC signal locks the refusal', () => {
		const kernel = kernelFor('opt-out', {
			initialPrivacySignals: { gpc: true },
			initialRecords: { optOut: { ...HELD, method: 'gpc' } },
		});
		expect(resolveSaleRight(kernel.getSnapshot())).toMatchObject({
			locked: true,
			selected: 'protect',
			source: 'gpc',
		});
	});

	test('[GPC-05] an opt-out a past signal made stays as a recorded choice the visitor can lift', () => {
		const kernel = kernelFor('opt-out', {
			initialRecords: { optOut: { ...HELD, method: 'gpc' } },
		});
		expect(resolveSaleRight(kernel.getSnapshot())).toMatchObject({
			locked: false,
			selected: 'protect',
			source: 'user',
			viaSignal: true,
		});
	});

	test('[GPC-01] a live signal under opt-in locks only the categories it maps', () => {
		const kernel = kernelFor('opt-in', {
			initialPrivacySignals: { gpc: true },
		});
		expect(resolveSaleRight(kernel.getSnapshot())).toMatchObject({
			locked: true,
			source: 'gpc',
		});
		expect(kernel.getSnapshot().restrictions.measurement).toBeUndefined();
	});
});

describe('resolveRightPress', () => {
	const press = (overrides: Partial<RightPressInput>) =>
		resolveRightPress({
			confirmationOpen: false,
			model: 'opt-out',
			option: 'allow',
			right: { locked: false, selected: 'protect', source: 'user' },
			...overrides,
		});

	test('[LAW-02] opting out applies in one action; opting back in asks first', () => {
		expect(
			press({
				option: 'protect',
				right: { locked: false, selected: 'allow', source: 'default' },
			})
		).toBe('apply-protect');
		expect(press({})).toBe('confirm');
	});

	test('[LAW-02] under opt-in every grant asks first', () => {
		expect(
			press({
				model: 'opt-in',
				right: { locked: false, selected: 'protect', source: 'default' },
			})
		).toBe('confirm');
	});

	test('an untouched opt-out default grants without a step back to undo', () => {
		expect(
			press({
				right: { locked: false, selected: 'protect', source: 'default' },
			})
		).toBe('apply-allow');
	});

	test('[RIGHT-04] Allow pressed again while the confirmation is open nudges', () => {
		expect(press({ confirmationOpen: true })).toBe('nudge');
	});

	test('[RIGHT-03] the selected option closes an open confirmation, or records a default', () => {
		expect(press({ confirmationOpen: true, option: 'protect' })).toBe(
			'close-confirmation'
		);
		expect(
			press({
				option: 'protect',
				right: { locked: false, selected: 'protect', source: 'default' },
			})
		).toBe('record-default');
		expect(press({ option: 'protect' })).toBe('none');
	});

	test('[GPC-03] Allow does nothing while GPC locks the right', () => {
		expect(
			press({ right: { locked: true, selected: 'protect', source: 'gpc' } })
		).toBe('none');
	});
});

describe('[LAW-02] pressing the sale control through the kernel', () => {
	test('Opt out records the opt-out at once', () => {
		const kernel = kernelFor('opt-out');
		kernel.set.activeUI('dialog');
		const { outcome } = pressSaleRight(kernel, 'protect');
		expect(outcome).toBe('apply-protect');
		expect(kernel.getSnapshot().optOut?.method).toBe('button');
	});

	test('Allow from a recorded opt-out opens the confirmation and records nothing until confirmed', async () => {
		const kernel = kernelFor('opt-out', { initialRecords: { optOut: HELD } });
		kernel.set.activeUI('dialog');
		expect(pressSaleRight(kernel, 'allow').outcome).toBe('confirm');
		expect(getSurfaceSession(kernel).getState().confirmation?.right).toBe(
			'sale'
		);
		expect(kernel.getSnapshot().optOut).not.toBeNull();

		// [RIGHT-04] Pressing Allow again only nudges.
		expect(pressSaleRight(kernel, 'allow').outcome).toBe('nudge');
		expect(getSurfaceSession(kernel).getState().confirmation?.nudges).toBe(1);
		expect(kernel.getSnapshot().optOut).not.toBeNull();

		await confirmSaleRight(kernel);
		expect(kernel.getSnapshot().optOut).toBeNull();
		expect(getSurfaceSession(kernel).getState().confirmation).toBeNull();
	});

	test('[RIGHT-04] pressing the protective option while confirming closes the question and keeps the opt-out', () => {
		const kernel = kernelFor('opt-out', { initialRecords: { optOut: HELD } });
		kernel.set.activeUI('dialog');
		pressSaleRight(kernel, 'allow');
		expect(pressSaleRight(kernel, 'protect').outcome).toBe(
			'close-confirmation'
		);
		expect(getSurfaceSession(kernel).getState().confirmation).toBeNull();
		expect(kernel.getSnapshot().optOut).toEqual(HELD);
	});

	test('[RCPT-02] opting out again keeps the first opt-out’s time', () => {
		const kernel = kernelFor('opt-out', { initialRecords: { optOut: HELD } });
		kernel.set.activeUI('dialog');
		pressSaleRight(kernel, 'protect');
		expect(kernel.getSnapshot().optOut?.recordedAt).toBe(HELD.recordedAt);
	});

	test('confirmSaleRight does nothing without an open confirmation', () => {
		const kernel = kernelFor('opt-out', { initialRecords: { optOut: HELD } });
		expect(confirmSaleRight(kernel)).toBeUndefined();
		expect(kernel.getSnapshot().optOut).toEqual(HELD);
	});
});

describe('[PERM-02] banner commits respect existing state', () => {
	test('Allow fills an untouched default', () => {
		const kernel = openBanner(kernelFor('opt-in'));
		const { plan } = commitBannerChoice(kernel, 'allow');
		expect(plan).toMatchObject({ keptOff: null, rightChanged: true });
		expect(kernel.getSnapshot().effectivePermissions).toMatchObject({
			marketing: true,
			measurement: true,
		});
	});

	test('Allow never lifts a recorded opt-out; the other categories are still granted', () => {
		const kernel = openBanner(
			kernelFor('opt-out', { initialRecords: { optOut: HELD } })
		);
		const { plan } = commitBannerChoice(kernel, 'allow');
		expect(plan).toMatchObject({ keptOff: 'opt-out', rightChanged: false });
		expect(kernel.getSnapshot().optOut).toEqual(HELD);
		expect(kernel.getSnapshot().effectivePermissions).toMatchObject({
			functionality: true,
			marketing: false,
		});
	});

	test('Allow never lifts an opt-in refusal the visitor recorded', () => {
		const kernel = openBanner(
			kernelFor('opt-in', {
				initialRecords: choiceRecords(
					{ marketing: false },
					{
						fingerprint: matchedResolution(
							optInRule({
								categories: ['functionality', 'marketing', 'measurement'],
								privacySignals: GPC,
							})
						).fingerprints.choice,
					}
				),
			})
		);
		expect(resolveSaleRight(kernel.getSnapshot()).source).toBe('user');
		const { plan } = commitBannerChoice(kernel, 'allow');
		expect(plan.keptOff).toBe('opt-out');
		expect(plan.categories).not.toContain('marketing');
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
	});

	test('[GPC-03] Allow never overrides a live GPC lock', () => {
		const kernel = openBanner(
			kernelFor('opt-in', { initialPrivacySignals: { gpc: true } })
		);
		const { plan } = commitBannerChoice(kernel, 'allow');
		expect(plan.keptOff).toBe('gpc');
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
		expect(
			kernel.getSnapshot().explicitChoice?.categories.marketing
		).toBeUndefined();
	});

	test('a refusal always applies in one action, even after a grant through the confirmation', () => {
		const kernel = openBanner(
			kernelFor('opt-in', {
				initialRecords: choiceRecords(
					{ marketing: true, measurement: true },
					{
						fingerprint: matchedResolution(
							optInRule({
								categories: ['functionality', 'marketing', 'measurement'],
								privacySignals: GPC,
							})
						).fingerprints.choice,
					}
				),
			})
		);
		const { plan } = commitBannerChoice(kernel, 'refuse');
		expect(plan).toMatchObject({ input: 'none', rightChanged: true });
		expect(kernel.getSnapshot().effectivePermissions).toMatchObject({
			marketing: false,
			measurement: false,
		});
	});

	test('[RCPT-02] a refusal on a recorded opt-out keeps its date', () => {
		const kernel = openBanner(
			kernelFor('opt-out', { initialRecords: { optOut: HELD } })
		);
		const { plan } = commitBannerChoice(kernel, 'refuse');
		expect(plan.rightChanged).toBe(false);
		expect(kernel.getSnapshot().optOut?.recordedAt).toBe(HELD.recordedAt);
	});

	test('[RCPT-02] cookie edits never move the opt-out’s date', async () => {
		const kernel = kernelFor('opt-out', { initialRecords: { optOut: HELD } });
		await kernel.commands.save({ functionality: true });
		expect(kernel.getSnapshot().optOut?.recordedAt).toBe(HELD.recordedAt);
	});

	test('a refusal under an opt-out policy records the opt-out', () => {
		const kernel = openBanner(kernelFor('opt-out'));
		commitBannerChoice(kernel, 'refuse');
		expect(kernel.getSnapshot().optOut).not.toBeNull();
	});

	test('[PERM-03] a commit ends the banner and drops its transient state', () => {
		const kernel = openBanner(kernelFor('opt-in'));
		const session = getSurfaceSession(kernel);
		session.expand();
		session.openConfirmation('sale');
		const { token } = session.getState();
		commitBannerChoice(kernel, 'refuse');
		expect(kernel.getSnapshot().activeUI).toBe('none');
		expect(session.getState()).toMatchObject({
			confirmation: null,
			expanded: false,
		});
		expect(session.isCurrent(token)).toBe(false);
	});

	test('Save from an expanded panel never lifts a held opt-out', () => {
		const kernel = openBanner(
			kernelFor('opt-out', { initialRecords: { optOut: HELD } })
		);
		const plan = resolveBannerCommit(kernel.getSnapshot(), 'save');
		expect(plan.input).toBe('draft');
		expect(plan.categories).not.toContain('marketing');
		kernel.set.draft({ marketing: true });
		commitBannerChoice(kernel, 'save');
		expect(kernel.getSnapshot().optOut).toEqual(HELD);
	});
});
