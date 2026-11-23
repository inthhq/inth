import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import ConsentDialogLink from '../../../packages/sdk/vue/src/runtime/components/consent-dialog-link.vue';
import ConsentManager from '../../../packages/sdk/vue/src/runtime/components/dialog/manager.vue';
import OptOutConfirmation from '../../../packages/sdk/vue/src/runtime/components/opt-out-confirmation.vue';
import {
	storybookMode as createOfflineStorybookMode,
	storybookOptOutConfirmationRecords,
	storybookOptOutPolicy,
} from '../../storybook-consent-policy';
import { useStorybookOptOutConsent as setupStorybookOptOutConsent } from './storybook-consent-fixtures';

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
	title: 'COMPONENTS - VUE/Core/Opt Out Confirmation',
} satisfies Meta<typeof OptOutConfirmation>;

export default meta;

type Story = StoryObj<typeof meta>;

export const RequestHonored: Story = {
	play: expectRequestHonored,
	render: () => ({
		components: { OptOutConfirmation },
		setup() {
			setupStorybookOptOutConsent('none', {
				configOverrides: {
					disableAnimation: true,
					presentation: { optOutLink: 'do-not-sell' },
					reloadOnConsentRevoked: false,
				},
				initialRecords: storybookOptOutConfirmationRecords('request'),
				mode: createOfflineStorybookMode([storybookOptOutPolicy]),
			});
		},
		template: '<OptOutConfirmation disable-animation open />',
	}),
};

export const RequestConfirmed: Story = {
	play: expectRequestHonored,
	render: () => ({
		components: { OptOutConfirmation },
		setup() {
			setupStorybookOptOutConsent('none', {
				configOverrides: {
					disableAnimation: true,
					presentation: { optOutLink: 'do-not-sell' },
					reloadOnConsentRevoked: false,
				},
				initialRecords: storybookOptOutConfirmationRecords('confirmed'),
				mode: createOfflineStorybookMode([storybookOptOutPolicy]),
			});
		},
		template: '<OptOutConfirmation disable-animation open />',
	}),
};

export const AccountCovered: Story = {
	play: expectRequestHonored,
	render: () => ({
		components: { OptOutConfirmation },
		setup() {
			setupStorybookOptOutConsent('none', {
				configOverrides: {
					disableAnimation: true,
					presentation: { optOutLink: 'do-not-sell' },
					reloadOnConsentRevoked: false,
				},
				initialRecords: storybookOptOutConfirmationRecords('account-covered'),
				mode: createOfflineStorybookMode([storybookOptOutPolicy]),
			});
		},
		template: '<OptOutConfirmation disable-animation open />',
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
		components: { ConsentDialogLink, ConsentManager },
		setup() {
			setupStorybookOptOutConsent('gpc', {
				configOverrides: {
					disableAnimation: true,
					presentation: { optOutLink: 'do-not-sell' },
					reloadOnConsentRevoked: false,
				},
				initialRecords: storybookOptOutConfirmationRecords('signal'),
				mode: createOfflineStorybookMode([storybookOptOutPolicy]),
			});
		},
		template:
			'<ConsentDialogLink right="opt-out" /><ConsentManager disable-animation />',
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
		components: { ConsentDialogLink, ConsentManager },
		setup() {
			setupStorybookOptOutConsent('none', {
				configOverrides: {
					disableAnimation: true,
					presentation: { optOutLink: 'do-not-sell' },
					reloadOnConsentRevoked: false,
				},
				initialRecords: storybookOptOutConfirmationRecords('account-adopted'),
				mode: createOfflineStorybookMode([storybookOptOutPolicy]),
			});
		},
		template:
			'<ConsentDialogLink right="opt-out" /><ConsentManager disable-animation />',
	}),
};
