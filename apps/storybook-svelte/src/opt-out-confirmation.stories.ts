import type { Meta, StoryObj } from '@storybook/svelte-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import OptOutConfirmationStory from './OptOutConfirmationStory.svelte';

const meta = {
	component: OptOutConfirmationStory,
	parameters: {
		layout: 'fullscreen',
	},
	title: 'COMPONENTS - SVELTE/Core/Opt Out Confirmation',
} satisfies Meta<typeof OptOutConfirmationStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const RequestHonored: Story = {
	args: {
		gpc: false,
		optOutLink: 'do-not-sell',
	},
	play: async () => {
		const link = await within(document.body).findByTestId(
			'consent-banner-right-link-opt-out'
		);
		await userEvent.click(link);
		const status = await within(document.body).findByTestId(
			'opt-out-confirmation-status'
		);
		await waitFor(() =>
			expect(status).toHaveTextContent('Opt-out request honored')
		);
	},
};

export const SignalHonored: Story = {
	args: {
		gpc: true,
		optOutLink: 'do-not-sell',
	},
	play: async () => {
		const link = await within(document.body).findByRole('button', {
			name: 'Do Not Sell or Share My Personal Information',
		});
		await userEvent.click(link);
		const status = await within(document.body).findByTestId(
			'opt-out-confirmation-status'
		);
		await waitFor(() =>
			expect(status).toHaveTextContent('Opt-out preference signal honored')
		);
	},
};
