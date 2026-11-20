import {
	expandedCategories,
	expandedVendors,
} from '@inth/conformance/play/consent-widget';
import type { Meta, StoryObj } from '@storybook/vue3-vite';

import ConsentWidget from '../../../packages/sdk/vue/src/runtime/components/preferences.vue';
import {
	storybookVendors,
	storybookVendorStoredConsent,
} from '../../storybook-consent-policy';
import {
	storybookInit,
	useStorybookConsent as setupStorybookConsent,
	useStorybookOptOutConsent as setupStorybookOptOutConsent,
} from './storybook-consent-fixtures';

const meta = {
	component: ConsentWidget,
	parameters: {
		layout: 'centered',
	},
	title: 'COMPONENTS - VUE/Core/Consent Widget',
} satisfies Meta<typeof ConsentWidget>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	render: () => ({
		components: { ConsentWidget },
		setup() {
			setupStorybookConsent(null);
		},
		template: '<div style="width: 32rem;"><ConsentWidget /></div>',
	}),
};

export const ExpandedCategories: Story = {
	play: expandedCategories,
	render: () => ({
		components: { ConsentWidget },
		setup() {
			setupStorybookConsent(null);
		},
		template: '<div style="width: 32rem;"><ConsentWidget /></div>',
	}),
};

/** Vendors nested under their categories. Expand Marketing to see two cards. */
export const WithVendors: Story = {
	render: () => ({
		components: { ConsentWidget },
		setup() {
			setupStorybookConsent(
				null,
				{ vendors: storybookVendors },
				storybookInit,
				storybookVendorStoredConsent
			);
		},
		template: '<div style="width: 32rem;"><ConsentWidget /></div>',
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
		components: { ConsentWidget },
		setup() {
			setupStorybookOptOutConsent('request');
		},
		template: '<div style="width: 32rem;"><ConsentWidget /></div>',
	}),
};

/** Durable opt-out honored by an active GPC signal; restricted switches are locked off. */
export const OptOutGpcLocked: Story = {
	render: () => ({
		components: { ConsentWidget },
		setup() {
			setupStorybookOptOutConsent('gpc');
		},
		template: '<div style="width: 32rem;"><ConsentWidget /></div>',
	}),
};

/** Account-held opt-out; switches stay usable with the account notice below each row. */
export const OptOutHeldByAccount: Story = {
	render: () => ({
		components: { ConsentWidget },
		setup() {
			setupStorybookOptOutConsent('account');
		},
		template: '<div style="width: 32rem;"><ConsentWidget /></div>',
	}),
};
