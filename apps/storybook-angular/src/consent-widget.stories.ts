import type { Meta, StoryObj } from '@analogjs/storybook-angular';
import { ConsentWidget } from '@inth/angular/consent-widget';
import {
	expandedCategories,
	expandedVendors,
} from '@inth/conformance/play/consent-widget';
import { expect, within } from 'storybook/test';

import {
	storybookMode,
	storybookOptOutPolicy,
	storybookOptOutPolicyResolution,
	storybookOptOutRecords,
	storybookVendors,
	storybookVendorStoredConsent,
} from '../../storybook-consent-policy';
import {
	consentApplication,
	editableConsentOptions,
	editableStoredConsent,
} from './storybook-consent-fixtures';

const template = `
	<div style="width: 32rem;">
		<inth-consent-widget />
	</div>
`;

const meta = {
	parameters: {
		layout: 'centered',
	},
	render: () => ({
		applicationConfig: consentApplication({
			options: editableConsentOptions,
			storedConsent: editableStoredConsent,
		}),
		moduleMetadata: { imports: [ConsentWidget] },
		template,
	}),
	title: 'COMPONENTS - ANGULAR/Core/Consent Widget',
} satisfies Meta;

export default meta;

type Story = StoryObj;

export const Default: Story = {};

export const ExpandedCategories: Story = {
	play: expandedCategories,
};

/** Vendors nested under their categories. Expand Marketing to see two cards. */
export const WithVendors: Story = {
	render: () => ({
		applicationConfig: consentApplication({
			options: { ...editableConsentOptions, vendors: storybookVendors },
			storedConsent: storybookVendorStoredConsent,
		}),
		moduleMetadata: { imports: [ConsentWidget] },
		template,
	}),
};

/** Marketing and one vendor card open, the vendor turned off in the draft. */
export const WithVendorsExpanded: Story = {
	...WithVendors,
	play: expandedVendors,
};

/** Under an opt-out policy before the visitor opts out. */
export const OptOutNotOptedOut: Story = {
	render: () => ({
		applicationConfig: consentApplication({
			options: {
				...editableConsentOptions,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', gpc: false, region: 'CA' },
				prefetch: {
					initialPolicyResolution: storybookOptOutPolicyResolution,
				},
				presentation: { optOutLink: 'do-not-sell' },
			},
		}),
		moduleMetadata: { imports: [ConsentWidget] },
		template,
	}),
};

/** Durable opt-out honored by a visitor request before backend rights confirmation. */
export const OptOutHonoredByRequest: Story = {
	render: () => ({
		applicationConfig: consentApplication({
			options: {
				...editableConsentOptions,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', gpc: false, region: 'CA' },
				prefetch: {
					initialPolicyResolution: storybookOptOutPolicyResolution,
					initialRecords: {
						...storybookOptOutRecords('request'),
						optOutReference: '0193e5a8-8a00-7d3a-9b1c-6e3f8a0b1c2d',
					},
				},
				presentation: { optOutLink: 'do-not-sell' },
			},
		}),
		moduleMetadata: { imports: [ConsentWidget] },
		template,
	}),
};

/** Durable opt-out with sale and sharing confirmed by the backend. */
export const OptOutConfirmedSaleAndShare: Story = {
	render: () => ({
		applicationConfig: consentApplication({
			options: {
				...editableConsentOptions,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', gpc: false, region: 'CA' },
				prefetch: {
					initialPolicyResolution: storybookOptOutPolicyResolution,
					initialRecords: {
						...storybookOptOutRecords('request'),
						optOutReference: '0193e5a8-8a00-7d3a-9b1c-6e3f8a0b1c2d',
						optOutRightsConfirmed: true,
					},
				},
				presentation: { optOutLink: 'do-not-sell' },
			},
		}),
		moduleMetadata: { imports: [ConsentWidget] },
		template,
	}),
};

/** Durable opt-out honored by a visitor request with the "Opt back in…" link. */
export const OptOutWithOptInLink: Story = {
	play: async ({ canvasElement }) => {
		const link = await within(canvasElement).findByTestId(
			'consent-widget-opt-in-link'
		);
		await expect(link).toBeVisible();
	},
	render: () => ({
		applicationConfig: consentApplication({
			options: {
				...editableConsentOptions,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', gpc: false, region: 'CA' },
				prefetch: {
					initialPolicyResolution: storybookOptOutPolicyResolution,
					initialRecords: {
						...storybookOptOutRecords('request'),
						optOutReference: '0193e5a8-8a00-7d3a-9b1c-6e3f8a0b1c2d',
					},
				},
				presentation: { optOutLink: 'do-not-sell' },
			},
		}),
		moduleMetadata: { imports: [ConsentWidget] },
		template,
	}),
};

/** Durable opt-out honored by an active GPC signal; restricted switches are locked off and no opt-in link is shown. */
export const OptOutGpcLocked: Story = {
	play: async ({ canvasElement }) => {
		await within(canvasElement).findByTestId('consent-widget-opt-out-status');
		await expect(
			within(canvasElement).queryByTestId('consent-widget-opt-in-link')
		).toBeNull();
	},
	render: () => ({
		applicationConfig: consentApplication({
			options: {
				...editableConsentOptions,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { gpc: true },
				prefetch: {
					initialPolicyResolution: storybookOptOutPolicyResolution,
					initialPrivacySignals: { gpc: true },
					initialRecords: storybookOptOutRecords('gpc'),
				},
			},
		}),
		moduleMetadata: { imports: [ConsentWidget] },
		template,
	}),
};

/** Account-held opt-out; switches stay usable with the account notice below each row. */
export const OptOutHeldByAccount: Story = {
	render: () => ({
		applicationConfig: consentApplication({
			options: {
				...editableConsentOptions,
				mode: storybookMode([storybookOptOutPolicy]),
				prefetch: {
					initialPolicyResolution: storybookOptOutPolicyResolution,
					initialRecords: storybookOptOutRecords('account'),
				},
			},
		}),
		moduleMetadata: { imports: [ConsentWidget] },
		template,
	}),
};
