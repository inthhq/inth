import {
	expandedCategories,
	expandedVendors,
} from '@inth/conformance/play/consent-widget';
import type { Meta, StoryObj } from '@storybook/svelte-vite';
import { expect, within } from 'storybook/test';

import ConsentWidgetOptOutStory from './consent-widget-opt-out-story.svelte';
import ConsentWidgetStory from './consent-widget-story.svelte';
import ConsentWidgetVendorsStory from './consent-widget-vendors-story.svelte';

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

/** Under an opt-out policy before the visitor opts out. */
export const OptOutNotOptedOut: Story = {
	render: () => ({
		Component: ConsentWidgetOptOutStory,
		props: { kind: 'not-opted-out' },
	}),
};

/** Durable opt-out honored by a visitor request before backend rights confirmation. */
export const OptOutHonoredByRequest: Story = {
	render: () => ({
		Component: ConsentWidgetOptOutStory,
		props: { kind: 'request' },
	}),
};

/** Durable opt-out with sale and sharing confirmed by the backend. */
export const OptOutConfirmedSaleAndShare: Story = {
	render: () => ({
		Component: ConsentWidgetOptOutStory,
		props: { kind: 'confirmed' },
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
		Component: ConsentWidgetOptOutStory,
		props: { kind: 'request' },
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
