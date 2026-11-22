import type { Meta, StoryObj } from '@analogjs/storybook-angular';
import { ConsentDialogLink } from '@inth/angular';
import {
	ConsentDialog,
	OptOutConfirmation,
} from '@inth/angular/consent-dialog';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import {
	storybookMode,
	storybookOptOutConfirmationRecords,
	storybookOptOutPolicy,
	storybookOptOutPolicyResolution,
} from '../../storybook-consent-policy';
import {
	consentApplication,
	editableConsentOptions,
} from './storybook-consent-fixtures';

const expectRequestHonored = async () => {
	const status = await within(document.body).findByTestId(
		'opt-out-confirmation-status'
	);
	await waitFor(() =>
		expect(status).toHaveTextContent('Opt-out request honored')
	);
};

const openConfirmationTemplate = `
	<inth-opt-out-confirmation [disableAnimation]="true" [open]="true" />
`;

const linkDialogTemplate = `
	<button inthConsentDialogLink [right]="'opt-out'" type="button"></button>
	<inth-consent-dialog [disableAnimation]="true" />
`;

const meta = {
	parameters: {
		layout: 'fullscreen',
	},
	title: 'COMPONENTS - ANGULAR/Core/Opt Out Confirmation',
} satisfies Meta;

export default meta;

type Story = StoryObj;

export const RequestHonored: Story = {
	play: expectRequestHonored,
	render: () => ({
		applicationConfig: consentApplication({
			options: {
				...editableConsentOptions,
				disableAnimation: true,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', gpc: false, region: 'CA' },
				prefetch: {
					initialPolicyResolution: storybookOptOutPolicyResolution,
					initialRecords: storybookOptOutConfirmationRecords('request'),
				},
				presentation: { optOutLink: 'do-not-sell' },
				reloadOnConsentRevoked: false,
			},
		}),
		moduleMetadata: {
			imports: [OptOutConfirmation],
		},
		template: openConfirmationTemplate,
	}),
};

export const RequestConfirmed: Story = {
	play: expectRequestHonored,
	render: () => ({
		applicationConfig: consentApplication({
			options: {
				...editableConsentOptions,
				disableAnimation: true,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', gpc: false, region: 'CA' },
				prefetch: {
					initialPolicyResolution: storybookOptOutPolicyResolution,
					initialRecords: storybookOptOutConfirmationRecords('confirmed'),
				},
				presentation: { optOutLink: 'do-not-sell' },
				reloadOnConsentRevoked: false,
			},
		}),
		moduleMetadata: {
			imports: [OptOutConfirmation],
		},
		template: openConfirmationTemplate,
	}),
};

export const AccountCovered: Story = {
	play: expectRequestHonored,
	render: () => ({
		applicationConfig: consentApplication({
			options: {
				...editableConsentOptions,
				disableAnimation: true,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', gpc: false, region: 'CA' },
				prefetch: {
					initialPolicyResolution: storybookOptOutPolicyResolution,
					initialRecords: storybookOptOutConfirmationRecords('account-covered'),
				},
				presentation: { optOutLink: 'do-not-sell' },
				reloadOnConsentRevoked: false,
			},
		}),
		moduleMetadata: {
			imports: [OptOutConfirmation],
		},
		template: openConfirmationTemplate,
	}),
};

export const SignalHonored: Story = {
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
	render: () => ({
		applicationConfig: consentApplication({
			options: {
				...editableConsentOptions,
				disableAnimation: true,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', gpc: true, region: 'CA' },
				prefetch: {
					initialPolicyResolution: storybookOptOutPolicyResolution,
					initialPrivacySignals: { gpc: true },
					initialRecords: storybookOptOutConfirmationRecords('signal'),
				},
				presentation: { optOutLink: 'do-not-sell' },
				reloadOnConsentRevoked: false,
			},
		}),
		moduleMetadata: {
			imports: [ConsentDialog, ConsentDialogLink],
		},
		template: linkDialogTemplate,
	}),
};

export const AccountAdopted: Story = {
	play: async () => {
		const link = await within(document.body).findByTestId(
			'consent-dialog-link'
		);
		await userEvent.click(link);
		await expectRequestHonored();
	},
	render: () => ({
		applicationConfig: consentApplication({
			options: {
				...editableConsentOptions,
				disableAnimation: true,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', gpc: false, region: 'CA' },
				prefetch: {
					initialPolicyResolution: storybookOptOutPolicyResolution,
					initialRecords: storybookOptOutConfirmationRecords('account-adopted'),
				},
				presentation: { optOutLink: 'do-not-sell' },
				reloadOnConsentRevoked: false,
			},
		}),
		moduleMetadata: {
			imports: [ConsentDialog, ConsentDialogLink],
		},
		template: linkDialogTemplate,
	}),
};
