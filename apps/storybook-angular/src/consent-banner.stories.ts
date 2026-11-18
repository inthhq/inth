import type { Meta, StoryObj } from '@analogjs/storybook-angular';
import { ConsentBanner } from '@c15t/angular';
import { ConsentDialog } from '@c15t/angular/consent-dialog';
import {
	bannerAcceptViaKeyboard,
	bannerContract,
	bannerFocusManagement,
	bannerToDialogFlow,
} from '@c15t/conformance/play/consent-banner';
import type { PromptPosition, PromptVariant } from '@c15t/core';

import { storybookMode, storybookPolicy } from '../../storybook-consent-policy';
import {
	consentApplication,
	editableConsentOptions,
} from './storybook-consent-fixtures';

interface BannerStoryArgs {
	includeDialog?: boolean;
	trapFocus?: boolean;
	notice?: boolean;
	variant?: PromptVariant;
	position?: PromptPosition;
	blocking?: boolean;
}

// A notice under an opt-out model: an opt-out link plus a primary Accept All.
const noticeOptions = {
	mode: storybookMode([
		{
			...storybookPolicy,
			id: 'storybook-notice',
			model: 'opt-out' as const,
			prompt: 'notice' as const,
		},
	]),
	presentation: undefined,
};

const meta = {
	parameters: {
		layout: 'fullscreen',
	},
	render: (args) => ({
		applicationConfig: consentApplication({
			options: args.notice
				? {
						...editableConsentOptions,
						trapFocus: args.trapFocus,
						...noticeOptions,
					}
				: { ...editableConsentOptions, trapFocus: args.trapFocus },
		}),
		moduleMetadata: {
			imports: [ConsentBanner, ConsentDialog],
		},
		props: args,
		template: `
			<c15t-consent-banner
				[trapFocus]="trapFocus"
				[variant]="variant"
				[position]="position"
				[blocking]="blocking"
			/>
			@if (includeDialog || notice) {
				<c15t-consent-dialog />
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
