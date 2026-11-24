/**
 * The IAB rows and the vendor list, mounted on their own.
 *
 * A purpose row whose vendors all use legitimate interest has nothing a
 * consent switch could turn off, so it offers only the objection. Under a
 * publisher restriction the controls must write the legal basis the
 * restriction leaves: the emitted choices are applied to a real
 * `createIAB` handle the way the dialog wires them, then saved, so each
 * case ends at the gate.
 */
import type { Type } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { createConsentKernel, evaluateConsent } from '@inth/sdk/engine';
import type { ConsentKernel } from '@inth/sdk/engine';
import { createIAB } from '@inth/sdk/iab';
import type { IABHandle } from '@inth/sdk/iab';
import {
	createPolicyRuleFingerprints,
	normalizePolicyRule,
} from '@inth/sdk/schema/types';
import { resolveIABCopy } from '@inth/sdk/surface-state';
import { afterEach, describe, expect, test } from 'vite-plus/test';

import { completeGVL } from '../../../iab/src/__tests__/fixtures/gvl-sample';
import type { IABPurposeChoice, IABVendorChoice } from './iab-purpose-item';
import { IABPurposeItem } from './iab-purpose-item';
import { IABStackItem } from './iab-stack-item';
import { IABVendorList } from './iab-vendor-list';

const iabT = resolveIABCopy(undefined);
const disposers: (() => void)[] = [];

afterEach(() => {
	for (const dispose of disposers.splice(0)) {
		dispose();
	}
	TestBed.resetTestingModule();
	localStorage.clear();
});

const purpose = (hasConsentBasis: boolean) => ({
	description: '',
	hasConsentBasis,
	id: 7,
	illustrations: [],
	name: 'Measure advertising performance',
	vendors: [
		{
			cookieMaxAgeSeconds: null,
			deviceStorageDisclosureUrl: null,
			features: [],
			id: 755,
			legIntPurposes: [7],
			name: 'Vendor 755',
			policyUrl: '',
			purposes: [],
			specialFeatures: [],
			specialPurposes: [],
			usesCookies: false,
			usesLegitimateInterest: true,
			usesNonCookieAccess: false,
		},
	],
});

/** Mount a component with its inputs and collect what it emits. */
const mount = async <Component>(
	type: Type<Component>,
	inputs: Record<string, unknown>
) => {
	const fixture: ComponentFixture<Component> = TestBed.createComponent(type);
	for (const [name, value] of Object.entries(inputs)) {
		fixture.componentRef.setInput(name, value);
	}
	const emitted = {
		purposeLegitimateInterest: [] as IABPurposeChoice[],
		purposeToggle: [] as unknown[],
		vendorLegitimateInterest: [] as IABVendorChoice[],
		vendorToggle: [] as IABVendorChoice[],
	};
	const instance = fixture.componentInstance as Record<
		string,
		{ subscribe?: (listener: (value: never) => void) => unknown }
	>;
	instance.purposeToggle?.subscribe?.((value) =>
		emitted.purposeToggle.push(value)
	);
	instance.vendorToggle?.subscribe?.((value) =>
		emitted.vendorToggle.push(value)
	);
	instance.vendorLegitimateInterestToggle?.subscribe?.((value) =>
		emitted.vendorLegitimateInterest.push(value)
	);
	instance.purposeLegitimateInterestToggle?.subscribe?.((value) =>
		emitted.purposeLegitimateInterest.push(value)
	);
	await fixture.whenStable();
	const root = fixture.nativeElement as HTMLElement;
	return { emitted, fixture, root };
};

const setupHandle = async (): Promise<{
	handle: IABHandle;
	kernel: ConsentKernel;
}> => {
	const policy = normalizePolicyRule({
		id: 'iab-angular',
		match: { isDefault: true },
		model: 'iab',
		prompt: 'choice',
	});
	const kernel = createConsentKernel({
		initialIab: { cmpId: 28, enabled: true, gvl: completeGVL },
		initialPolicyResolution: {
			fingerprints: createPolicyRuleFingerprints(policy),
			matchedBy: 'default',
			policy,
			policyId: policy.id,
			status: 'matched',
		},
	});
	const handle = createIAB({
		cmpId: 28,
		gvl: completeGVL,
		kernel,
		persistence: false,
		// Vendor 755 must use legitimate interest for purpose 7.
		publisherRestrictions: [
			{ purposeId: 7, restrictionType: 2, vendorIds: [755] },
		],
	});
	disposers.push(handle.dispose, kernel.dispose);
	await handle.whenReady();
	return { handle, kernel };
};

// Only the IAB gate decides: `necessary` has no category restriction.
const restrictedTarget = {
	category: 'necessary' as const,
	iabLegIntPurposes: [7],
	vendorId: 755,
};

describe('IAB purpose row consent switch', () => {
	test.each([
		[true, 1],
		[false, 0],
	])(
		'hasConsentBasis %s renders %i switches',
		async (hasConsentBasis, count) => {
			const { fixture, root } = await mount(IABPurposeItem, {
				iabT,
				isEnabled: true,
				purpose: purpose(hasConsentBasis),
				purposeObjection: true,
				vendorObjection: true,
			});
			expect(
				root.querySelectorAll(
					'[role="switch"][aria-label="Measure advertising performance"]'
				)
			).toHaveLength(count);
			// The objection control is there either way, in the row's content,
			// which is created when the row first opens.
			expect(root.querySelector('button[aria-pressed]')).toBeNull();
			root
				.querySelector<HTMLElement>('[id^="inth-preference-item-trigger-"]')
				?.click();
			await fixture.whenStable();
			expect(root.querySelector('button[aria-pressed]')).not.toBeNull();
		}
	);

	test('a stack of legitimate-interest-only purposes has no consent switch', async () => {
		const { root } = await mount(IABStackItem, {
			iabT,
			purposeObjection: true,
			stack: {
				description: '',
				id: 1,
				name: 'Advertising',
				purposes: [purpose(false)],
			},
		});
		expect(
			root.querySelectorAll('[role="switch"][aria-label="Advertising"]')
		).toHaveLength(0);
	});

	test('without an objection the stack switch still reflects and sets consent', async () => {
		const { emitted, root } = await mount(IABStackItem, {
			iabT,
			stack: {
				description: '',
				id: 1,
				name: 'Advertising',
				purposes: [purpose(false)],
			},
		});
		const stackSwitch = root.querySelector<HTMLElement>(
			'[role="switch"][aria-label="Advertising"]'
		);
		expect(stackSwitch?.getAttribute('aria-checked')).toBe('false');
		stackSwitch?.click();
		expect(emitted.purposeToggle).toEqual([{ purposeId: 7, value: true }]);
	});
});

describe('IAB controls under a legitimate-interest restriction', () => {
	test('allowing the purpose objection grants the vendor LI signal', async () => {
		const { handle, kernel } = await setupHandle();
		const { emitted, fixture, root } = await mount(IABPurposeItem, {
			iabT,
			// The visitor had objected; the only control lifts the objection.
			legitimateInterests: {
				gvl: null,
				purposeLegitimateInterests: { 7: false },
				vendorLegitimateInterests: { 755: false },
			},
			purpose: purpose(false),
			purposeObjection: true,
			vendorObjection: true,
		});
		root
			.querySelector<HTMLElement>('[id^="inth-preference-item-trigger-"]')
			?.click();
		await fixture.whenStable();
		root.querySelector<HTMLElement>('button[aria-pressed]')?.click();

		// The dialog applies the purpose choice as one objection.
		for (const { purposeId, value } of emitted.purposeLegitimateInterest) {
			handle.setPurposeObjection(purposeId, !value);
		}
		expect(emitted.vendorLegitimateInterest).toEqual([]);
		await handle.save();
		expect(evaluateConsent(restrictedTarget, kernel.getSnapshot())).toBe(true);
	});

	test('the vendor tab offers the objection a restricted vendor needs', async () => {
		const { handle, kernel } = await setupHandle();
		const { 755: vendor755 } = completeGVL.vendors;
		if (!vendor755) {
			throw new Error('Missing vendor 755 fixture');
		}
		// The list the dialog passes after restrictions: 7 is now LI.
		const restricted = {
			...completeGVL,
			vendors: {
				755: {
					...vendor755,
					legIntPurposes: [7],
					purposes: vendor755.purposes.filter((id) => id !== 7),
				},
			},
		};
		const { emitted, fixture, root } = await mount(IABVendorList, {
			iabT,
			legitimateInterests: {
				gvl: null,
				purposeLegitimateInterests: {},
				vendorLegitimateInterests: { 755: false },
			},
			vendorData: restricted,
			vendorObjection: true,
		});
		root
			.querySelector<HTMLElement>(
				'[id$="-vendor-755"] [id^="inth-preference-item-trigger-"]'
			)
			?.click();
		await fixture.whenStable();
		root
			.querySelector<HTMLElement>('[id$="-vendor-755"] button[aria-pressed]')
			?.click();

		handle.setPurposeLegitimateInterest(7, true);
		for (const { vendorId, value } of emitted.vendorLegitimateInterest) {
			handle.setVendorLegitimateInterest(vendorId, value);
		}
		await handle.save();
		expect(evaluateConsent(restrictedTarget, kernel.getSnapshot())).toBe(true);
	});
});

test('an untouched objection control shows what a plain Save encodes', async () => {
	// Vendor 10 declares purpose 7 on legitimate interest; the restriction
	// moves vendor 755 there. A save with an empty draft encodes only 755.
	const { handle, kernel } = await setupHandle();
	const { fixture, root } = await mount(IABPurposeItem, {
		iabT,
		legitimateInterests: kernel.getSnapshot().iab,
		purpose: {
			...purpose(false),
			vendors: [
				purpose(false).vendors[0],
				{ ...purpose(false).vendors[0], id: 10, name: 'Vendor 10' },
			],
		},
		vendorObjection: true,
	});
	root
		.querySelector<HTMLElement>('[id^="inth-preference-item-trigger-"]')
		?.click();
	await fixture.whenStable();
	// The vendors sit behind their own disclosure.
	for (const button of root.querySelectorAll<HTMLElement>(
		'button[aria-expanded="false"]'
	)) {
		button.click();
	}
	await fixture.whenStable();
	const objected = [
		...root.querySelectorAll<HTMLElement>('button[aria-pressed]'),
	].map((button) => button.getAttribute('aria-pressed'));
	await handle.save();
	const saved = kernel.getSnapshot().iab?.authority;
	expect(objected).toEqual([
		String(saved?.vendorLegitimateInterests['755'] !== true),
		String(saved?.vendorLegitimateInterests['10'] !== true),
	]);
	expect(objected).toEqual(['false', 'true']);
});

describe('IAB vendor list', () => {
	const adTechProviders = [
		{
			id: 89,
			name: 'Example Ad Tech',
			policyUrl: 'https://ads.example/privacy',
		},
		{ id: 2577, name: 'Other Ad Tech', policyUrl: 'https://other.example/p' },
	];

	test('lists each ad tech provider with its privacy policy and a consent switch', async () => {
		const { root } = await mount(IABVendorList, {
			adTechProviderConsents: { '2577': true },
			adTechProviders,
			iabT,
		});
		const row = root.querySelector('[id$="-ad-tech-provider-89"]');
		expect(row?.textContent).toContain('Example Ad Tech');
		expect(row?.querySelector('a')?.getAttribute('href')).toBe(
			'https://ads.example/privacy'
		);
		expect(root.textContent).toContain('Google Ad Tech Providers');
		expect(
			root
				.querySelector('[id$="-ad-tech-provider-2577"] [role="switch"]')
				?.getAttribute('aria-checked')
		).toBe('true');
	});

	test('creates a vendor row’s details only when it first opens', async () => {
		const { fixture, root } = await mount(IABVendorList, {
			iabT,
			vendorData: completeGVL,
		});
		const rows = root.querySelectorAll('[id*="-vendor-"]');
		expect(rows.length).toBe(Object.keys(completeGVL.vendors).length);
		// A closed row is its header only: no links, badges or lists yet.
		expect(root.querySelectorAll('a[target="_blank"]')).toHaveLength(0);
		rows[0]
			?.querySelector<HTMLElement>('[id^="inth-preference-item-trigger-"]')
			?.click();
		await fixture.whenStable();
		expect(
			rows[0]?.querySelectorAll('a[target="_blank"]').length
		).toBeGreaterThan(0);
	});

	test('keeps a custom vendor apart from a registered vendor with its id', async () => {
		const { fixture, root } = await mount(IABVendorList, {
			customVendors: [
				{
					id: 1,
					name: 'Colliding custom',
					privacyPolicyUrl: 'https://example.test/privacy',
					purposes: [1],
				},
			],
			iabT,
			vendorData: completeGVL,
		});
		const rows = [...root.querySelectorAll('[id*="-vendor-"]')];
		const named = (name: string) =>
			rows.find((row) => row.textContent?.includes(name));
		const registered = named(completeGVL.vendors[1]?.name ?? '');
		const custom = named('Colliding custom');
		expect(registered).toBeDefined();
		expect(custom).toBeDefined();
		expect(registered?.id).not.toBe(custom?.id);

		custom
			?.querySelector<HTMLElement>('[id^="inth-preference-item-trigger-"]')
			?.click();
		await fixture.whenStable();
		expect(
			custom?.querySelectorAll('a[target="_blank"]').length
		).toBeGreaterThan(0);
		// Opening the custom row leaves the registered one closed.
		expect(registered?.querySelectorAll('a[target="_blank"]')).toHaveLength(0);
	});

	test('a custom vendor offers no objection on a consent-only purpose and rounds its max age up', async () => {
		const { fixture, root } = await mount(IABVendorList, {
			customVendors: [
				{
					cookieMaxAgeSeconds: 3600,
					id: 'custom-li',
					legIntPurposes: [1],
					name: 'Custom LI',
					privacyPolicyUrl: 'https://example.test/privacy',
					purposes: [],
				},
			],
			iabT,
			vendorObjection: true,
		});
		const row = root.querySelector('[id$="-vendor-custom-li"]');
		row
			?.querySelector<HTMLElement>('[id^="inth-preference-item-trigger-"]')
			?.click();
		await fixture.whenStable();
		// TCF Policies Appendix A: purpose 1 allows consent only.
		expect(row?.querySelector('button[aria-pressed]')).toBeNull();
		// An hour is not "0d".
		expect(row?.textContent).toContain('Max Age: 1d');
	});

	test('search filters the vendors and reports the count', async () => {
		const { fixture, root } = await mount(IABVendorList, {
			iabT,
			vendorData: completeGVL,
		});
		const total = Object.keys(completeGVL.vendors).length;
		const input = root.querySelector<HTMLInputElement>('input[type="text"]');
		const [first] = Object.values(completeGVL.vendors);
		if (!input || !first) {
			throw new Error('Missing search input or vendor');
		}
		input.value = first.name;
		input.dispatchEvent(new Event('input'));
		await fixture.whenStable();
		expect(root.querySelectorAll('[id*="-vendor-"]').length).toBeLessThan(
			total
		);
		expect(root.textContent).toContain(first.name);
		expect(root.textContent).toMatch(new RegExp(`of ${total}`, 'u'));
	});
});
