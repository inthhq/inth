import type { Meta, StoryObj } from '@analogjs/storybook-angular';
import { ConsentBanner } from '@inth/angular';
import { ConsentDialog } from '@inth/angular/consent-dialog';
import {
	dialogContract,
	dialogEscapeCloses,
	saveFlow,
} from '@inth/conformance/play/consent-dialog';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import {
	STORYBOOK_OPT_OUT_REFERENCE,
	storybookMode,
	storybookOptOutPolicy,
	storybookOptOutPolicyResolution,
	storybookOptOutRecords,
} from '../../storybook-consent-policy';
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

const openDialogTemplate = `<inth-consent-dialog [disableAnimation]="true" [open]="true" />`;

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
				<inth-consent-banner [trapFocus]="trapFocus" />
			}
			<inth-consent-dialog [open]="open" />
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

/** Opt-out policy before the visitor opts out. */
export const OptOutNotOptedOut: Story = {
	render: () => ({
		applicationConfig: consentApplication({
			options: {
				...editableConsentOptions,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', gpc: false, region: 'CA' },
				prefetch: {
					initialPolicyResolution: storybookOptOutPolicyResolution,
				},
				presentation: { optOutLink: 'do-not-sell' },
			},
		}),
		moduleMetadata: {
			imports: [ConsentDialog],
		},
		template: openDialogTemplate,
	}),
};

/** Opted out by a click before backend rights confirmation. */
export const OptOutHonoredByRequest: Story = {
	render: () => ({
		applicationConfig: consentApplication({
			options: {
				...editableConsentOptions,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', gpc: false, region: 'CA' },
				prefetch: {
					initialPolicyResolution: storybookOptOutPolicyResolution,
					initialRecords: {
						...storybookOptOutRecords('request'),
						optOutReference: STORYBOOK_OPT_OUT_REFERENCE,
					},
				},
				presentation: { optOutLink: 'do-not-sell' },
			},
		}),
		moduleMetadata: {
			imports: [ConsentDialog],
		},
		template: openDialogTemplate,
	}),
};

/** Opted out with sale and sharing confirmed by the backend. */
export const OptOutConfirmedSaleAndShare: Story = {
	render: () => ({
		applicationConfig: consentApplication({
			options: {
				...editableConsentOptions,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', gpc: false, region: 'CA' },
				prefetch: {
					initialPolicyResolution: storybookOptOutPolicyResolution,
					initialRecords: {
						...storybookOptOutRecords('request'),
						optOutReference: STORYBOOK_OPT_OUT_REFERENCE,
						optOutRightsConfirmed: true,
					},
				},
				presentation: { optOutLink: 'do-not-sell' },
			},
		}),
		moduleMetadata: {
			imports: [ConsentDialog],
		},
		template: openDialogTemplate,
	}),
};

/** Opted out by an active GPC signal; no opt-in link is shown. */
export const OptOutGpcLocked: Story = {
	play: async () => {
		await within(document.body).findByTestId('consent-widget-opt-out-status');
		await expect(
			within(document.body).queryByTestId('consent-widget-opt-in-link')
		).toBeNull();
	},
	render: () => ({
		applicationConfig: consentApplication({
			options: {
				...editableConsentOptions,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', gpc: true, region: 'CA' },
				prefetch: {
					initialPolicyResolution: storybookOptOutPolicyResolution,
					initialPrivacySignals: { gpc: true },
					initialRecords: storybookOptOutRecords('gpc'),
				},
				presentation: { optOutLink: 'privacy-choices' },
			},
		}),
		moduleMetadata: {
			imports: [ConsentDialog],
		},
		template: openDialogTemplate,
	}),
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
	render: () => ({
		applicationConfig: consentApplication({
			options: {
				...editableConsentOptions,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', gpc: false, region: 'CA' },
				prefetch: {
					initialPolicyResolution: storybookOptOutPolicyResolution,
					initialRecords: {
						...storybookOptOutRecords('request'),
						optOutReference: STORYBOOK_OPT_OUT_REFERENCE,
					},
				},
				presentation: { optOutLink: 'do-not-sell' },
			},
		}),
		moduleMetadata: {
			imports: [ConsentDialog],
		},
		template: openDialogTemplate,
	}),
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
	render: () => ({
		applicationConfig: consentApplication({
			options: {
				...editableConsentOptions,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', gpc: false, region: 'CA' },
				prefetch: {
					initialPolicyResolution: storybookOptOutPolicyResolution,
					initialRecords: {
						...storybookOptOutRecords('request'),
						optOutReference: STORYBOOK_OPT_OUT_REFERENCE,
						optOutRightsConfirmed: true,
					},
				},
				presentation: { optOutLink: 'do-not-sell' },
			},
		}),
		moduleMetadata: {
			imports: [ConsentDialog],
		},
		template: openDialogTemplate,
	}),
};
