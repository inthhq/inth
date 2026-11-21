import type { Meta, StoryObj } from '@analogjs/storybook-angular';
import { ConsentBanner, ConsentDialogLink } from '@inth/angular';
import { ConsentDialog } from '@inth/angular/consent-dialog';
import type { OptOutLinkVariant } from '@inth/sdk/engine';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import {
	storybookMode,
	storybookOptOutPolicy,
} from '../../storybook-consent-policy';
import {
	consentApplication,
	editableConsentOptions,
} from './storybook-consent-fixtures';

interface OptOutConfirmationArgs {
	gpc: boolean;
	optOutLink: OptOutLinkVariant;
}

const meta = {
	parameters: {
		layout: 'fullscreen',
	},
	render: (args) => ({
		applicationConfig: consentApplication({
			options: {
				...editableConsentOptions,
				disableAnimation: true,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', gpc: args.gpc, region: 'CA' },
				presentation: { optOutLink: args.optOutLink },
			},
		}),
		moduleMetadata: {
			imports: [ConsentBanner, ConsentDialog, ConsentDialogLink],
		},
		template: args.gpc
			? `
			<button inthConsentDialogLink [right]="'opt-out'" type="button"></button>
			<inth-consent-dialog [disableAnimation]="true" />
		`
			: `
			<inth-consent-banner [disableAnimation]="true" />
			<inth-consent-dialog [disableAnimation]="true" />
		`,
	}),
	title: 'COMPONENTS - ANGULAR/Core/Opt Out Confirmation',
} satisfies Meta<OptOutConfirmationArgs>;

export default meta;

type Story = StoryObj<OptOutConfirmationArgs>;

export const RequestHonored: Story = {
	args: {
		gpc: false,
		optOutLink: 'do-not-sell',
	},
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
};

export const SignalHonored: Story = {
	args: {
		gpc: true,
		optOutLink: 'privacy-choices',
	},
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
};
