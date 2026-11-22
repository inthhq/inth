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

const expectRequestHonored = async () => {
	const status = await within(document.body).findByTestId(
		'opt-out-confirmation-status'
	);
	await waitFor(() =>
		expect(status).toHaveTextContent('Opt-out request honored')
	);
};

export const RequestHonored: Story = {
	args: {
		optOutLink: 'do-not-sell',
		variant: 'request',
	},
	play: expectRequestHonored,
};

export const RequestConfirmed: Story = {
	args: {
		optOutLink: 'do-not-sell',
		variant: 'confirmed',
	},
	play: expectRequestHonored,
};

export const AccountCovered: Story = {
	args: {
		optOutLink: 'do-not-sell',
		variant: 'account-covered',
	},
	play: expectRequestHonored,
};

export const SignalHonored: Story = {
	args: {
		optOutLink: 'do-not-sell',
		variant: 'signal',
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

export const AccountAdopted: Story = {
	args: {
		optOutLink: 'do-not-sell',
		variant: 'account-adopted',
	},
	play: async () => {
		const link = await within(document.body).findByTestId(
			'consent-dialog-link'
		);
		await userEvent.click(link);
		await expectRequestHonored();
	},
};
