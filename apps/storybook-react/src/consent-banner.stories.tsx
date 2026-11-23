import {
	bannerAcceptViaKeyboard,
	bannerContract,
	bannerFocusManagement,
	bannerToDialogFlow,
} from '@inth/conformance/play/consent-banner';
import type { Meta, StoryObj } from '@storybook/react-vite';

import type {
	ConsentContainer,
	ConsentEdgeStyle,
} from '../../../packages/sdk/core/src/libs/consent-layout';
import {
	ConsentBanner,
	ConsentDialog,
	PrivacyChoicesLink as PrivacyChoicesFooterLink,
} from '../../../packages/sdk/react/src/index';
import type { PolicyRule } from '../../../packages/sdk/schema/src/types';
import { storybookMode, storybookPolicy } from '../../storybook-consent-policy';
import {
	editableConsentOptions,
	StorybookConsentProvider,
} from './storybook-consent-fixtures';

type Region = 'eu' | 'us-opt-in' | 'us-notice';

const US_GPC = { gpc: { denyCategories: ['marketing', 'measurement'] } };

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

/** A plain page under the prompt, with the persistent "Your Privacy Choices" link. */
const DemoPage = () => (
	<main
		style={{
			fontFamily: 'system-ui, sans-serif',
			lineHeight: 1.6,
			margin: '0 auto',
			maxWidth: 720,
			minHeight: '160vh',
			padding: '48px 24px',
		}}
	>
		<h1>Acme Outdoor</h1>
		<p>
			Tents, packs and stoves for every season. Browse the catalogue, read the
			field guides, or find a store near you.
		</p>
		<p>
			<a href="#catalogue">Catalogue</a> · <a href="#guides">Field guides</a>
		</p>
		<footer style={{ marginTop: 48 }}>
			<PrivacyChoicesFooterLink />
		</footer>
	</main>
);

const containerStory = function containerStory(
	region: Region,
	container: ConsentContainer,
	options: { blockUntilChoice?: boolean; edgeStyle?: ConsentEdgeStyle } = {}
): Story {
	return {
		render: () => (
			<StorybookConsentProvider
				options={{
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
				}}
			>
				<DemoPage />
				<ConsentBanner />
			</StorybookConsentProvider>
		),
	};
};

const meta = {
	component: ConsentBanner,
	parameters: {
		layout: 'fullscreen',
	},
	title: 'COMPONENTS - REACT/Core/Consent Banner',
} satisfies Meta<typeof ConsentBanner>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	render: () => (
		<StorybookConsentProvider options={editableConsentOptions}>
			<ConsentBanner />
		</StorybookConsentProvider>
	),
};

export const BannerToDialogFlow: Story = {
	play: bannerToDialogFlow,
	render: () => (
		<StorybookConsentProvider options={editableConsentOptions}>
			<ConsentBanner />
			<ConsentDialog />
		</StorybookConsentProvider>
	),
};

export const BannerContract: Story = { ...Default, play: bannerContract };
export const BannerAcceptViaKeyboard: Story = {
	...Default,
	play: bannerAcceptViaKeyboard,
};
export const BannerFocusManagement: Story = {
	play: bannerFocusManagement,
	render: () => (
		<StorybookConsentProvider options={editableConsentOptions}>
			<ConsentBanner blockUntilChoice />
		</StorybookConsentProvider>
	),
};

/**
 * The stock `ConsentBanner`: the core stories the conformance plays drive,
 * then every Card, Banner and Drawer placement for the EU choice, the US
 * opt-in request and the US notice, plus the blocking and flush variants.
 * Each story resolves its policy offline, so the static build works
 * without a backend.
 */

/**
 * A notice prompt under an opt-out model: a primary "Accept All" that records
 * a dismissal, beside an underlined "Do Not Sell or Share My Personal Information"
 * text control that opens the preference center.
 */
export const Notice: Story = {
	render: () => (
		<StorybookConsentProvider
			options={{
				...editableConsentOptions,
				mode: storybookMode([
					{
						...storybookPolicy,
						id: 'storybook-notice',
						model: 'opt-out',
						prompt: 'notice',
					},
				]),
				presentation: undefined,
			}}
		>
			<ConsentBanner />
			<ConsentDialog />
		</StorybookConsentProvider>
	),
};

/** Notice banner with the statutory opt-out link. */
export const OptOutLink: Story = {
	render: () => (
		<StorybookConsentProvider
			options={{
				...editableConsentOptions,
				mode: storybookMode([
					{
						...storybookPolicy,
						id: 'storybook-opt-out-link',
						model: 'opt-out',
						prompt: 'notice',
						rights: ['opt-out', 'preferences'],
					},
				]),
				presentation: { optOutLink: 'do-not-sell' },
			}}
		>
			<ConsentBanner disableAnimation />
			<ConsentDialog disableAnimation />
		</StorybookConsentProvider>
	),
};

/** Notice banner with the Privacy Choices link and CPPA opt-out icon. */
export const PrivacyChoicesLink: Story = {
	render: () => (
		<StorybookConsentProvider
			options={{
				...editableConsentOptions,
				mode: storybookMode([
					{
						...storybookPolicy,
						id: 'storybook-privacy-choices-link',
						model: 'opt-out',
						prompt: 'notice',
						rights: ['opt-out', 'preferences'],
					},
				]),
				presentation: { optOutLink: 'privacy-choices' },
			}}
		>
			<ConsentBanner disableAnimation />
			<ConsentDialog disableAnimation />
		</StorybookConsentProvider>
	),
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
	{
		blockUntilChoice: true,
	}
);
export const BlockingBanner: Story = containerStory(
	'eu',
	{ edge: 'bottom', type: 'banner' },
	{
		blockUntilChoice: true,
	}
);
export const BlockingDrawerBottom: Story = containerStory(
	'eu',
	{ side: 'bottom', type: 'drawer' },
	{
		blockUntilChoice: true,
	}
);
export const BlockingDrawerStart: Story = containerStory(
	'eu',
	{ side: 'start', type: 'drawer' },
	{
		blockUntilChoice: true,
	}
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
