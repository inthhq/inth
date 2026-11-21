import {
	dialogContract,
	dialogEscapeCloses,
	saveFlow,
} from '@inth/conformance/play/consent-dialog';
import type { Meta, StoryObj } from '@storybook/svelte-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import ConsentDialogOptOutStory from './consent-dialog-opt-out-story.svelte';
import ConsentDialogStory from './ConsentDialogStory.svelte';

const meta = {
	component: ConsentDialogStory,
	parameters: {
		layout: 'fullscreen',
	},
	title: 'COMPONENTS - SVELTE/Core/Consent Dialog',
} satisfies Meta<typeof ConsentDialogStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		open: true,
		useStoredConsent: true,
	},
};

export const DialogContract: Story = {
	args: {
		withBanner: true,
	},
	play: dialogContract,
};

export const SaveFlow: Story = {
	args: {
		withBanner: true,
	},
	play: saveFlow,
};

export const DialogEscapeCloses: Story = {
	args: {
		withBanner: true,
	},
	play: dialogEscapeCloses,
};

/** Opt-out policy before the visitor opts out. */
export const OptOutNotOptedOut: Story = {
	render: () => ({
		Component: ConsentDialogOptOutStory,
		props: { kind: 'not-opted-out' },
	}),
};

/** Opted out by a click before backend rights confirmation. */
export const OptOutHonoredByRequest: Story = {
	render: () => ({
		Component: ConsentDialogOptOutStory,
		props: { kind: 'request' },
	}),
};

/** Opted out with sale and sharing confirmed by the backend. */
export const OptOutConfirmedSaleAndShare: Story = {
	render: () => ({
		Component: ConsentDialogOptOutStory,
		props: { kind: 'confirmed' },
	}),
};

/** Opted out by an active GPC signal; no opt-in link is shown. */
export const OptOutGpcLocked: Story = {
	play: async () => {
		await within(document.body).findByTestId('consent-widget-opt-out-status');
		await expect(
			within(document.body).queryByTestId('consent-widget-opt-in-link')
		).toBeNull();
	},
	render: () => ({
		Component: ConsentDialogOptOutStory,
		props: { kind: 'gpc' },
	}),
};

/** Two-step opt-in confirmation dialog opened from the opt-out block. */
export const OptInConfirmation: Story = {
	play: async () => {
		const link = await within(document.body).findByTestId(
			'consent-widget-opt-in-link'
		);
		await userEvent.click(link);
		const dialog = await within(document.body).findByTestId(
			'opt-in-confirmation-root'
		);
		await expect(dialog).toBeVisible();
		const cancel = within(dialog).getByTestId(
			'opt-in-confirmation-cancel-button'
		);
		await waitFor(() => expect(document.activeElement).toBe(cancel));
	},
	render: () => ({
		Component: ConsentDialogOptOutStory,
		props: { kind: 'request' },
	}),
};

/** Two-step opt-in confirmation dialog when the backend confirmed the refused rights. */
export const OptInConfirmationConfirmedRights: Story = {
	play: async () => {
		const link = await within(document.body).findByTestId(
			'consent-widget-opt-in-link'
		);
		await userEvent.click(link);
		const dialog = await within(document.body).findByTestId(
			'opt-in-confirmation-root'
		);
		await expect(dialog).toBeVisible();
	},
	render: () => ({
		Component: ConsentDialogOptOutStory,
		props: { kind: 'confirmed' },
	}),
};
