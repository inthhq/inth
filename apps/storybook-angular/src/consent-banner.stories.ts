/**
 * The stock `<inth-consent-banner>`: the core stories the conformance
 * plays drive, then every Card, Banner and Drawer placement for the EU
 * choice, the US opt-in request and the US notice, plus the blocking and
 * flush variants. The story names match React's, so the parity runner
 * pairs them. Each story resolves its policy offline, so the static build
 * works without a backend.
 */
import type { Meta, StoryObj } from '@analogjs/storybook-angular';
import {
	ConsentBanner,
	PrivacyChoicesLink as PrivacyChoicesFooterLink,
} from '@inth/angular';
import { ConsentDialog } from '@inth/angular/consent-dialog';
import {
	bannerAcceptViaKeyboard,
	bannerContract,
	bannerFocusManagement,
	bannerToDialogFlow,
} from '@inth/conformance/play/consent-banner';
import type {
	ConsentContainer,
	ConsentEdgeStyle,
	OptOutLinkVariant,
	PolicyRule,
} from '@inth/sdk/engine';

import { storybookMode, storybookPolicy } from '../../storybook-consent-policy';
import { demoPage, US_GPC } from './story-page';
import {
	consentApplication,
	editableConsentOptions,
} from './storybook-consent-fixtures';

interface BannerStoryArgs {
	includeDialog?: boolean;
	blockUntilChoice?: boolean;
	notice?: boolean;
	optOutLink?: OptOutLinkVariant;
	disableAnimation?: boolean;
}

/** The notice rule, with the opt-out right when a link variant is shown. */
const noticePolicy = (optOutLink?: OptOutLinkVariant): PolicyRule => {
	const policy: PolicyRule = {
		...storybookPolicy,
		id: 'storybook-notice',
		model: 'opt-out',
		prompt: 'notice',
	};
	if (optOutLink) {
		policy.id = `storybook-${optOutLink === 'do-not-sell' ? 'opt-out' : optOutLink}-link`;
		policy.rights = ['opt-out', 'preferences'];
	}
	return policy;
};

const noticeOptionsFor = (optOutLink?: OptOutLinkVariant) => ({
	mode: storybookMode([noticePolicy(optOutLink)]),
	presentation: optOutLink ? { optOutLink } : undefined,
});

type Region = 'eu' | 'us-opt-in' | 'us-notice';

/** One offline rule per first layer (§2). */
const POLICIES: Record<Region, PolicyRule> = {
	eu: { ...storybookPolicy, id: 'storybook-privacy-choices-eu' },
	'us-notice': {
		...storybookPolicy,
		id: 'storybook-privacy-choices-us-notice',
		model: 'opt-out',
		privacySignals: US_GPC,
		prompt: 'notice',
		rights: ['disclosure', 'preferences', 'opt-out'],
	},
	'us-opt-in': {
		...storybookPolicy,
		id: 'storybook-privacy-choices-us-opt-in',
		privacySignals: US_GPC,
	},
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
						disableAnimation: args.disableAnimation,
						...noticeOptionsFor(args.optOutLink),
					}
				: {
						...editableConsentOptions,
						disableAnimation: args.disableAnimation,
					},
		}),
		moduleMetadata: {
			imports: [ConsentBanner, ConsentDialog],
		},
		props: args,
		template: `
			<inth-consent-banner
				[disableAnimation]="disableAnimation"
				[blockUntilChoice]="blockUntilChoice"
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

const containerStory = function containerStory(
	region: Region,
	container: ConsentContainer,
	options: { blockUntilChoice?: boolean; edgeStyle?: ConsentEdgeStyle } = {}
): Story {
	return {
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
							blockUntilChoice: options.blockUntilChoice,
							container,
							edgeStyle: options.edgeStyle,
						},
					},
				},
			}),
			moduleMetadata: {
				imports: [ConsentBanner, PrivacyChoicesFooterLink],
			},
			template: `${demoPage(
				'<inth-privacy-choices-link />'
			)}<inth-consent-banner />`,
		}),
	};
};

export const Default: Story = {};

export const BannerToDialogFlow: Story = {
	args: {
		includeDialog: true,
	},
	play: bannerToDialogFlow,
};

export const BannerContract: Story = {
	play: bannerContract,
};

export const BannerAcceptViaKeyboard: Story = {
	play: bannerAcceptViaKeyboard,
};

export const BannerFocusManagement: Story = {
	args: {
		blockUntilChoice: true,
	},
	play: bannerFocusManagement,
};

/**
 * A notice prompt under an opt-out model: a primary "Accept All" that
 * records a dismissal, beside "Your Privacy Choices", which opens the
 * options in place.
 */
export const Notice: Story = {
	args: {
		notice: true,
	},
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
export const CardStartEU: Story = containerStory('eu', {
	position: 'start',
	type: 'card',
});
export const CardStartUsOptIn: Story = containerStory('us-opt-in', {
	position: 'start',
	type: 'card',
});
export const CardStartUsNotice: Story = containerStory('us-notice', {
	position: 'start',
	type: 'card',
});

export const CardEndEU: Story = containerStory('eu', {
	position: 'end',
	type: 'card',
});
export const CardEndUsOptIn: Story = containerStory('us-opt-in', {
	position: 'end',
	type: 'card',
});
export const CardEndUsNotice: Story = containerStory('us-notice', {
	position: 'end',
	type: 'card',
});

export const CardCenterEU: Story = containerStory('eu', {
	position: 'center',
	type: 'card',
});
export const CardCenterUsOptIn: Story = containerStory('us-opt-in', {
	position: 'center',
	type: 'card',
});
export const CardCenterUsNotice: Story = containerStory('us-notice', {
	position: 'center',
	type: 'card',
});

export const BannerBottomEU: Story = containerStory('eu', {
	edge: 'bottom',
	type: 'banner',
});
export const BannerBottomUsOptIn: Story = containerStory('us-opt-in', {
	edge: 'bottom',
	type: 'banner',
});
export const BannerBottomUsNotice: Story = containerStory('us-notice', {
	edge: 'bottom',
	type: 'banner',
});

export const BannerTopEU: Story = containerStory('eu', {
	edge: 'top',
	type: 'banner',
});
export const BannerTopUsOptIn: Story = containerStory('us-opt-in', {
	edge: 'top',
	type: 'banner',
});
export const BannerTopUsNotice: Story = containerStory('us-notice', {
	edge: 'top',
	type: 'banner',
});

export const DrawerBottomEU: Story = containerStory('eu', {
	side: 'bottom',
	type: 'drawer',
});
export const DrawerBottomUsOptIn: Story = containerStory('us-opt-in', {
	side: 'bottom',
	type: 'drawer',
});
export const DrawerBottomUsNotice: Story = containerStory('us-notice', {
	side: 'bottom',
	type: 'drawer',
});

export const DrawerTopEU: Story = containerStory('eu', {
	side: 'top',
	type: 'drawer',
});
export const DrawerTopUsOptIn: Story = containerStory('us-opt-in', {
	side: 'top',
	type: 'drawer',
});
export const DrawerTopUsNotice: Story = containerStory('us-notice', {
	side: 'top',
	type: 'drawer',
});

export const DrawerStartEU: Story = containerStory('eu', {
	side: 'start',
	type: 'drawer',
});
export const DrawerStartUsOptIn: Story = containerStory('us-opt-in', {
	side: 'start',
	type: 'drawer',
});
export const DrawerStartUsNotice: Story = containerStory('us-notice', {
	side: 'start',
	type: 'drawer',
});

export const DrawerEndEU: Story = containerStory('eu', {
	side: 'end',
	type: 'drawer',
});
export const DrawerEndUsOptIn: Story = containerStory('us-opt-in', {
	side: 'end',
	type: 'drawer',
});
export const DrawerEndUsNotice: Story = containerStory('us-notice', {
	side: 'end',
	type: 'drawer',
});

export const BlockingCard: Story = containerStory(
	'eu',
	{ position: 'start', type: 'card' },
	{ blockUntilChoice: true }
);
export const BlockingBanner: Story = containerStory(
	'eu',
	{ edge: 'bottom', type: 'banner' },
	{ blockUntilChoice: true }
);
export const BlockingDrawerBottom: Story = containerStory(
	'eu',
	{ side: 'bottom', type: 'drawer' },
	{ blockUntilChoice: true }
);
export const BlockingDrawerStart: Story = containerStory(
	'eu',
	{ side: 'start', type: 'drawer' },
	{ blockUntilChoice: true }
);
export const FlushBannerBottom: Story = containerStory(
	'eu',
	{ edge: 'bottom', type: 'banner' },
	{ edgeStyle: 'flush' }
);
export const FlushDrawerBottom: Story = containerStory(
	'eu',
	{ side: 'bottom', type: 'drawer' },
	{ edgeStyle: 'flush' }
);
