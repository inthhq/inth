import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import {
	ConsentBanner,
	ConsentDialog,
	ConsentDialogLink,
	OptOutConfirmation,
} from '../../../packages/sdk/react/src/index';
import {
	storybookMode,
	storybookOptOutPolicy,
} from '../../storybook-consent-policy';
import {
	editableConsentOptions,
	StorybookConsentProvider,
} from './storybook-consent-fixtures';

const meta = {
	component: OptOutConfirmation,
	parameters: {
		layout: 'fullscreen',
	},
	title: 'COMPONENTS - REACT/Core/Opt Out Confirmation',
} satisfies Meta<typeof OptOutConfirmation>;

export default meta;

type Story = StoryObj<typeof meta>;

export const RequestHonored: Story = {
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
	render: () => (
		<StorybookConsentProvider
			options={{
				...editableConsentOptions,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', gpc: false, region: 'CA' },
				presentation: { optOutLink: 'do-not-sell' },
			}}
		>
			<ConsentBanner disableAnimation />
			<ConsentDialog disableAnimation />
		</StorybookConsentProvider>
	),
};

export const SignalHonored: Story = {
	play: async () => {
		const link = await within(document.body).findByRole('button', {
			name: 'Your Privacy Choices',
		});
		await userEvent.click(link);
		const status = await within(document.body).findByTestId(
			'opt-out-confirmation-status'
		);
		await waitFor(() =>
			expect(status).toHaveTextContent('Opt-out preference signal honored')
		);
	},
	render: () => (
		<StorybookConsentProvider
			options={{
				...editableConsentOptions,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', gpc: true, region: 'CA' },
				presentation: { optOutLink: 'privacy-choices' },
			}}
		>
			<ConsentDialogLink right="opt-out" />
			<ConsentDialog disableAnimation />
		</StorybookConsentProvider>
	),
};
