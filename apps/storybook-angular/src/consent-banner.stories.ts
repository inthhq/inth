import type { Meta, StoryObj } from '@analogjs/storybook-angular';
import { ConsentBanner } from '@inth/angular';
import { ConsentDialog } from '@inth/angular/consent-dialog';
import {
	bannerAcceptViaKeyboard,
	bannerContract,
	bannerFocusManagement,
	bannerToDialogFlow,
} from '@inth/conformance/play/consent-banner';
import type {
	OptOutLinkVariant,
	PromptPosition,
	PromptVariant,
} from '@inth/sdk/engine';

import { storybookMode, storybookPolicy } from '../../storybook-consent-policy';
import {
	consentApplication,
	editableConsentOptions,
} from './storybook-consent-fixtures';

interface BannerStoryArgs {
	includeDialog?: boolean;
	trapFocus?: boolean;
	notice?: boolean;
	optOutLink?: OptOutLinkVariant;
	disableAnimation?: boolean;
	variant?: PromptVariant;
	position?: PromptPosition;
	blocking?: boolean;
}

const noticeOptionsFor = (optOutLink?: OptOutLinkVariant) => ({
	mode: storybookMode([
		{
			...storybookPolicy,
			id: 'storybook-notice',
			model: 'opt-out' as const,
			prompt: 'notice' as const,
		},
	]),
	presentation: optOutLink ? { optOutLink } : undefined,
});

const meta = {
	parameters: {
		layout: 'fullscreen',
	},
	render: (args) => ({
		applicationConfig: consentApplication({
			options: args.notice
				? {
						...editableConsentOptions,
						disableAnimation: args.disableAnimation,
						trapFocus: args.trapFocus,
						...noticeOptionsFor(args.optOutLink),
					}
				: {
						...editableConsentOptions,
						disableAnimation: args.disableAnimation,
						trapFocus: args.trapFocus,
					},
		}),
		moduleMetadata: {
			imports: [ConsentBanner, ConsentDialog],
		},
		props: args,
		template: `
			<inth-consent-banner
				[disableAnimation]="disableAnimation"
				[trapFocus]="trapFocus"
				[variant]="variant"
				[position]="position"
				[blocking]="blocking"
			/>
			@if (includeDialog || notice) {
				<inth-consent-dialog [disableAnimation]="disableAnimation" />
			}
		`,
	}),
	title: 'COMPONENTS - ANGULAR/Core/Consent Banner',
} satisfies Meta<BannerStoryArgs>;

export default meta;

type Story = StoryObj<BannerStoryArgs>;

export const Default: Story = {};

export const Notice: Story = {
	args: {
		notice: true,
	},
};

/** Full-width edge bar pinned to the bottom of the viewport. */
export const Bar: Story = {
	args: {
		includeDialog: true,
		variant: 'bar',
	},
};

/** Compact chip in the bottom-right corner. */
export const Widget: Story = {
	args: {
		includeDialog: true,
		variant: 'widget',
	},
};

/** Centered blocking prompt: backdrop, scroll lock and focus trap. */
export const Wall: Story = {
	args: {
		includeDialog: true,
		variant: 'wall',
	},
};

/** The default card moved to the bottom center. */
export const FloatingBottomCenter: Story = {
	args: {
		includeDialog: true,
		position: 'bottom-center',
		variant: 'floating',
	},
};

export const BannerContract: Story = {
	play: bannerContract,
};

export const BannerToDialogFlow: Story = {
	args: {
		includeDialog: true,
	},
	play: bannerToDialogFlow,
};

export const BannerAcceptViaKeyboard: Story = {
	play: bannerAcceptViaKeyboard,
};

export const BannerFocusManagement: Story = {
	args: {
		trapFocus: true,
	},
	play: bannerFocusManagement,
};

/** Notice banner with the statutory opt-out link. */
export const OptOutLink: Story = {
	args: {
		disableAnimation: true,
		notice: true,
		optOutLink: 'do-not-sell',
	},
};

/** Notice banner with the Privacy Choices link and CPPA opt-out icon. */
export const PrivacyChoicesLink: Story = {
	args: {
		disableAnimation: true,
		notice: true,
		optOutLink: 'privacy-choices',
	},
};
