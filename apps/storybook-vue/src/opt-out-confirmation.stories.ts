import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import ConsentDialogLink from '../../../packages/sdk/vue/src/runtime/components/consent-dialog-link.vue';
import ConsentManager from '../../../packages/sdk/vue/src/runtime/components/manager.vue';
import OptOutConfirmation from '../../../packages/sdk/vue/src/runtime/components/opt-out-confirmation.vue';
import ConsentBanner from '../../../packages/sdk/vue/src/runtime/components/prompt.vue';
import {
	storybookOptOutInit,
	useStorybookConsent as setupStorybookConsent,
} from './storybook-consent-fixtures';

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
	render: () => ({
		components: { ConsentBanner, ConsentManager },
		setup() {
			setupStorybookConsent(
				'banner',
				{
					disableAnimation: true,
					presentation: { optOutLink: 'do-not-sell' },
					reloadOnConsentRevoked: false,
				},
				storybookOptOutInit
			);
		},
		template:
			'<ConsentBanner disable-animation /><ConsentManager disable-animation />',
	}),
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
	render: () => ({
		components: { ConsentDialogLink, ConsentManager },
		setup() {
			const context = setupStorybookConsent(
				null,
				{
					disableAnimation: true,
					overrides: { gpc: true },
					presentation: { optOutLink: 'privacy-choices' },
					reloadOnConsentRevoked: false,
				},
				storybookOptOutInit
			);
			context.kernel.set.privacySignals({ gpc: true });
		},
		template:
			'<ConsentDialogLink right="opt-out" /><ConsentManager disable-animation />',
	}),
};
