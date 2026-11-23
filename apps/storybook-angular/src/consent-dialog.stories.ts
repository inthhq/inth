/**
 * The stock `<inth-consent-dialog>`: the core stories the conformance plays
 * drive and the opt-out and opt-in confirmation states, then the "Your
 * Privacy Choices" dialog for the US opt-out and opt-in regimes, the US
 * with a Global Privacy Control signal, the EU, and the phone sheets. The
 * "full flow" stories start on the banner; its page link opens the
 * dialog. The story names match React's, so the parity runner pairs them.
 * Each story resolves its policy offline, so the static build works
 * without a backend.
 */
import type { Meta, StoryObj } from '@analogjs/storybook-angular';
import { ConsentBanner, PrivacyChoicesLink } from '@inth/angular';
import { ConsentDialog } from '@inth/angular/consent-dialog';
import {
	dialogContract,
	dialogEscapeCloses,
	optInConfirmation,
	optInConfirmationConfirmedRights,
	optOutGpcLocked,
	saveFlow,
} from '@inth/conformance/play/consent-dialog';
import type { ConsentContainer, PolicyRule } from '@inth/sdk/engine';
import { expect, waitFor, within } from 'storybook/test';

import {
	STORYBOOK_OPT_OUT_REFERENCE,
	storybookMode,
	storybookOptOutPolicy,
	storybookOptOutPolicyResolution,
	storybookOptOutRecords,
	storybookPolicy,
	storybookVendors,
} from '../../storybook-consent-policy';
import {
	demoPage,
	StorybookOpenDialog,
	StorybookSettingsLink,
	US_GPC,
} from './story-page';
import {
	consentApplication,
	editableConsentOptions,
	editableStoredConsent,
} from './storybook-consent-fixtures';

interface DialogStoryArgs {
	open?: boolean;
	withBanner?: boolean;
	useStoredConsent?: boolean;
}

const openDialogTemplate = `<inth-consent-dialog [disableAnimation]="true" [open]="true" />`;

type Region = 'eu' | 'us-opt-in' | 'us-notice' | 'us-opt-out';

const US_RIGHTS: PolicyRule['rights'] = [
	'disclosure',
	'preferences',
	'opt-out',
];

/** One offline rule per regime (§2). */
const POLICIES: Record<Region, PolicyRule> = {
	eu: { ...storybookPolicy, id: 'storybook-privacy-choices-dialog-eu' },
	'us-notice': {
		...storybookPolicy,
		id: 'storybook-privacy-choices-dialog-us-notice',
		model: 'opt-out',
		privacySignals: US_GPC,
		prompt: 'notice',
		rights: US_RIGHTS,
	},
	'us-opt-in': {
		...storybookPolicy,
		id: 'storybook-privacy-choices-dialog-us-opt-in',
		privacySignals: US_GPC,
		rights: US_RIGHTS,
	},
	'us-opt-out': {
		...storybookPolicy,
		id: 'storybook-privacy-choices-dialog-us-opt-out',
		model: 'opt-out',
		privacySignals: US_GPC,
		prompt: 'none',
		rights: US_RIGHTS,
	},
};

/** The page links each region shows. */
const pageLinks = (region: Region): string => {
	if (region === 'eu') {
		return '<storybook-settings-link label="Privacy settings" />';
	}
	if (region === 'us-opt-in') {
		return '<storybook-settings-link label="Your Privacy Choices" />';
	}
	return '<inth-privacy-choices-link />';
};

interface DialogStoryOptions {
	/** Start on the banner instead of the open dialog. */
	flow?: boolean;
	container?: ConsentContainer;
	gpc?: boolean;
	phone?: boolean;
	edgeStyle?: 'inset' | 'flush';
}

const meta = {
	parameters: {
		layout: 'fullscreen',
	},
	render: (args) => ({
		applicationConfig: consentApplication({
			options: editableConsentOptions,
			storedConsent: args.useStoredConsent ? editableStoredConsent : undefined,
		}),
		moduleMetadata: {
			imports: [ConsentBanner, ConsentDialog, PrivacyChoicesLink],
		},
		props: args,
		// With the banner, the page's "Your Privacy Choices" link opens the
		// dialog.
		template: `
			@if (withBanner) {
				<inth-privacy-choices-link />
				<inth-consent-banner />
			}
			<inth-consent-dialog [open]="open" />
		`,
	}),
	title: 'COMPONENTS - ANGULAR/Core/Consent Dialog',
} satisfies Meta<DialogStoryArgs>;

export default meta;

type Story = StoryObj<DialogStoryArgs>;

const dialogStory = function dialogStory(
	region: Region,
	options: DialogStoryOptions = {}
): Story {
	const story: Story = {
		render: () => ({
			applicationConfig: consentApplication({
				options: {
					...editableConsentOptions,
					legalLinks: {
						cookiePolicy: { href: '#cookies' },
						privacyPolicy: { href: '#privacy' },
					},
					mode: storybookMode([POLICIES[region]]),
					presentation: {
						prompt: {
							container: options.container ?? {
								position: 'start',
								type: 'card',
							},
							edgeStyle: options.edgeStyle,
						},
					},
					vendors: storybookVendors,
				},
			}),
			moduleMetadata: {
				imports: [
					ConsentBanner,
					ConsentDialog,
					StorybookOpenDialog,
					PrivacyChoicesLink,
					StorybookSettingsLink,
				],
			},
			template: `${demoPage(pageLinks(region), 'dialog')}<inth-consent-banner /><inth-consent-dialog />${
				options.flow ? '' : '<storybook-open-dialog />'
			}`,
		}),
	};
	if (options.gpc) {
		// The signal must be on before the provider reads it.
		story.beforeEach = () => {
			const previous = Object.getOwnPropertyDescriptor(
				navigator,
				'globalPrivacyControl'
			);
			Object.defineProperty(navigator, 'globalPrivacyControl', {
				configurable: true,
				value: true,
			});
			return () => {
				if (previous) {
					Object.defineProperty(navigator, 'globalPrivacyControl', previous);
				} else {
					Reflect.deleteProperty(navigator, 'globalPrivacyControl');
				}
			};
		};
	}
	if (options.phone) {
		story.globals = { viewport: { isRotated: false, value: 'mobile2' } };
	}
	return story;
};

export const Default: Story = {
	args: {
		open: true,
		useStoredConsent: true,
	},
	play: async () => {
		const card = await within(document.body).findByTestId(
			'consent-dialog-card'
		);
		await waitFor(() => expect(getComputedStyle(card).opacity).toBe('1'));
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

/** Opted out by an active GPC signal; Allow is unavailable while it is on. */
export const OptOutGpcLocked: Story = {
	play: optOutGpcLocked,
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

/** Two-step opt-in: Allow on the sale-and-sharing row asks first. */
export const OptInConfirmation: Story = {
	play: optInConfirmation,
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
	play: optInConfirmationConfirmedRights,
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

export const UsOptOut: Story = dialogStory('us-opt-out');
export const UsOptIn: Story = dialogStory('us-opt-in');
export const UsWithGpc: Story = dialogStory('us-opt-out', { gpc: true });
export const EU: Story = dialogStory('eu');

export const PhoneUsPreferencesSheet: Story = dialogStory('us-opt-out', {
	phone: true,
});
export const PhoneEuVendorSheets: Story = dialogStory('eu', { phone: true });
export const PhoneFlushSheets: Story = dialogStory('us-opt-in', {
	edgeStyle: 'flush',
	phone: true,
});

export const FullFlowEU: Story = dialogStory('eu', { flow: true });
export const FullFlowUsOptIn: Story = dialogStory('us-opt-in', { flow: true });
export const FullFlowUsNotice: Story = dialogStory('us-notice', {
	container: { edge: 'bottom', type: 'banner' },
	flow: true,
});
