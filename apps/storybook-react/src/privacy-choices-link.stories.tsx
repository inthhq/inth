import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import {
	ConsentDialog,
	PrivacyChoicesLink,
} from '../../../packages/sdk/react/src/index';
import {
	storybookMode,
	storybookOptOutPolicy,
	storybookPolicy,
} from '../../storybook-consent-policy';
import {
	editableConsentOptions,
	StorybookConsentProvider,
} from './storybook-consent-fixtures';

const FooterLayout = ({ children }: { children: React.ReactNode }) => (
	<footer
		style={{
			alignItems: 'center',
			display: 'flex',
			gap: '1rem',
			padding: '1.5rem',
		}}
	>
		<a href="#privacy">Privacy policy</a>
		<a href="#terms">Terms</a>
		{children}
	</footer>
);

const meta = {
	component: PrivacyChoicesLink,
	parameters: {
		layout: 'centered',
	},
	title: 'COMPONENTS - REACT/Core/Privacy Choices Link',
} satisfies Meta<typeof PrivacyChoicesLink>;

export default meta;

type Story = StoryObj<typeof meta>;

export const YourPrivacyChoices: Story = {
	play: async () => {
		const link = await within(document.body).findByTestId(
			'privacy-choices-link'
		);
		expect(link.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
		await userEvent.click(link);
		await waitFor(() =>
			expect(
				within(document.body).queryByTestId('consent-dialog-root')
			).not.toBeNull()
		);
		expect(
			within(document.body).queryByTestId('opt-out-confirmation-root')
		).toBeNull();
	},
	render: () => (
		<StorybookConsentProvider
			options={{
				...editableConsentOptions,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', region: 'CA' },
				presentation: { optOutLink: 'privacy-choices' },
			}}
		>
			<FooterLayout>
				<PrivacyChoicesLink />
			</FooterLayout>
			<ConsentDialog disableAnimation />
		</StorybookConsentProvider>
	),
};

export const YourCaliforniaPrivacyChoices: Story = {
	play: async () => {
		const link = await within(document.body).findByTestId(
			'privacy-choices-link'
		);
		expect(link.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
		await userEvent.click(link);
		await waitFor(() =>
			expect(
				within(document.body).queryByTestId('consent-dialog-root')
			).not.toBeNull()
		);
		expect(
			within(document.body).queryByTestId('opt-out-confirmation-root')
		).toBeNull();
	},
	render: () => (
		<StorybookConsentProvider
			options={{
				...editableConsentOptions,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', region: 'CA' },
				presentation: { optOutLink: 'california-privacy-choices' },
			}}
		>
			<FooterLayout>
				<PrivacyChoicesLink />
			</FooterLayout>
			<ConsentDialog disableAnimation />
		</StorybookConsentProvider>
	),
};

export const DoNotSell: Story = {
	play: async () => {
		const link = await within(document.body).findByTestId(
			'privacy-choices-link'
		);
		expect(link.querySelector('svg')).toBeNull();
		await userEvent.click(link);
		await waitFor(() =>
			expect(
				within(document.body).queryByTestId('consent-dialog-root')
			).not.toBeNull()
		);
		expect(
			within(document.body).queryByTestId('opt-out-confirmation-root')
		).toBeNull();
	},
	render: () => (
		<StorybookConsentProvider
			options={{
				...editableConsentOptions,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', region: 'CA' },
				presentation: { optOutLink: 'do-not-sell' },
			}}
		>
			<FooterLayout>
				<PrivacyChoicesLink />
			</FooterLayout>
			<ConsentDialog disableAnimation />
		</StorybookConsentProvider>
	),
};

export const HiddenUnderOptInPolicy: Story = {
	play: async () => {
		await waitFor(() =>
			expect(
				within(document.body).queryByTestId('privacy-choices-link')
			).toBeNull()
		);
	},
	render: () => (
		<StorybookConsentProvider
			options={{
				...editableConsentOptions,
				mode: storybookMode([storybookPolicy]),
				overrides: { country: 'DE' },
				presentation: { optOutLink: 'privacy-choices' },
			}}
		>
			<FooterLayout>
				<PrivacyChoicesLink />
			</FooterLayout>
			<ConsentDialog disableAnimation />
		</StorybookConsentProvider>
	),
};
