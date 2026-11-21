import {
	dialogContract,
	dialogEscapeCloses,
	saveFlow,
} from '@inth/conformance/play/consent-dialog';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import {
	ConsentBanner,
	ConsentDialog,
} from '../../../packages/sdk/react/src/index';
import {
	storybookMode,
	storybookOptOutPolicy,
	storybookOptOutPolicyResolution,
	storybookOptOutRecords,
} from '../../storybook-consent-policy';
import {
	editableConsentOptions,
	StorybookConsentProvider,
} from './storybook-consent-fixtures';

const meta = {
	component: ConsentDialog,
	parameters: {
		layout: 'fullscreen',
	},
	title: 'COMPONENTS - REACT/Core/Consent Dialog',
} satisfies Meta<typeof ConsentDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	play: async () => {
		const overlay = await within(document.body).findByTestId(
			'consent-dialog-overlay'
		);
		await waitFor(() => expect(getComputedStyle(overlay).opacity).toBe('1'));
	},
	render: () => (
		<StorybookConsentProvider
			options={editableConsentOptions}
			storedConsent={{
				experience: false,
				functionality: false,
				marketing: false,
				measurement: false,
				necessary: true,
			}}
		>
			<ConsentDialog open />
		</StorybookConsentProvider>
	),
};

export const DialogContract: Story = {
	play: dialogContract,
	render: () => (
		<StorybookConsentProvider options={editableConsentOptions}>
			<ConsentBanner />
			<ConsentDialog />
		</StorybookConsentProvider>
	),
};
export const DialogEscapeCloses: Story = {
	...DialogContract,
	play: dialogEscapeCloses,
};
export const SaveFlow: Story = { ...DialogContract, play: saveFlow };

/** Opt-out policy before the visitor opts out. */
export const OptOutNotOptedOut: Story = {
	render: () => (
		<StorybookConsentProvider
			options={{
				...editableConsentOptions,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', gpc: false, region: 'CA' },
				prefetch: {
					initialPolicyResolution: storybookOptOutPolicyResolution,
				},
				presentation: { optOutLink: 'do-not-sell' },
			}}
		>
			<ConsentDialog
				disableAnimation
				open
			/>
		</StorybookConsentProvider>
	),
};

/** Opted out by a click before backend rights confirmation. */
export const OptOutHonoredByRequest: Story = {
	render: () => (
		<StorybookConsentProvider
			options={{
				...editableConsentOptions,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', gpc: false, region: 'CA' },
				prefetch: {
					initialPolicyResolution: storybookOptOutPolicyResolution,
					initialRecords: {
						...storybookOptOutRecords('request'),
						optOutReference: '0193e5a8-8a00-7d3a-9b1c-6e3f8a0b1c2d',
					},
				},
				presentation: { optOutLink: 'do-not-sell' },
			}}
		>
			<ConsentDialog
				disableAnimation
				open
			/>
		</StorybookConsentProvider>
	),
};

/** Opted out with sale and sharing confirmed by the backend. */
export const OptOutConfirmedSaleAndShare: Story = {
	render: () => (
		<StorybookConsentProvider
			options={{
				...editableConsentOptions,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', gpc: false, region: 'CA' },
				prefetch: {
					initialPolicyResolution: storybookOptOutPolicyResolution,
					initialRecords: {
						...storybookOptOutRecords('request'),
						optOutReference: '0193e5a8-8a00-7d3a-9b1c-6e3f8a0b1c2d',
						optOutRightsConfirmed: true,
					},
				},
				presentation: { optOutLink: 'do-not-sell' },
			}}
		>
			<ConsentDialog
				disableAnimation
				open
			/>
		</StorybookConsentProvider>
	),
};

/** Opted out by an active GPC signal; no opt-in link is shown. */
export const OptOutGpcLocked: Story = {
	play: async () => {
		await within(document.body).findByTestId('consent-widget-opt-out-status');
		await expect(
			within(document.body).queryByTestId('consent-widget-opt-in-link')
		).toBeNull();
	},
	render: () => (
		<StorybookConsentProvider
			options={{
				...editableConsentOptions,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', gpc: true, region: 'CA' },
				prefetch: {
					initialPolicyResolution: storybookOptOutPolicyResolution,
					initialPrivacySignals: { gpc: true },
					initialRecords: storybookOptOutRecords('gpc'),
				},
				presentation: { optOutLink: 'privacy-choices' },
			}}
		>
			<ConsentDialog
				disableAnimation
				open
			/>
		</StorybookConsentProvider>
	),
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
	render: () => (
		<StorybookConsentProvider
			options={{
				...editableConsentOptions,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', gpc: false, region: 'CA' },
				prefetch: {
					initialPolicyResolution: storybookOptOutPolicyResolution,
					initialRecords: {
						...storybookOptOutRecords('request'),
						optOutReference: '0193e5a8-8a00-7d3a-9b1c-6e3f8a0b1c2d',
					},
				},
				presentation: { optOutLink: 'do-not-sell' },
			}}
		>
			<ConsentDialog
				disableAnimation
				open
			/>
		</StorybookConsentProvider>
	),
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
	render: () => (
		<StorybookConsentProvider
			options={{
				...editableConsentOptions,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', gpc: false, region: 'CA' },
				prefetch: {
					initialPolicyResolution: storybookOptOutPolicyResolution,
					initialRecords: {
						...storybookOptOutRecords('request'),
						optOutReference: '0193e5a8-8a00-7d3a-9b1c-6e3f8a0b1c2d',
						optOutRightsConfirmed: true,
					},
				},
				presentation: { optOutLink: 'do-not-sell' },
			}}
		>
			<ConsentDialog
				disableAnimation
				open
			/>
		</StorybookConsentProvider>
	),
};
