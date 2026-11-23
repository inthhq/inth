import {
	accountAdopted,
	signalHonored,
} from '@inth/conformance/play/opt-out-confirmation';
import type { Meta, StoryObj } from '@storybook/svelte-vite';
import { expect, waitFor, within } from 'storybook/test';

import OptOutConfirmationStory from './opt-out-confirmation-story.svelte';

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
	play: signalHonored,
};

export const AccountAdopted: Story = {
	args: {
		optOutLink: 'do-not-sell',
		variant: 'account-adopted',
	},
	play: accountAdopted,
};
