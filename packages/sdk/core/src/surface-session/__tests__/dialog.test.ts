/**
 * The "Your Privacy Choices" dialog's decisions: the receipt, the category
 * and vendor switch plans, its commands, and its copy.
 */
import type { OptOutRecord } from '@inth/sdk-schema/types';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import {
	matchedResolution,
	NOW,
	optInRule,
	optOutRule,
} from '../../__tests__/fixtures/kernel-fixtures';
import type { ConsentKernel, KernelConfig } from '../../consent-kernel.model';
import { createConsentKernel } from '../../kernel';
import {
	resolvePrivacyChoicesDialogCopy,
	resolveRightsReceiptCopy,
	resolveSaleAnnouncement,
	resolveSwitchAnnouncement,
	resolveVendorTableCopy,
} from '../../libs/consent-copy';
import { createPreferenceDraft } from '../../preference-draft';
import { planCategorySwitch, planVendorSwitch } from '../category-switch.model';
import { resolveRightsReceipt } from '../resolve-rights-receipt';
import {
	applyDialogCategories,
	commitDialogChoice,
} from '../surface-commands.model';

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

afterEach(() => {
	vi.restoreAllMocks();
});

describe('resolveRightsReceipt', () => {
	test('[RCPT-01] a first visit and an untouched default show no receipt', () => {
		expect(resolveRightsReceipt(kernelFor('opt-out').getSnapshot()).show).toBe(
			false
		);
		expect(resolveRightsReceipt(kernelFor('opt-in').getSnapshot()).show).toBe(
			false
		);
	});

	test('[RCPT-01] a held opt-out is a stored receipt with its own date and reference', () => {
		const kernel = kernelFor('opt-out', { initialRecords: { optOut: HELD } });
		const receipt = resolveRightsReceipt(kernel.getSnapshot(), {
			reference: 'ref-123',
		});
		expect(receipt).toMatchObject({
			at: HELD.recordedAt,
			kind: 'stored',
			reference: 'ref-123',
			scope: 'browser',
			selected: 'protect',
			show: true,
		});
	});

	test('[GPC-06] a live GPC signal is shown as live, never as a saved date', () => {
		const kernel = kernelFor('opt-out', {
			initialPrivacySignals: { gpc: true },
		});
		const receipt = resolveRightsReceipt(kernel.getSnapshot());
		expect(receipt.kind).toBe('live');
		expect(receipt.show).toBe(true);
		const copy = resolveRightsReceiptCopy(undefined, {
			bundle: 'all',
			now: NOW,
			receipt,
		});
		expect(copy.lead).toBe('Honoring Global Privacy Control from this browser');
		expect(copy.lead).not.toMatch(/Saved/u);
		expect(copy.recorded).toBe('Read from your browser on every visit.');
	});

	test('[GPC-05] an opt-out a past signal made credits the signal', () => {
		const kernel = kernelFor('opt-out', {
			initialRecords: { optOut: { ...HELD, method: 'gpc' } },
		});
		const receipt = resolveRightsReceipt(kernel.getSnapshot());
		expect(receipt.viaSignal).toBe(true);
		const copy = resolveRightsReceiptCopy(undefined, {
			bundle: 'all',
			now: NOW,
			receipt,
		});
		expect(copy.items[0]?.source).toBe(
			'from your Global Privacy Control signal'
		);
	});

	test('[RCPT-02] a cookie edit in the dialog keeps the rights date', async () => {
		const kernel = kernelFor('opt-out', { initialRecords: { optOut: HELD } });
		kernel.set.activeUI('dialog');
		const before = resolveRightsReceipt(kernel.getSnapshot()).at;
		vi.spyOn(Date, 'now').mockReturnValue(NOW + 60_000);
		const draft = createPreferenceDraft(kernel);
		draft.set('functionality', false);
		await applyDialogCategories(kernel, draft, ['functionality']);
		expect(resolveRightsReceipt(kernel.getSnapshot()).at).toBe(before);
	});

	test('[RCPT-04] an account-held opt-out says it reaches the account', () => {
		const kernel = kernelFor('opt-out', {
			initialRecords: { optOut: { ...HELD, heldBy: 'person' } },
		});
		const receipt = resolveRightsReceipt(kernel.getSnapshot());
		const copy = resolveRightsReceiptCopy(undefined, {
			bundle: 'all',
			business: 'Acme',
			now: NOW + 86_400_000 * 3,
			receipt,
		});
		expect(copy.scope).toBe('Applies to this browser and your Acme account.');
		expect(copy.lead).toMatch(/^Saved to your account · /u);
	});

	test('[RIGHT-08] a recorded grant under opt-in dates the receipt with its confirmation', async () => {
		const kernel = kernelFor('opt-in');
		kernel.set.activeUI('dialog');
		await kernel.commands.save(
			{ marketing: true },
			{ rightsControl: true, uiSource: 'dialog' }
		);
		const receipt = resolveRightsReceipt(kernel.getSnapshot());
		expect(receipt).toMatchObject({
			kind: 'stored',
			selected: 'allow',
			show: true,
		});
		expect(receipt.at).toBe(NOW);
		expect(
			resolveRightsReceiptCopy(undefined, { bundle: 'all', now: NOW, receipt })
				.lead
		).toBe('Saved for this browser · just now');
	});
});

describe('switch plans', () => {
	test('[CAT-02] turning a category on with no vendor on turns them all on', () => {
		expect(
			planCategorySwitch({ on: false, vendors: { a: false, b: false } }, true)
		).toEqual({
			categoryChanged: true,
			on: true,
			vendors: { a: true, b: true },
		});
		expect(
			planCategorySwitch({ on: false, vendors: { a: true, b: false } }, true)
				.vendors
		).toEqual({});
	});

	test('[CAT-02] turning off the last vendor turns the category off', () => {
		expect(
			planVendorSwitch({ on: true, vendors: { a: true, b: false } }, 'a', false)
		).toEqual({ categoryChanged: true, on: false, vendors: { a: false } });
		expect(
			planVendorSwitch({ on: true, vendors: { a: true, b: true } }, 'a', false)
		).toEqual({ categoryChanged: false, on: true, vendors: { a: false } });
	});

	test('[CAT-03] a vendor turned on under an off category turns it on with only that vendor', () => {
		expect(
			planVendorSwitch({ on: false, vendors: { a: true, b: true } }, 'b', true)
		).toEqual({
			categoryChanged: true,
			on: true,
			vendors: { a: false, b: true },
		});
	});
});

describe('dialog commands', () => {
	test('[LAW-04] a US category switch applies at once and keeps the dialog open', async () => {
		const kernel = kernelFor('opt-out');
		kernel.set.activeUI('dialog');
		const draft = createPreferenceDraft(kernel);
		draft.set('functionality', false);
		await applyDialogCategories(kernel, draft, ['functionality']);
		const snapshot = kernel.getSnapshot();
		expect(snapshot.activeUI).toBe('dialog');
		expect(snapshot.explicitChoice?.categories?.functionality?.value).toBe(
			false
		);
		// Only that category was recorded.
		expect(snapshot.explicitChoice?.categories?.measurement).toBeUndefined();
		expect(draft.getState().isDirty).toBe(false);
	});

	test('[EU-01] Save choices records the draft and closes the dialog', async () => {
		const kernel = kernelFor('opt-in');
		kernel.set.activeUI('dialog');
		const draft = createPreferenceDraft(kernel);
		draft.set('measurement', true);
		const { result } = commitDialogChoice(kernel, 'save', { draft });
		await result;
		const snapshot = kernel.getSnapshot();
		expect(snapshot.activeUI).toBe('none');
		expect(snapshot.explicitChoice?.categories?.measurement?.value).toBe(true);
		expect(snapshot.explicitChoice?.categories?.functionality?.value).toBe(
			false
		);
	});
});

describe('dialog copy', () => {
	test('the US and EU chrome', () => {
		const us = resolvePrivacyChoicesDialogCopy(undefined, { eu: false });
		expect(us.title).toBe('Your Privacy Choices');
		expect(us.intro).toBe('Your choices apply right away.');
		expect(us.done).toBe('Done');
		expect(us.sheetNote).toBe('Saved automatically');
		const eu = resolvePrivacyChoicesDialogCopy(undefined, { eu: true });
		expect(eu.title).toBe('Privacy settings');
		expect(eu.intro).toMatch(
			/^Choose which optional cookies this site may use/u
		);
		// [EU-05][COPY-03] EU copy never implies an immediate effect.
		expect(eu.vendorSheetIntro).toBe(
			'Changes apply when you save in Privacy settings.'
		);
		expect(eu.sheetNote).toBe('Save your choices in Privacy settings');
	});

	test('[COPY-01] sale announcements name the bundle', () => {
		expect(
			resolveSaleAnnouncement(undefined, {
				bundle: 'sale-share',
				model: 'opt-out',
				outcome: 'protect',
			})
		).toBe('Opted out of selling and sharing. Saved.');
		expect(
			resolveSaleAnnouncement(undefined, {
				bundle: 'all',
				model: 'opt-in',
				outcome: 'protect',
			})
		).toBe('Selling, sharing and targeted ads not allowed. Saved.');
		expect(
			resolveSaleAnnouncement(undefined, {
				bundle: 'sale-ads',
				model: 'opt-in',
				outcome: 'allow',
			})
		).toBe('Selling and targeted ads allowed. Saved.');
	});

	test('[CAT-04] automatic changes are announced with the one pressed', () => {
		expect(
			resolveSwitchAnnouncement(undefined, {
				applied: false,
				changes: [
					{ name: 'Mapbox', on: false },
					{ name: 'Experience', on: false },
				],
			})
		).toBe('Mapbox off. Experience off.');
		expect(
			resolveSwitchAnnouncement(undefined, {
				applied: true,
				changes: [{ name: 'Analytics', on: true }],
			})
		).toBe('Analytics on. Saved.');
	});

	test('[CAT-05][CAT-07] the vendor trigger starts with its visible text', () => {
		const copy = resolveVendorTableCopy(undefined, {
			category: 'Functionality',
			count: 2,
			onCount: 1,
			open: false,
		});
		expect(`${copy.trigger} ${copy.triggerSuffix}`).toBe(
			'View 2 vendors for Functionality'
		);
		expect(copy.onCount).toBe('1 on');
		expect(copy.table).toBe('Functionality vendors');
		expect(copy.policyLink('Intercom')).toBe('Intercom privacy policy');
		expect(
			resolveVendorTableCopy(undefined, {
				category: 'Analytics',
				count: 1,
				onCount: 1,
				open: true,
			}).trigger
		).toBe('Hide 1 vendor');
	});
});
