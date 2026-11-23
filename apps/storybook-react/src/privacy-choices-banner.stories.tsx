/**
 * The stock `ConsentBanner` in the Privacy Choices design
 * (`design: 'privacy-choices'`): every Card, Banner and Drawer placement
 * for the EU choice, the US opt-in request and the US notice, plus the
 * blocking and flush variants. Each story resolves its policy offline,
 * like the other stories, so the static build works without a backend.
 *
 * React only for now: the parity runner lists `Privacy Choices/` in
 * `NOT_YET_PORTED` until the other adapters render this design.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';

import type {
	ConsentContainer,
	ConsentEdgeStyle,
} from '../../../packages/sdk/core/src/libs/consent-layout';
import {
	ConsentBanner,
	PrivacyChoicesLink,
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
			<PrivacyChoicesLink />
		</footer>
	</main>
);

const privacyChoicesStory = function privacyChoicesStory(
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
						design: 'privacy-choices',
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
	title: 'COMPONENTS - REACT/Privacy Choices/Banner',
} satisfies Meta<typeof ConsentBanner>;

export default meta;

type Story = StoryObj<typeof meta>;

export const CardStartEU: Story = privacyChoicesStory('eu', {
	position: 'start',
	type: 'card',
});
export const CardStartUsOptIn: Story = privacyChoicesStory('us-opt-in', {
	position: 'start',
	type: 'card',
});
export const CardStartUsNotice: Story = privacyChoicesStory('us-notice', {
	position: 'start',
	type: 'card',
});

export const CardEndEU: Story = privacyChoicesStory('eu', {
	position: 'end',
	type: 'card',
});
export const CardEndUsOptIn: Story = privacyChoicesStory('us-opt-in', {
	position: 'end',
	type: 'card',
});
export const CardEndUsNotice: Story = privacyChoicesStory('us-notice', {
	position: 'end',
	type: 'card',
});

export const CardCenterEU: Story = privacyChoicesStory('eu', {
	position: 'center',
	type: 'card',
});
export const CardCenterUsOptIn: Story = privacyChoicesStory('us-opt-in', {
	position: 'center',
	type: 'card',
});
export const CardCenterUsNotice: Story = privacyChoicesStory('us-notice', {
	position: 'center',
	type: 'card',
});

export const BannerBottomEU: Story = privacyChoicesStory('eu', {
	edge: 'bottom',
	type: 'banner',
});
export const BannerBottomUsOptIn: Story = privacyChoicesStory('us-opt-in', {
	edge: 'bottom',
	type: 'banner',
});
export const BannerBottomUsNotice: Story = privacyChoicesStory('us-notice', {
	edge: 'bottom',
	type: 'banner',
});

export const BannerTopEU: Story = privacyChoicesStory('eu', {
	edge: 'top',
	type: 'banner',
});
export const BannerTopUsOptIn: Story = privacyChoicesStory('us-opt-in', {
	edge: 'top',
	type: 'banner',
});
export const BannerTopUsNotice: Story = privacyChoicesStory('us-notice', {
	edge: 'top',
	type: 'banner',
});

export const DrawerBottomEU: Story = privacyChoicesStory('eu', {
	side: 'bottom',
	type: 'drawer',
});
export const DrawerBottomUsOptIn: Story = privacyChoicesStory('us-opt-in', {
	side: 'bottom',
	type: 'drawer',
});
export const DrawerBottomUsNotice: Story = privacyChoicesStory('us-notice', {
	side: 'bottom',
	type: 'drawer',
});

export const DrawerTopEU: Story = privacyChoicesStory('eu', {
	side: 'top',
	type: 'drawer',
});
export const DrawerTopUsOptIn: Story = privacyChoicesStory('us-opt-in', {
	side: 'top',
	type: 'drawer',
});
export const DrawerTopUsNotice: Story = privacyChoicesStory('us-notice', {
	side: 'top',
	type: 'drawer',
});

export const DrawerStartEU: Story = privacyChoicesStory('eu', {
	side: 'start',
	type: 'drawer',
});
export const DrawerStartUsOptIn: Story = privacyChoicesStory('us-opt-in', {
	side: 'start',
	type: 'drawer',
});
export const DrawerStartUsNotice: Story = privacyChoicesStory('us-notice', {
	side: 'start',
	type: 'drawer',
});

export const DrawerEndEU: Story = privacyChoicesStory('eu', {
	side: 'end',
	type: 'drawer',
});
export const DrawerEndUsOptIn: Story = privacyChoicesStory('us-opt-in', {
	side: 'end',
	type: 'drawer',
});
export const DrawerEndUsNotice: Story = privacyChoicesStory('us-notice', {
	side: 'end',
	type: 'drawer',
});

export const BlockingCard: Story = privacyChoicesStory(
	'eu',
	{ position: 'start', type: 'card' },
	{
		blockUntilChoice: true,
	}
);
export const BlockingBanner: Story = privacyChoicesStory(
	'eu',
	{ edge: 'bottom', type: 'banner' },
	{
		blockUntilChoice: true,
	}
);
export const BlockingDrawerBottom: Story = privacyChoicesStory(
	'eu',
	{ side: 'bottom', type: 'drawer' },
	{
		blockUntilChoice: true,
	}
);
export const BlockingDrawerStart: Story = privacyChoicesStory(
	'eu',
	{ side: 'start', type: 'drawer' },
	{
		blockUntilChoice: true,
	}
);
export const FlushBannerBottom: Story = privacyChoicesStory(
	'eu',
	{ edge: 'bottom', type: 'banner' },
	{ edgeStyle: 'flush' }
);
export const FlushDrawerBottom: Story = privacyChoicesStory(
	'eu',
	{ side: 'bottom', type: 'drawer' },
	{ edgeStyle: 'flush' }
);
