import type { Meta, StoryObj } from '@analogjs/storybook-angular';
import { ConsentWidget } from '@c15t/angular/consent-widget';
import {
	expandedCategories,
	expandedVendors,
} from '@c15t/conformance/play/consent-widget';

import {
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
		<c15t-consent-widget />
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
