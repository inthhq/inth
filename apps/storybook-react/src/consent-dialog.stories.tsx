import {
	dialogContract,
	dialogEscapeCloses,
	saveFlow,
} from '@inth/conformance/play/consent-dialog';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';

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

/** Opted out by an active GPC signal. */
export const OptOutGpcLocked: Story = {
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
