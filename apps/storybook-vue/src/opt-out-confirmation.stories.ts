import {
	accountAdopted,
	signalHonored,
} from '@inth/conformance/play/opt-out-confirmation';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { expect, waitFor, within } from 'storybook/test';

import ConsentDialogLink from '../../../packages/sdk/vue/src/runtime/components/consent-dialog-link.vue';
import ConsentDialog from '../../../packages/sdk/vue/src/runtime/components/dialog/manager.vue';
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
	play: signalHonored,
	render: () => ({
		components: { ConsentDialog, ConsentDialogLink },
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
			'<ConsentDialogLink right="opt-out" /><ConsentDialog disable-animation />',
	}),
};

export const AccountAdopted: Story = {
	play: accountAdopted,
	render: () => ({
		components: { ConsentDialog, ConsentDialogLink },
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
			'<ConsentDialogLink right="opt-out" /><ConsentDialog disable-animation />',
	}),
};
