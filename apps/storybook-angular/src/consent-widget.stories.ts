import type { Meta, StoryObj } from '@analogjs/storybook-angular';
import { ConsentWidget } from '@inth/angular/consent-widget';
import {
	expandedCategories,
	expandedVendors,
} from '@inth/conformance/play/consent-widget';

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

/** Durable opt-out honored by a visitor request; switches stay off and usable. */
export const OptOutHonoredByRequest: Story = {
	render: () => ({
		applicationConfig: consentApplication({
			options: {
				...editableConsentOptions,
				mode: storybookMode([storybookOptOutPolicy]),
				prefetch: {
					initialPolicyResolution: storybookOptOutPolicyResolution,
					initialRecords: storybookOptOutRecords('request'),
				},
			},
		}),
		moduleMetadata: { imports: [ConsentWidget] },
		template,
	}),
};

/** Durable opt-out honored by an active GPC signal; restricted switches are locked off. */
export const OptOutGpcLocked: Story = {
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
