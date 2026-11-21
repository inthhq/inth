import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, waitFor, within } from 'storybook/test';

import { renderAstroStory } from './render-astro-story';

const meta = {
	parameters: {
		layout: 'fullscreen',
	},
	title: 'COMPONENTS - ASTRO/Core/Opt Out Confirmation',
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const RequestHonored: Story = {
	play: async () => {
		const status = await within(document.body).findByTestId(
			'opt-out-confirmation-status'
		);
		await waitFor(() =>
			expect(status).toHaveTextContent('Opt-out request honored')
		);
	},
	render: () => renderAstroStory('opt-out-confirmation--request-honored'),
};

export const RequestConfirmed: Story = {
	play: async () => {
		const status = await within(document.body).findByTestId(
			'opt-out-confirmation-status'
		);
		await waitFor(() =>
			expect(status).toHaveTextContent('Opt-out request honored')
		);
	},
	render: () => renderAstroStory('opt-out-confirmation--request-confirmed'),
};

export const AccountCovered: Story = {
	play: async () => {
		const status = await within(document.body).findByTestId(
			'opt-out-confirmation-status'
		);
		await waitFor(() =>
			expect(status).toHaveTextContent('Opt-out request honored')
		);
	},
	render: () => renderAstroStory('opt-out-confirmation--account-covered'),
};

export const SignalHonored: Story = {
	play: async () => {
		const status = await within(document.body).findByTestId(
			'opt-out-confirmation-status'
		);
		await waitFor(() =>
			expect(status).toHaveTextContent('Opt-out preference signal honored')
		);
	},
	render: () => renderAstroStory('opt-out-confirmation--signal-honored'),
};

export const AccountAdopted: Story = {
	play: async () => {
		const status = await within(document.body).findByTestId(
			'opt-out-confirmation-status'
		);
		await waitFor(() =>
			expect(status).toHaveTextContent('Opt-out request honored')
		);
	},
	render: () => renderAstroStory('opt-out-confirmation--account-adopted'),
};
