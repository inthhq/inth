import type { Meta, StoryObj } from '@analogjs/storybook-angular';
import { ConsentBanner } from '@c15t/angular';
import { ConsentDialog } from '@c15t/angular/consent-dialog';
import {
	dialogContract,
	dialogEscapeCloses,
	saveFlow,
} from '@c15t/conformance/play/consent-dialog';

import {
	consentApplication,
	editableConsentOptions,
	editableStoredConsent,
} from './storybook-consent-fixtures';

// `trapFocus` stays undefined by default: a legacy `false` maps to a
// non-blocking dialog, while the resolver's default is blocking. The
// Angular dialog reads it from the provider, so it is not an input.
interface DialogStoryArgs {
	open?: boolean;
	trapFocus?: boolean;
	withBanner?: boolean;
	useStoredConsent?: boolean;
}

const meta = {
	parameters: {
		layout: 'fullscreen',
	},
	render: (args) => ({
		applicationConfig: consentApplication({
			options: { ...editableConsentOptions, trapFocus: args.trapFocus },
			storedConsent: args.useStoredConsent ? editableStoredConsent : undefined,
		}),
		moduleMetadata: {
			imports: [ConsentBanner, ConsentDialog],
		},
		props: args,
		template: `
			@if (withBanner) {
				<c15t-consent-banner [trapFocus]="trapFocus" />
			}
			<c15t-consent-dialog [open]="open" />
		`,
	}),
	title: 'COMPONENTS - ANGULAR/Core/Consent Dialog',
} satisfies Meta<DialogStoryArgs>;

export default meta;

type Story = StoryObj<DialogStoryArgs>;

export const Default: Story = {
	args: {
		open: true,
		useStoredConsent: true,
	},
};

export const DialogContract: Story = {
	args: {
		withBanner: true,
	},
	play: dialogContract,
};

export const SaveFlow: Story = {
	args: {
		withBanner: true,
	},
	play: saveFlow,
};

export const DialogEscapeCloses: Story = {
	args: {
		withBanner: true,
	},
	play: dialogEscapeCloses,
};
