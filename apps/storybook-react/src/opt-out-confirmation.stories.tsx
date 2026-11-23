import {
	accountAdopted,
	signalHonored,
} from '@inth/conformance/play/opt-out-confirmation';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';

import {
	ConsentDialog,
	ConsentDialogLink,
	OptOutConfirmation,
} from '../../../packages/sdk/react/src/index';
import {
	storybookMode,
	storybookOptOutConfirmationRecords,
	storybookOptOutPolicy,
	storybookOptOutPolicyResolution,
} from '../../storybook-consent-policy';
import {
	editableConsentOptions,
	StorybookConsentProvider,
} from './storybook-consent-fixtures';

const expectRequestHonored = async () => {
	const status = await within(document.body).findByTestId(
		'opt-out-confirmation-status'
	);
	await waitFor(() =>
		expect(status).toHaveTextContent('Opt-out request honored')
	);
};

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
	play: expectRequestHonored,
	render: () => (
		<StorybookConsentProvider
			options={{
				...editableConsentOptions,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', gpc: false, region: 'CA' },
				prefetch: {
					initialPolicyResolution: storybookOptOutPolicyResolution,
					initialRecords: storybookOptOutConfirmationRecords('request'),
				},
				presentation: { optOutLink: 'do-not-sell' },
				reloadOnConsentRevoked: false,
			}}
		>
			<OptOutConfirmation
				disableAnimation
				open
			/>
		</StorybookConsentProvider>
	),
};

export const RequestConfirmed: Story = {
	play: expectRequestHonored,
	render: () => (
		<StorybookConsentProvider
			options={{
				...editableConsentOptions,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', gpc: false, region: 'CA' },
				prefetch: {
					initialPolicyResolution: storybookOptOutPolicyResolution,
					initialRecords: storybookOptOutConfirmationRecords('confirmed'),
				},
				presentation: { optOutLink: 'do-not-sell' },
				reloadOnConsentRevoked: false,
			}}
		>
			<OptOutConfirmation
				disableAnimation
				open
			/>
		</StorybookConsentProvider>
	),
};

export const AccountCovered: Story = {
	play: expectRequestHonored,
	render: () => (
		<StorybookConsentProvider
			options={{
				...editableConsentOptions,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', gpc: false, region: 'CA' },
				prefetch: {
					initialPolicyResolution: storybookOptOutPolicyResolution,
					initialRecords: storybookOptOutConfirmationRecords('account-covered'),
				},
				presentation: { optOutLink: 'do-not-sell' },
				reloadOnConsentRevoked: false,
			}}
		>
			<OptOutConfirmation
				disableAnimation
				open
			/>
		</StorybookConsentProvider>
	),
};

export const SignalHonored: Story = {
	play: signalHonored,
	render: () => (
		<StorybookConsentProvider
			options={{
				...editableConsentOptions,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', gpc: true, region: 'CA' },
				prefetch: {
					initialPolicyResolution: storybookOptOutPolicyResolution,
					initialPrivacySignals: { gpc: true },
					initialRecords: storybookOptOutConfirmationRecords('signal'),
				},
				presentation: { optOutLink: 'do-not-sell' },
				reloadOnConsentRevoked: false,
			}}
		>
			<ConsentDialogLink right="opt-out" />
			<ConsentDialog disableAnimation />
		</StorybookConsentProvider>
	),
};

export const AccountAdopted: Story = {
	play: accountAdopted,
	render: () => (
		<StorybookConsentProvider
			options={{
				...editableConsentOptions,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', gpc: false, region: 'CA' },
				prefetch: {
					initialPolicyResolution: storybookOptOutPolicyResolution,
					initialRecords: storybookOptOutConfirmationRecords('account-adopted'),
				},
				presentation: { optOutLink: 'do-not-sell' },
				reloadOnConsentRevoked: false,
			}}
		>
			<ConsentDialogLink right="opt-out" />
			<ConsentDialog disableAnimation />
		</StorybookConsentProvider>
	),
};
