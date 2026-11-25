import { resolveIABCopy } from '@inth/sdk/surface-state';
/**
 * A purpose row whose vendors all use legitimate interest has nothing a
 * consent switch could turn off. Showing one reads as an opt-out while
 * every vendor keeps processing, so the row offers only the objection.
 */
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, test, vi } from 'vite-plus/test';

import { completeGVL } from '../../../iab/src/__tests__/fixtures/gvl-sample';
import IABPurposeItem from '../lib/components/iab/iab-purpose-item.svelte';
import IABStackItem from '../lib/components/iab/iab-stack-item.svelte';

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
			name: 'Vendor',
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

const handlers = {
	onPurposeObjection: vi.fn(),
	onToggle: vi.fn(),
	onVendorClick: vi.fn(),
	onVendorToggle: vi.fn(),
};

describe('IAB purpose row consent switch', () => {
	test.each([
		[true, 1],
		[false, 0],
	])(
		'hasConsentBasis %s renders %i switches',
		async (hasConsentBasis, count) => {
			const { container } = render(IABPurposeItem, {
				...handlers,
				iabT: resolveIABCopy(undefined),
				isEnabled: true,
				purpose: purpose(hasConsentBasis),
				vendorConsents: {},
			});
			expect(
				container.querySelectorAll(
					'[role="switch"][aria-label="Measure advertising performance"]'
				)
			).toHaveLength(count);
			// The objection control is there either way, in the row's content,
			// which mounts when the row first opens.
			container
				.querySelector<HTMLElement>('[id^="inth-preference-item-trigger-"]')
				?.click();
			await tick();
			expect(container.querySelector('button[aria-pressed]')).not.toBeNull();
		}
	);

	test('a stack of legitimate-interest-only purposes has no consent switch', () => {
		const { container } = render(IABStackItem, {
			...handlers,
			consents: {},
			iabT: resolveIABCopy(undefined),
			onToggle: vi.fn(),
			stack: {
				description: '',
				id: 1,
				name: 'Advertising',
				purposes: [purpose(false)],
			},
			vendorConsents: {},
		});
		expect(
			container.querySelectorAll('[role="switch"][aria-label="Advertising"]')
		).toHaveLength(0);
	});

	test('without an objection handler the stack switch still reflects and sets consent', async () => {
		const onToggle = vi.fn();
		const { container } = render(IABStackItem, {
			consents: {},
			iabT: resolveIABCopy(undefined),
			onToggle,
			onVendorClick: vi.fn(),
			onVendorToggle: vi.fn(),
			stack: {
				description: '',
				id: 1,
				name: 'Advertising',
				purposes: [purpose(false)],
			},
			vendorConsents: {},
		});
		const stackSwitch = container.querySelector<HTMLElement>(
			'[role="switch"][aria-label="Advertising"]'
		);
		expect(stackSwitch?.getAttribute('aria-checked')).toBe('false');
		stackSwitch?.click();
		await Promise.resolve();
		expect(onToggle).toHaveBeenCalledWith(7, true);
	});
});

describe('IAB purpose row objection controls', () => {
	// Vendor 10 declares purpose 7 on legitimate interest; the restriction
	// moves vendor 755 there. With an empty draft a plain Save encodes the
	// purpose and vendor 755 as allowed and vendor 10 as objected.
	const legitimateInterests = {
		gvl: completeGVL,
		publisherRestrictions: [
			{ purposeId: 7, restrictionType: 2 as const, vendorIds: [755] },
		],
		purposeLegitimateInterests: {},
		vendorLegitimateInterests: {},
	};
	const row = purpose(false);
	const twoVendors = {
		...row,
		vendors: [
			...row.vendors,
			{ ...row.vendors[0], id: 10, legIntPurposes: [7], name: 'Vendor 10' },
		],
	};

	test('show what a plain Save encodes, and object through one call', async () => {
		const onPurposeObjection = vi.fn();
		const onVendorLegitimateInterestToggle = vi.fn();
		const { container } = render(IABPurposeItem, {
			...handlers,
			iabT: resolveIABCopy(undefined),
			isEnabled: false,
			legitimateInterests,
			onPurposeObjection,
			onVendorLegitimateInterestToggle,
			purpose: twoVendors,
			vendorConsents: {},
		});
		container
			.querySelector<HTMLElement>('[id^="inth-preference-item-trigger-"]')
			?.click();
		await tick();
		for (const button of container.querySelectorAll<HTMLElement>(
			'button[aria-expanded="false"]'
		)) {
			button.click();
		}
		await tick();
		const pressed = [
			...container.querySelectorAll<HTMLElement>('button[aria-pressed]'),
		].map((button) => button.getAttribute('aria-pressed'));
		// The purpose objection, then vendors 755 and 10.
		expect(pressed).toEqual(['false', 'false', 'true']);

		container.querySelector<HTMLElement>('button[aria-pressed]')?.click();
		expect(onPurposeObjection).toHaveBeenCalledWith(7, true);
		expect(onVendorLegitimateInterestToggle).not.toHaveBeenCalled();
	});
});
