/**
 * Google ad tech providers can be the only partners of a purpose they need,
 * so a purpose row counts and lists them with its vendors.
 */
import styles from '@inth/sdk/ui/styles/components/iab-consent-dialog';
import { describe, expect, test, vi } from 'vite-plus/test';
import { userEvent } from 'vite-plus/test/browser';
import { render } from 'vitest-browser-react';

import { ComponentFixtureProvider as InthProvider } from '~/__tests__/component-fixture-provider';

import { completeGVL } from '../../../../../iab/src/__tests__/fixtures/gvl-sample';
import { testing } from '../../../testing';
import { PurposeItem } from '../atoms/purpose-item';

const providerOnlyPurpose = {
	adTechProviders: [
		{ id: 89, name: 'Meta', policyUrl: 'https://meta.example/p' },
		{ id: 2677, name: 'Seedtag', policyUrl: 'https://seedtag.example/p' },
	],
	description: 'Create profiles for personalised advertising',
	id: 3,
	illustrations: [],
	name: 'Create profiles',
	neededByAdTechProviders: true,
	vendors: [],
};

describe('PurposeItem with Google ad tech providers', () => {
	test('leaves stock classes off the provider rows under noStyle', async () => {
		const screen = await render(
			<InthProvider
				options={{
					mode: testing(),
					noStyle: true,
				}}
			>
				<PurposeItem
					purpose={providerOnlyPurpose}
					isEnabled={false}
					onToggle={vi.fn()}
					vendorConsents={{}}
					onVendorToggle={vi.fn()}
					onVendorClick={vi.fn()}
				/>
			</InthProvider>
		);

		await userEvent.click(screen.getByText('Create profiles'));
		await userEvent.click(screen.getByText(/Partners Using This Purpose/u));
		const link = screen.getByRole('link', { name: 'Seedtag' });
		await expect.element(link).toBeInTheDocument();
		const stock = [
			styles.vendorSectionTitle,
			styles.vendorRow,
			styles.vendorInfo,
			styles.vendorName,
		];
		for (const className of stock) {
			expect(
				screen.container.querySelector(`.${CSS.escape(className)}`)
			).toBeNull();
		}
	});

	test('counts and lists providers as partners of a purpose no vendor declares', async () => {
		const screen = await render(
			<InthProvider options={{ mode: testing() }}>
				<PurposeItem
					purpose={providerOnlyPurpose}
					isEnabled={false}
					onToggle={vi.fn()}
					vendorConsents={{}}
					onVendorToggle={vi.fn()}
					onVendorClick={vi.fn()}
				/>
			</InthProvider>
		);

		await expect.element(screen.getByText('2 partners')).toBeInTheDocument();
		await userEvent.click(screen.getByText('Create profiles'));
		await userEvent.click(screen.getByText(/Partners Using This Purpose/u));
		await expect
			.element(screen.getByText(/Partners Using This Purpose \(2\)/u))
			.toBeInTheDocument();
		await expect
			.element(screen.getByRole('link', { name: 'Seedtag' }))
			.toHaveAttribute('href', 'https://seedtag.example/p');
	});
});

describe('PurposeItem objection controls', () => {
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
	const vendor = (id: number) => ({
		cookieMaxAgeSeconds: null,
		deviceStorageDisclosureUrl: null,
		features: [],
		id,
		legIntPurposes: [7],
		name: `Vendor ${id}`,
		policyUrl: '',
		purposes: [],
		specialFeatures: [],
		specialPurposes: [],
		usesCookies: false,
		usesLegitimateInterest: true,
		usesNonCookieAccess: false,
	});

	test('show what a plain Save encodes, and object through one call', async () => {
		const onPurposeObjection = vi.fn();
		const onVendorLegitimateInterestToggle = vi.fn();
		const screen = await render(
			<InthProvider options={{ mode: testing() }}>
				<PurposeItem
					purpose={{
						description: '',
						hasConsentBasis: false,
						id: 7,
						illustrations: [],
						name: 'Measure advertising performance',
						vendors: [vendor(755), vendor(10)],
					}}
					isEnabled={false}
					onToggle={vi.fn()}
					vendorConsents={{}}
					onVendorToggle={vi.fn()}
					onVendorClick={vi.fn()}
					legitimateInterests={legitimateInterests}
					onPurposeObjection={onPurposeObjection}
					onVendorLegitimateInterestToggle={onVendorLegitimateInterestToggle}
				/>
			</InthProvider>
		);

		await userEvent.click(screen.getByText('Measure advertising performance'));
		await userEvent.click(screen.getByText(/Partners Using This Purpose/u));
		await expect.element(screen.getByText('Vendor 10')).toBeInTheDocument();
		const pressed = Array.from(
			screen.container.querySelectorAll('button[aria-pressed]'),
			(button) => button.getAttribute('aria-pressed')
		);
		// The purpose objection, then vendors 755 and 10.
		expect(pressed).toEqual(['false', 'false', 'true']);

		const purposeObjection = screen.container.querySelector<HTMLElement>(
			'button[aria-pressed]'
		);
		await userEvent.click(purposeObjection as HTMLElement);
		expect(onPurposeObjection).toHaveBeenCalledWith(7, true);
		expect(onVendorLegitimateInterestToggle).not.toHaveBeenCalled();
	});
});
