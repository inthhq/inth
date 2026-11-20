import {
	expandedCategories,
	expandedVendors,
} from '@inth/conformance/play/consent-widget';
import type { Meta, StoryObj } from '@storybook/svelte-vite';

import ConsentWidgetOptOutStory from './consent-widget-opt-out-story.svelte';
import ConsentWidgetVendorsStory from './consent-widget-vendors-story.svelte';
import ConsentWidgetStory from './ConsentWidgetStory.svelte';

const meta = {
	component: ConsentWidgetStory,
	parameters: {
		layout: 'centered',
	},
	title: 'COMPONENTS - SVELTE/Core/Consent Widget',
} satisfies Meta<ConsentWidgetStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ExpandedCategories: Story = {
	play: expandedCategories,
};

/** Vendors nested under their categories. Expand Marketing to see two cards. */
export const WithVendors: Story = {
	render: () => ({ Component: ConsentWidgetVendorsStory }),
};

/** Marketing and one vendor card open, the vendor turned off in the draft. */
export const WithVendorsExpanded: Story = {
	...WithVendors,
	play: expandedVendors,
};

/** Durable opt-out honored by a visitor request; switches stay off and usable. */
export const OptOutHonoredByRequest: Story = {
	render: () => ({
		Component: ConsentWidgetOptOutStory,
		props: { kind: 'request' },
	}),
};

/** Durable opt-out honored by an active GPC signal; restricted switches are locked off. */
export const OptOutGpcLocked: Story = {
	render: () => ({
		Component: ConsentWidgetOptOutStory,
		props: { kind: 'gpc' },
	}),
};

/** Account-held opt-out; switches stay usable with the account notice below each row. */
export const OptOutHeldByAccount: Story = {
	render: () => ({
		Component: ConsentWidgetOptOutStory,
		props: { kind: 'account' },
	}),
};
